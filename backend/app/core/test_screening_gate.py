"""
Tests for the screening gate.

This file is the reason the `unsupervised_screening_by_default` fixture in conftest.py
is safe. That fixture relaxes a security rule for the rest of the suite; these tests
turn it back on and assert the rule actually holds, so the relaxation cannot quietly
become the only behaviour anybody tests.

What is asserted, in order of how much it would cost to get wrong:

  1. A patient cannot start a screening on their own.
  2. A token is not a wildcard - it is bound to one booking, one patient, one screening
     type, and one use.
  3. Staff can start one, and a clinician only on their own bookings.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Optional

import pytest

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.screening_gate import authorise_screening


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; nothing here touches a database."""
    yield


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FakeTable:
    def __init__(self, record: Optional[Any] = None):
        self.record = record

    async def find_unique(self, **kwargs):
        return self.record

    async def find_first(self, **kwargs):
        return self.record


class FakeDB:
    def __init__(self, booking=None, session=None):
        self.booking = FakeTable(booking)
        self.videosession = FakeTable(session)


def a_patient(user_id: str = "patient_1"):
    return SimpleNamespace(id=user_id, role="USER", status="ACTIVE")


def a_clinician(user_id: str = "clin_1"):
    return SimpleNamespace(id=user_id, role="CLINICIAN", status="ACTIVE")


def an_admin(user_id: str = "admin_1"):
    return SimpleNamespace(id=user_id, role="ADMIN", status="ACTIVE")


def a_booking(
    *,
    booking_id: str = "bk_1",
    user_id: str = "patient_1",
    clinician_id: Optional[str] = "clin_1",
    remaining: int = 3,
):
    return SimpleNamespace(
        id=booking_id,
        userId=user_id,
        clinicianId=clinician_id,
        status="CONFIRMED",
        remainingScreeningCount=remaining,
    )


def a_session(
    *,
    booking_id: str = "bk_1",
    patient_id: str = "patient_1",
    token: str = "tok_good",
    enabled: bool = True,
    status: str = "LIVE",
    screening_type: str = "POSTURE",
    expires_in_minutes: int = 30,
    consumed: bool = False,
):
    return SimpleNamespace(
        id="sess_1",
        bookingId=booking_id,
        patientId=patient_id,
        clinicianId="clin_1",
        status=status,
        screeningEnabled=enabled,
        screeningType=screening_type,
        screeningToken=token,
        screeningTokenExpiresAt=_now() + timedelta(minutes=expires_in_minutes),
        screeningEnabledById="clin_1",
        screeningConsumedAt=_now() if consumed else None,
    )


@pytest.fixture
def patch_db(monkeypatch):
    def _install(db):
        monkeypatch.setattr("app.core.screening_gate.db", db, raising=False)
        return db

    return _install


# ---------------------------------------------------------------------------
# The rule itself
# ---------------------------------------------------------------------------


class TestPatientCannotSelfServe:
    async def test_a_patient_with_no_token_is_refused(
        self, patch_db, supervised_screening
    ):
        """
        The headline rule. A patient pressing start with no clinician involved gets
        nothing - this is the case that used to produce a full clinical record with
        nobody's name against it.
        """
        patch_db(FakeDB(booking=a_booking()))

        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(a_patient(), "bk_1", "POSTURE")

        # The message has to tell them what to do, not just that they may not.
        assert "clinician" in str(exc.value).lower()

    async def test_an_unknown_token_is_refused(self, patch_db, supervised_screening):
        patch_db(FakeDB(booking=a_booking(), session=None))

        with pytest.raises(ForbiddenException):
            await authorise_screening(
                a_patient(), "bk_1", "POSTURE", screening_token="tok_invented"
            )

    async def test_a_valid_token_lets_the_patient_start(
        self, patch_db, supervised_screening
    ):
        patch_db(FakeDB(booking=a_booking(), session=a_session()))

        authorisation = await authorise_screening(
            a_patient(), "bk_1", "POSTURE", screening_token="tok_good"
        )

        assert authorisation.patient_id == "patient_1"
        assert authorisation.supervised is True
        assert authorisation.session_id == "sess_1"
        # Who authorised it is the point of the record.
        assert authorisation.supervising_clinician_id == "clin_1"


