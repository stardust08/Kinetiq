"""
Tests for clinician availability and slot generation.

Slot generation is the part of this module most worth testing, because every way it can
be wrong produces a slot the clinic cannot honour: a time outside the clinician's hours,
a time during their leave, or a time they are already booked for on a different service.
A patient pays for each of those and then finds nobody there.

The three exclusions are tested separately rather than together, because a single
"returns free slots" test passes with any one of them missing.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from app.api.clinician.service import DEFAULT_WINDOW, ClinicianService
from app.core.exceptions import BadRequestException, ConflictException, ForbiddenException


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; nothing here touches a database."""
    yield


TARGET = date(2026, 3, 3)  # a Tuesday - weekday() == 1


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(
        TARGET.year, TARGET.month, TARGET.day, hour, minute, tzinfo=timezone.utc
    )


def window(day: int, start_hour: int, end_hour: int, active: bool = True):
    return SimpleNamespace(
        id=f"av_{day}_{start_hour}",
        dayOfWeek=day,
        startMinute=start_hour * 60,
        endMinute=end_hour * 60,
        isActive=active,
    )


def time_off(start: datetime, end: datetime):
    return SimpleNamespace(id="to_1", startAt=start, endAt=end, reason="leave")


def a_profile(
    *,
    availability: Optional[List[Any]] = None,
    time_off_entries: Optional[List[Any]] = None,
    slot_minutes: int = 60,
    max_daily: Optional[int] = None,
):
    """
    A complete profile double.

    Every field the serialiser reads is present, including the ones slot generation does
    not care about. A partial double here fails with an AttributeError from inside the
    serialiser, which reads as a product bug rather than as a gap in the test.
    """
    return SimpleNamespace(
        id="prof_1",
        userId="clin_1",
        specialisation="Musculoskeletal physiotherapy",
        qualifications="MSc",
        registrationNo="REG-1",
        yearsExperience=8,
        bio=None,
        languages="English,Hindi",
        consultationModes="video",
        isAcceptingPatients=True,
        timezone="Asia/Kolkata",
        slotDurationMinutes=slot_minutes,
        maxDailyBookings=max_daily,
        availability=availability if availability is not None else [],
        timeOff=time_off_entries or [],
    )


def a_clinician_user(profile=None):
    return SimpleNamespace(
        id="clin_1",
        name="Dr Example",
        email="clinician@example.com",
        phone="+10000000000",
        role="CLINICIAN",
        status="ACTIVE",
        profileImage=None,
        clinicianProfile=profile if profile is not None else a_profile(),
    )


class FakeTable:
    def __init__(self, record=None, rows=None):
        self.record = record
        self.rows = rows or []
        self.created: List[Dict] = []
        self.deleted: List[Dict] = []

    async def find_unique(self, **kwargs):
        return self.record

    async def find_first(self, **kwargs):
        return self.record

    async def find_many(self, **kwargs):
        return self.rows

    async def count(self, **kwargs):
        return len(self.rows)

    async def create(self, data: Dict, **kwargs):
        self.created.append(data)
        return SimpleNamespace(id=f"new_{len(self.created)}", **data)

    async def update(self, **kwargs):
        return self.record

    async def delete_many(self, **kwargs):
        self.deleted.append(kwargs)
        return len(self.rows)


class FakeDB:
    def __init__(self, *, profile=None, bookings=None, locks=None):
        self.clinicianprofile = FakeTable(profile)
        self.booking = FakeTable(rows=bookings or [])
        self.slotlock = FakeTable(rows=locks or [])
        self.clinicianavailability = FakeTable()
        self.cliniciantimeoff = FakeTable()
        # set_availability returns the refreshed profile, which reads the user row.
        self.user = FakeTable(a_clinician_user(profile))


@pytest.fixture
def patch_db(monkeypatch):
    def _install(db):
        monkeypatch.setattr("app.api.clinician.service.db", db, raising=False)
        return db

    return _install


CLINICIAN = SimpleNamespace(id="clin_1", role="CLINICIAN", status="ACTIVE")
OTHER_CLINICIAN = SimpleNamespace(id="clin_2", role="CLINICIAN", status="ACTIVE")
ADMIN = SimpleNamespace(id="admin_1", role="ADMIN", status="ACTIVE")


# ---------------------------------------------------------------------------
# Slot generation
# ---------------------------------------------------------------------------


class TestSlotsFromWeeklyHours:
    async def test_slots_are_generated_inside_the_configured_window(self, patch_db):
        patch_db(
            FakeDB(profile=a_profile(availability=[window(1, 9, 12)], slot_minutes=60))
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(9), at(10), at(11)]

    async def test_a_slot_that_would_overrun_the_window_is_not_offered(self, patch_db):
        """
        09:00-12:00 with a 90-minute appointment fits twice, not three times. Offering a
        10:30 start would book a patient into half an hour the clinician does not work.
        """
        patch_db(
            FakeDB(profile=a_profile(availability=[window(1, 9, 12)], slot_minutes=90))
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 90
        )

        assert slots == [at(9), at(10, 30)]

    async def test_two_windows_in_a_day_both_produce_slots(self, patch_db):
        """A morning clinic and an afternoon clinic, with a lunch break between."""
        patch_db(
            FakeDB(
                profile=a_profile(
                    availability=[window(1, 9, 11), window(1, 14, 16)],
                    slot_minutes=60,
                )
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(9), at(10), at(14), at(15)]
        assert at(12) not in slots, "lunch is not bookable"

    async def test_a_day_with_no_window_offers_nothing(self, patch_db):
        """
        The clinician works Mondays only. A Tuesday request must return nothing rather
        than falling back to the platform default - they have said when they work.
        """
        patch_db(
            FakeDB(profile=a_profile(availability=[window(0, 9, 17)], slot_minutes=60))
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == []

    async def test_an_inactive_window_is_ignored(self, patch_db):
        patch_db(
            FakeDB(
                profile=a_profile(
                    availability=[window(1, 9, 12, active=False)], slot_minutes=60
                )
            )
        )
        assert await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        ) == []

    async def test_a_clinician_who_has_never_set_hours_falls_back_to_the_default(
        self, patch_db
    ):
        """
        Distinct from the case above. No availability configured at all means the
        clinician has not used the feature, and they must not disappear from every
        booking page because of it.
        """
        patch_db(FakeDB(profile=a_profile(availability=[], slot_minutes=60)))

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots[0] == at(DEFAULT_WINDOW[0] // 60)
        assert slots[-1] == at(DEFAULT_WINDOW[1] // 60 - 1)

    async def test_a_clinician_with_no_profile_falls_back_to_the_default(self, patch_db):
        patch_db(FakeDB(profile=None))

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots, "a clinician without a profile must still be bookable"
        assert slots[0] == at(8)

    async def test_the_appointment_length_wins_over_the_clinicians_block(self, patch_db):
        """
        Regression test for overlapping offers.

        This used to work the other way round - the clinician's 30-minute block overrode
        the 60-minute service - and the result was 09:00 and 09:30 both on offer for an
        hour-long appointment. Booking the 09:30 one runs to 10:30, straight through the
        10:00 slot that was also offered, so the calendar sold the same time twice.
        """
        patch_db(
            FakeDB(profile=a_profile(availability=[window(1, 9, 11)], slot_minutes=30))
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(9), at(10)]

    async def test_the_clinicians_block_is_used_when_no_length_is_given(self, patch_db):
        """With no appointment length to honour, the clinician's own block applies."""
        patch_db(
            FakeDB(profile=a_profile(availability=[window(1, 9, 10)], slot_minutes=30))
        )

        slots = await ClinicianService.available_slots_for_clinician("clin_1", TARGET, 0)

        assert slots == [at(9), at(9, 30)]


class TestExclusions:
    async def test_time_off_removes_the_slots_it_covers(self, patch_db):
        patch_db(
            FakeDB(
                profile=a_profile(
                    availability=[window(1, 9, 13)],
                    time_off_entries=[time_off(at(10), at(12))],
                    slot_minutes=60,
                )
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(9), at(12)]

    async def test_a_naive_time_off_timestamp_does_not_break_the_comparison(
        self, patch_db
    ):
        """
        Postgres returns aware datetimes, several test doubles return naive ones, and
        comparing the two raises. Unhandled, that raise surfaces as "no slots available"
        rather than as an error anybody can see.
        """
        naive_start = datetime(TARGET.year, TARGET.month, TARGET.day, 10)
        naive_end = datetime(TARGET.year, TARGET.month, TARGET.day, 11)
        patch_db(
            FakeDB(
                profile=a_profile(
                    availability=[window(1, 9, 12)],
                    time_off_entries=[time_off(naive_start, naive_end)],
                    slot_minutes=60,
                )
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(9), at(11)]

    async def test_an_existing_appointment_removes_its_slot(self, patch_db):
        patch_db(
            FakeDB(
                profile=a_profile(availability=[window(1, 9, 12)], slot_minutes=60),
                bookings=[SimpleNamespace(id="bk_1", time=at(10))],
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert at(10) not in slots
        assert slots == [at(9), at(11)]

    async def test_a_booking_on_another_service_still_blocks_the_time(self, patch_db):
        """
        The bug a per-service availability check has. A clinician booked for a gait
        assessment at 10:00 is not free for a posture assessment at 10:00 - they are one
        person. The query is not filtered by service for exactly this reason.
        """
        patch_db(
            FakeDB(
                profile=a_profile(availability=[window(1, 9, 11)], slot_minutes=60),
                bookings=[
                    SimpleNamespace(id="bk_other_service", time=at(9)),
                ],
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(10)]

    async def test_a_live_hold_removes_its_slot(self, patch_db):
        patch_db(
            FakeDB(
                profile=a_profile(availability=[window(1, 9, 11)], slot_minutes=60),
                locks=[SimpleNamespace(id="lk_1", slotTime=at(9))],
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(10)]

    async def test_the_daily_ceiling_closes_the_day(self, patch_db):
        patch_db(
            FakeDB(
                profile=a_profile(
                    availability=[window(1, 9, 17)], slot_minutes=60, max_daily=2
                ),
                bookings=[
                    SimpleNamespace(id="bk_1", time=at(9)),
                    SimpleNamespace(id="bk_2", time=at(10)),
                ],
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [], "the clinician has hit their daily limit"

    async def test_below_the_daily_ceiling_the_day_stays_open(self, patch_db):
        patch_db(
            FakeDB(
                profile=a_profile(
                    availability=[window(1, 9, 12)], slot_minutes=60, max_daily=5
                ),
                bookings=[SimpleNamespace(id="bk_1", time=at(9))],
            )
        )

        slots = await ClinicianService.available_slots_for_clinician(
            "clin_1", TARGET, 60
        )

        assert slots == [at(10), at(11)]


# ---------------------------------------------------------------------------
# Setting availability
# ---------------------------------------------------------------------------


class TestSetAvailability:
    async def test_a_window_that_ends_before_it_starts_is_refused(self, patch_db):
        patch_db(FakeDB(profile=a_profile()))

        with pytest.raises(BadRequestException) as exc:
            await ClinicianService.set_availability(
                CLINICIAN, [{"dayOfWeek": 1, "startMinute": 720, "endMinute": 540}]
            )

        # The message names the day and the times, because a weekly grid has seven
        # places to look for the mistake.
        message = str(exc.value)
        assert "Tuesday" in message and "12:00" in message and "09:00" in message

    async def test_overlapping_windows_on_one_day_are_refused(self, patch_db):
        """
        Not harmful - generation would deduplicate - but the grid then shows two
        overlapping blocks and the clinician cannot tell which one they meant to edit.
        """
        patch_db(FakeDB(profile=a_profile()))

        with pytest.raises(BadRequestException) as exc:
            await ClinicianService.set_availability(
                CLINICIAN,
                [
                    {"dayOfWeek": 2, "startMinute": 540, "endMinute": 720},
                    {"dayOfWeek": 2, "startMinute": 660, "endMinute": 780},
                ],
            )
        assert "overlaps" in str(exc.value)
        assert "Wednesday" in str(exc.value)

    async def test_adjacent_windows_are_allowed(self, patch_db):
        """09:00-12:00 followed by 12:00-17:00 is a normal split, not an overlap."""
        db = patch_db(FakeDB(profile=a_profile()))

        await ClinicianService.set_availability(
            CLINICIAN,
            [
                {"dayOfWeek": 1, "startMinute": 540, "endMinute": 720},
                {"dayOfWeek": 1, "startMinute": 720, "endMinute": 1020},
            ],
        )

        assert len(db.clinicianavailability.created) == 2

    async def test_the_same_hours_on_different_days_are_allowed(self, patch_db):
        db = patch_db(FakeDB(profile=a_profile()))

        await ClinicianService.set_availability(
            CLINICIAN,
            [
                {"dayOfWeek": 0, "startMinute": 540, "endMinute": 1020},
                {"dayOfWeek": 1, "startMinute": 540, "endMinute": 1020},
            ],
        )

        assert len(db.clinicianavailability.created) == 2

    @pytest.mark.parametrize("day", [-1, 7, 99])
    async def test_a_day_outside_the_week_is_refused(self, patch_db, day):
        patch_db(FakeDB(profile=a_profile()))
        with pytest.raises(BadRequestException):
            await ClinicianService.set_availability(
                CLINICIAN, [{"dayOfWeek": day, "startMinute": 540, "endMinute": 600}]
            )

    async def test_a_window_spilling_past_midnight_is_refused(self, patch_db):
        patch_db(FakeDB(profile=a_profile()))
        with pytest.raises(BadRequestException):
            await ClinicianService.set_availability(
                CLINICIAN, [{"dayOfWeek": 1, "startMinute": 1400, "endMinute": 1500}]
            )

    async def test_setting_availability_replaces_the_previous_week(self, patch_db):
        db = patch_db(FakeDB(profile=a_profile()))

        await ClinicianService.set_availability(
            CLINICIAN, [{"dayOfWeek": 1, "startMinute": 540, "endMinute": 600}]
        )

        assert db.clinicianavailability.deleted, "the old week was not cleared"

    async def test_a_clinician_cannot_edit_another_clinicians_calendar(self, patch_db):
        patch_db(FakeDB(profile=a_profile()))
        with pytest.raises(ForbiddenException):
            await ClinicianService.set_availability(
                CLINICIAN,
                [{"dayOfWeek": 1, "startMinute": 540, "endMinute": 600}],
                clinician_id="clin_2",
            )

    async def test_an_admin_may_edit_anybodys_calendar(self, patch_db):
        db = patch_db(FakeDB(profile=a_profile()))

        await ClinicianService.set_availability(
            ADMIN,
            [{"dayOfWeek": 1, "startMinute": 540, "endMinute": 600}],
            clinician_id="clin_1",
        )

        assert len(db.clinicianavailability.created) == 1


class TestTimeOff:
    async def test_time_off_that_ends_before_it_starts_is_refused(self, patch_db):
        patch_db(FakeDB(profile=a_profile()))
        with pytest.raises(BadRequestException):
            await ClinicianService.add_time_off(CLINICIAN, at(12), at(9))

    async def test_time_off_over_existing_appointments_is_refused(self, patch_db):
        """
        Marking leave does not move the appointments underneath it. Allowing this means
        the clash is discovered by the clinician not turning up.
        """
        db = patch_db(FakeDB(profile=a_profile()))
        db.booking.rows = [SimpleNamespace(id="bk_1", time=at(10))]

        with pytest.raises(ConflictException) as exc:
            await ClinicianService.add_time_off(CLINICIAN, at(9), at(12))

        assert "appointment" in str(exc.value).lower()

    async def test_time_off_over_a_free_period_is_accepted(self, patch_db):
        db = patch_db(FakeDB(profile=a_profile()))
        db.booking.rows = []

        entry = await ClinicianService.add_time_off(
            CLINICIAN, at(9), at(12), "conference"
        )

        assert entry.reason == "conference"
        assert db.cliniciantimeoff.created[0]["clinicianProfileId"] == "prof_1"