class TestTokenIsNotAWildcard:
    """
    Each of these is a different way one unlock could be stretched into more access than
    the clinician granted. They are separate tests because they are separate checks in
    the gate, and a single "bad token is refused" test would pass with any one of them
    missing.
    """

    async def test_a_token_for_another_booking_is_refused(
        self, patch_db, supervised_screening
    ):
        patch_db(
            FakeDB(
                booking=a_booking(booking_id="bk_1"),
                session=a_session(booking_id="bk_OTHER"),
            )
        )
        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(
                a_patient(), "bk_1", "POSTURE", screening_token="tok_good"
            )
        assert "different appointment" in str(exc.value).lower()

    async def test_another_patients_token_is_refused(
        self, patch_db, supervised_screening
    ):
        patch_db(
            FakeDB(
                booking=a_booking(user_id="patient_1"),
                session=a_session(patient_id="patient_2"),
            )
        )
        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(
                a_patient("patient_1"), "bk_1", "POSTURE", screening_token="tok_good"
            )
        assert "not yours" in str(exc.value).lower()

    async def test_an_expired_token_is_refused(self, patch_db, supervised_screening):
        patch_db(
            FakeDB(booking=a_booking(), session=a_session(expires_in_minutes=-1))
        )
        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(
                a_patient(), "bk_1", "POSTURE", screening_token="tok_good"
            )
        assert "expired" in str(exc.value).lower()

    async def test_a_spent_token_is_refused(self, patch_db, supervised_screening):
        """
        Single use. Without this, one unlock would let a patient run screenings all
        afternoon and bill every one of them to the same clinician's supervision.
        """
        patch_db(FakeDB(booking=a_booking(), session=a_session(consumed=True)))
        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(
                a_patient(), "bk_1", "POSTURE", screening_token="tok_good"
            )
        assert "already been used" in str(exc.value).lower()

    async def test_a_revoked_authorisation_is_refused(
        self, patch_db, supervised_screening
    ):
        patch_db(FakeDB(booking=a_booking(), session=a_session(enabled=False)))
        with pytest.raises(ForbiddenException):
            await authorise_screening(
                a_patient(), "bk_1", "POSTURE", screening_token="tok_good"
            )

    async def test_a_token_for_a_different_screening_type_is_refused(
        self, patch_db, supervised_screening
    ):
        """
        Unlocking a posture capture does not permit a gait one. They consume the same
        screening credit and produce different clinical records, and the clinician
        chose which one they were supervising.
        """
        patch_db(
            FakeDB(booking=a_booking(), session=a_session(screening_type="POSTURE"))
        )
        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(
                a_patient(), "bk_1", "GAIT", screening_token="tok_good"
            )
        message = str(exc.value).lower()
        assert "posture" in message and "gait" in message

    async def test_an_ended_consultation_cannot_authorise(
        self, patch_db, supervised_screening
    ):
        patch_db(FakeDB(booking=a_booking(), session=a_session(status="ENDED")))
        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(
                a_patient(), "bk_1", "POSTURE", screening_token="tok_good"
            )
        assert "no longer running" in str(exc.value).lower()


class TestStaffPath:
    async def test_a_clinician_can_start_on_their_own_booking(self, patch_db):
        patch_db(FakeDB(booking=a_booking(clinician_id="clin_1"), session=None))

        authorisation = await authorise_screening(
            a_clinician("clin_1"), "bk_1", "POSTURE"
        )

        # The analysis belongs to the patient even though the clinician started it.
        assert authorisation.patient_id == "patient_1"
        assert authorisation.operator_id == "clin_1"
        assert authorisation.supervised is True

    async def test_a_clinician_cannot_start_on_someone_elses_booking(self, patch_db):
        patch_db(FakeDB(booking=a_booking(clinician_id="clin_OTHER")))

        with pytest.raises(UnauthorizedException):
            await authorise_screening(a_clinician("clin_1"), "bk_1", "POSTURE")

    async def test_an_admin_can_start_on_any_booking(self, patch_db):
        patch_db(FakeDB(booking=a_booking(clinician_id="clin_OTHER"), session=None))

        authorisation = await authorise_screening(an_admin(), "bk_1", "ROM")

        assert authorisation.patient_id == "patient_1"
        assert authorisation.operator_id == "admin_1"

    async def test_staff_cannot_screen_a_patient_who_does_not_own_the_booking(
        self, patch_db
    ):
        """
        `patientId` is an override for staff, not a way to file one patient's
        measurements against another's appointment.
        """
        patch_db(FakeDB(booking=a_booking(user_id="patient_1")))

        with pytest.raises(ForbiddenException) as exc:
            await authorise_screening(
                an_admin(), "bk_1", "POSTURE", patient_id="patient_2"
            )
        assert "not the owner" in str(exc.value).lower()

    async def test_a_patient_is_not_promoted_by_passing_a_patient_id(self, patch_db):
        """A patient sending `patientId` for somebody else is still a patient."""
        patch_db(FakeDB(booking=a_booking(user_id="patient_1")))

        with pytest.raises((ForbiddenException, UnauthorizedException)):
            await authorise_screening(
                a_patient("patient_1"),
                "bk_1",
                "POSTURE",
                patient_id="patient_2",
            )


class TestOwnershipAndSetting:
    async def test_a_missing_booking_is_refused(self, patch_db):
        patch_db(FakeDB(booking=None))
        with pytest.raises(UnauthorizedException):
            await authorise_screening(a_patient(), "bk_missing", "POSTURE")

    async def test_another_patients_booking_is_refused(self, patch_db):
        patch_db(FakeDB(booking=a_booking(user_id="patient_2")))
        with pytest.raises(UnauthorizedException):
            await authorise_screening(a_patient("patient_1"), "bk_1", "POSTURE")

    async def test_supervision_off_lets_a_patient_self_screen(self, patch_db):
        """
        The documented escape hatch, and it records that nobody supervised - so a
        report drawn from it can say so rather than implying a clinician was present.
        """
        patch_db(FakeDB(booking=a_booking()))

        authorisation = await authorise_screening(a_patient(), "bk_1", "POSTURE")

        assert authorisation.supervised is False
        assert authorisation.session_id is None

    async def test_an_unrecognised_role_is_refused(self, patch_db):
        """Fail closed. A role the gate cannot parse is not a role it can authorise."""
        patch_db(FakeDB(booking=a_booking()))
        stranger = SimpleNamespace(id="patient_1", role="AUDITOR", status="ACTIVE")

        with pytest.raises(ForbiddenException):
            await authorise_screening(stranger, "bk_1", "POSTURE")
