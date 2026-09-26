"""
The clinician's own view: their calendar, their caseload, their patients' records.

Everything here is scoped through `booking.clinicianId`. A clinician's claim on a
patient's clinical record runs entirely through the assignment on a booking - there is
no other route by which a patient becomes visible to them, and there is deliberately no
endpoint that lists all patients.

Availability lives here too. Before this, slots were generated for a service between
fixed hours with no reference to who would actually deliver them, so a service with one
clinician offered twelve hours a day and a service with three offered the same twelve.
`available_slots_for_clinician` is the corrected version; SlotService delegates to it
whenever a clinician is named.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.roles import Role, is_admin, is_clinician
from app.db.client import db

#: Monday-first, matching Python's date.weekday().
DAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

#: Used when a clinician has never set their hours. Chosen to match the 08:00-20:00
#: window the service-level slot generator has always used, so behaviour does not
#: change for a clinician who has not touched the new feature.
DEFAULT_WINDOW = (8 * 60, 20 * 60)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _minutes_to_label(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


class ClinicianService:
    # -------------------------------------------------------------------
    # Profile
    # -------------------------------------------------------------------

    @staticmethod
    async def get_profile(user, clinician_id: Optional[str] = None) -> Dict[str, Any]:
        """
        A clinician's profile with their weekly hours.

        A clinician reads their own; an admin reads anyone's. A patient cannot reach
        this at all - the public-facing clinician card is a different, thinner payload.
        """
        target_id = clinician_id or user.id
        if target_id != user.id and not is_admin(user):
            raise ForbiddenException("You can only view your own profile.")

        clinician = await db.user.find_unique(
            where={"id": target_id},
            include={"clinicianProfile": {"include": {"availability": True, "timeOff": True}}},
        )
        if clinician is None or Role.parse(clinician.role) is not Role.CLINICIAN:
            raise NotFoundException("Clinician not found.")

        profile = clinician.clinicianProfile
        if profile is None:
            # A clinician promoted before profiles existed, or created outside the
            # admin endpoint. Creating it on read beats every downstream caller having
            # to cope with a null.
            profile = await db.clinicianprofile.create(data={"userId": target_id})
            profile = await db.clinicianprofile.find_unique(
                where={"id": profile.id}, include={"availability": True, "timeOff": True}
            )

        return ClinicianService.serialise_profile(clinician, profile)

    @staticmethod
    async def update_profile(user, data: Dict[str, Any], clinician_id: Optional[str] = None):
        target_id = clinician_id or user.id
        if target_id != user.id and not is_admin(user):
            raise ForbiddenException("You can only edit your own profile.")

        profile = await db.clinicianprofile.find_unique(where={"userId": target_id})
        if profile is None:
            profile = await db.clinicianprofile.create(data={"userId": target_id})

        editable = {
            "specialisation",
            "qualifications",
            "yearsExperience",
            "bio",
            "languages",
            "consultationModes",
            "isAcceptingPatients",
            "timezone",
            "slotDurationMinutes",
            "maxDailyBookings",
        }
        if is_admin(user):
            # Registration number is an administrative fact about a professional, not
            # something they should be able to edit about themselves.
            editable.add("registrationNo")

        payload = {k: v for k, v in data.items() if k in editable and v is not None}
        if not payload:
            raise BadRequestException("Nothing to update.")

        await db.clinicianprofile.update(where={"id": profile.id}, data=payload)
        return await ClinicianService.get_profile(user, target_id)

    # -------------------------------------------------------------------
    # Availability
    # -------------------------------------------------------------------

    @staticmethod
    async def set_availability(
        user, windows: List[Dict[str, Any]], clinician_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Replace a clinician's weekly hours.

        A whole-week replace rather than per-row edits: the UI is a weekly grid, and
        reconciling "which of these seven days changed" on the client is how a Tuesday
        ends up deleted because it was not in the payload.

        Overlapping windows on the same day are rejected. They are not harmful - slot
        generation would deduplicate - but they make the grid show two overlapping
        blocks and the clinician cannot tell which one they meant to edit.
        """
        target_id = clinician_id or user.id
        if target_id != user.id and not is_admin(user):
            raise ForbiddenException("You can only edit your own availability.")

        profile = await db.clinicianprofile.find_unique(where={"userId": target_id})
        if profile is None:
            profile = await db.clinicianprofile.create(data={"userId": target_id})

        cleaned: List[Dict[str, Any]] = []
        for window in windows:
            day = int(window.get("dayOfWeek", -1))
            start = int(window.get("startMinute", -1))
            end = int(window.get("endMinute", -1))

            if not 0 <= day <= 6:
                raise BadRequestException(
                    "dayOfWeek must be 0 (Monday) through 6 (Sunday)."
                )
            if not 0 <= start < 24 * 60 or not 0 < end <= 24 * 60:
                raise BadRequestException("Times must fall within a single day.")
            if end <= start:
                raise BadRequestException(
                    f"{DAY_NAMES[day]}: {_minutes_to_label(start)} to "
                    f"{_minutes_to_label(end)} ends before it starts."
                )
            cleaned.append({"dayOfWeek": day, "startMinute": start, "endMinute": end})

        by_day: Dict[int, List[Dict[str, Any]]] = {}
        for window in cleaned:
            by_day.setdefault(window["dayOfWeek"], []).append(window)
        for day, day_windows in by_day.items():
            day_windows.sort(key=lambda w: w["startMinute"])
            for earlier, later in zip(day_windows, day_windows[1:]):
                if later["startMinute"] < earlier["endMinute"]:
                    raise BadRequestException(
                        f"{DAY_NAMES[day]}: "
                        f"{_minutes_to_label(earlier['startMinute'])}-"
                        f"{_minutes_to_label(earlier['endMinute'])} overlaps "
                        f"{_minutes_to_label(later['startMinute'])}-"
                        f"{_minutes_to_label(later['endMinute'])}."
                    )

        await db.clinicianavailability.delete_many(
            where={"clinicianProfileId": profile.id}
        )
        for window in cleaned:
            await db.clinicianavailability.create(
                data={"clinicianProfileId": profile.id, **window}
            )

        return await ClinicianService.get_profile(user, target_id)

    @staticmethod
    async def add_time_off(
        user,
        start_at: datetime,
        end_at: datetime,
        reason: Optional[str] = None,
        clinician_id: Optional[str] = None,
    ):
        target_id = clinician_id or user.id
        if target_id != user.id and not is_admin(user):
            raise ForbiddenException("You can only edit your own calendar.")
        if end_at <= start_at:
            raise BadRequestException("Time off must end after it starts.")

        profile = await db.clinicianprofile.find_unique(where={"userId": target_id})
        if profile is None:
            profile = await db.clinicianprofile.create(data={"userId": target_id})

        # Booked appointments inside the window are the whole reason this needs a
        # check: marking leave over them does not move them, and the clinician would
        # discover the clash by not turning up.
        clashes = await db.booking.count(
            where={
                "clinicianId": target_id,
                "time": {"gte": start_at, "lt": end_at},
                "status": {"in": ["PENDING", "CONFIRMED"]},
            }
        )
        if clashes:
            raise ConflictException(
                f"You have {clashes} appointment(s) booked in that period. Move or "
                f"cancel them first."
            )

        return await db.cliniciantimeoff.create(
            data={
                "clinicianProfileId": profile.id,
                "startAt": start_at,
                "endAt": end_at,
                "reason": reason,
            }
        )

    @staticmethod
    async def remove_time_off(user, time_off_id: str) -> None:
        profile = await db.clinicianprofile.find_unique(where={"userId": user.id})
        entry = await db.cliniciantimeoff.find_unique(where={"id": time_off_id})
        if entry is None:
            raise NotFoundException("Time off entry not found.")
        if not is_admin(user) and (profile is None or entry.clinicianProfileId != profile.id):
            raise NotFoundException("Time off entry not found.")
        await db.cliniciantimeoff.delete(where={"id": time_off_id})

    # -------------------------------------------------------------------
    # Slot generation
    # -------------------------------------------------------------------

    @staticmethod
    async def available_slots_for_clinician(
        clinician_id: str, target_date: date, service_duration_minutes: int
    ) -> List[datetime]:
        """
        Slot start times this clinician can actually deliver on this date.

        Three things remove a slot, and all three have to be checked here rather than
        by the caller:

          1. it falls outside the clinician's weekly hours;
          2. it falls inside a dated time-off entry;
          3. the clinician is already booked then - on ANY service, which is the part
             a per-service availability check gets wrong. A clinician booked for a gait
             assessment at 10:00 is not free for a posture assessment at 10:00.
        """
        profile = await db.clinicianprofile.find_unique(
            where={"userId": clinician_id}, include={"availability": True, "timeOff": True}
        )

        # The appointment length the caller asked for wins, and the clinician's
        # configured block is only the fallback.
        #
        # It used to be the other way round, and that produced overlapping offers: a
        # clinician working in 30-minute blocks, asked for a 60-minute service, was
        # offered 09:00 AND 09:30 - and an hour-long appointment booked at 09:30 runs
        # straight through the 10:00 slot that was also on offer. Slot spacing has to be
        # at least as long as the appointment, or the calendar sells the same time twice.
        duration = service_duration_minutes
        windows: List[tuple] = []

        if profile is None:
            windows = [DEFAULT_WINDOW]
        else:
            duration = service_duration_minutes or profile.slotDurationMinutes
            weekday = target_date.weekday()
            active = [
                (a.startMinute, a.endMinute)
                for a in (profile.availability or [])
                if a.isActive and a.dayOfWeek == weekday
            ]
            if not active:
                # No window set for this weekday. A clinician who has configured ANY
                # availability has deliberately not configured this day, so they are
                # not available; one who has configured none has not used the feature
                # at all, and falls back to the default hours.
                if profile.availability:
                    return []
                windows = [DEFAULT_WINDOW]
            else:
                windows = active

        day_start = datetime.combine(target_date, time(0, 0), tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        candidates: List[datetime] = []
        for start_minute, end_minute in windows:
            cursor = day_start + timedelta(minutes=start_minute)
            window_end = day_start + timedelta(minutes=end_minute)
            while cursor + timedelta(minutes=duration) <= window_end:
                candidates.append(cursor)
                cursor += timedelta(minutes=duration)

        if not candidates:
            return []

        # Time off.
        if profile is not None:
            for entry in profile.timeOff or []:
                start = _as_aware(entry.startAt)
                end = _as_aware(entry.endAt)
                candidates = [
                    slot
                    for slot in candidates
                    if not (start <= slot < end)
                ]

        # Existing appointments, across every service.
        bookings = await db.booking.find_many(
            where={
                "clinicianId": clinician_id,
                "time": {"gte": day_start, "lt": day_end},
                "status": {"not": "CANCELLED"},
            }
        )
        booked = {_as_aware(b.time) for b in bookings}

        # Live holds on this clinician's calendar.
        locks = await db.slotlock.find_many(
            where={
                "clinicianId": clinician_id,
                "slotTime": {"gte": day_start, "lt": day_end},
                "expiresAt": {"gt": _now()},
                "isReleased": False,
            }
        )
        locked = {_as_aware(l.slotTime) for l in locks}

        # Daily ceiling, if the clinician set one.
        if profile is not None and profile.maxDailyBookings:
            if len(bookings) >= profile.maxDailyBookings:
                return []

        return [s for s in candidates if s not in booked and s not in locked]

    # -------------------------------------------------------------------
    # Caseload
    # -------------------------------------------------------------------

    @staticmethod
    async def my_schedule(
        user,
        *,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """This clinician's appointments, with whether a consultation is open."""
        where: Dict[str, Any] = {"clinicianId": user.id}
        if status:
            where["status"] = status.upper()
        if date_from or date_to:
            window: Dict[str, Any] = {}
            if date_from:
                window["gte"] = date_from
            if date_to:
                window["lte"] = date_to
            where["time"] = window

        bookings = await db.booking.find_many(
            where=where,
            include={"user": True, "service": True, "videoSessions": True},
            order={"time": "asc"},
            take=min(limit, 200),
        )

        out = []
        for booking in bookings:
            sessions = getattr(booking, "videoSessions", None) or []
            live = next(
                (s for s in sessions if s.status in ("SCHEDULED", "WAITING", "LIVE")),
                None,
            )
            out.append(
                {
                    "id": booking.id,
                    "time": booking.time,
                    "status": booking.status,
                    "description": booking.description,
                    "remainingScreeningCount": booking.remainingScreeningCount,
                    "usedScreeningCount": booking.usedScreeningCount,
                    "patient": (
                        {
                            "id": booking.user.id,
                            "name": booking.user.name,
                            "phone": booking.user.phone,
                            "profileImage": booking.user.profileImage,
                        }
                        if booking.user
                        else None
                    ),
                    "service": (
                        {
                            "id": booking.service.id,
                            "name": booking.service.name,
                            "duration": booking.service.duration,
                        }
                        if booking.service
                        else None
                    ),
                    "consultation": (
                        {
                            "id": live.id,
                            "status": live.status,
                            "screeningEnabled": live.screeningEnabled,
                            # The state the clinician dashboard reacts to: the patient
                            # is in the room and nobody has joined them.
                            "patientWaiting": live.status == "WAITING",
                        }
                        if live
                        else None
                    ),
                }
            )
        return out

    @staticmethod
    async def my_patients(user, *, search: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        The patients this clinician is responsible for.

        Derived from booking assignments rather than stored, so a clinician's caseload
        cannot drift out of step with who is actually booked with them.
        """
        bookings = await db.booking.find_many(
            where={"clinicianId": user.id},
            include={"user": True},
            order={"time": "desc"},
        )

        by_patient: Dict[str, Dict[str, Any]] = {}
        for booking in bookings:
            patient = booking.user
            if patient is None:
                continue
            if search:
                needle = search.lower()
                haystack = f"{patient.name or ''} {patient.phone or ''} {patient.email or ''}".lower()
                if needle not in haystack:
                    continue
            entry = by_patient.setdefault(
                patient.id,
                {
                    "id": patient.id,
                    "name": patient.name,
                    "phone": patient.phone,
                    "email": patient.email,
                    "profileImage": patient.profileImage,
                    "bookingCount": 0,
                    "lastSeen": None,
                    "nextAppointment": None,
                    "remainingScreenings": 0,
                },
            )
            entry["bookingCount"] += 1
            entry["remainingScreenings"] += booking.remainingScreeningCount

            booking_time = _as_aware(booking.time)
            if booking_time <= _now():
                if entry["lastSeen"] is None or booking_time > entry["lastSeen"]:
                    entry["lastSeen"] = booking_time
            else:
                if (
                    entry["nextAppointment"] is None
                    or booking_time < entry["nextAppointment"]
                ):
                    entry["nextAppointment"] = booking_time

        patients = list(by_patient.values())
        for patient in patients:
            patient["screeningCounts"] = {
                "posture": await db.postureanalysis.count(
                    where={
                        "userId": patient["id"],
                        "booking": {"is": {"clinicianId": user.id}},
                    }
                ),
                "gait": await db.gaitanalysis.count(
                    where={
                        "userId": patient["id"],
                        "booking": {"is": {"clinicianId": user.id}},
                    }
                ),
                "rom": await db.romanalysis.count(
                    where={
                        "userId": patient["id"],
                        "booking": {"is": {"clinicianId": user.id}},
                    }
                ),
            }
            patient["draftPlans"] = await db.exerciseplan.count(
                where={
                    "patientId": patient["id"],
                    "status": "DRAFT",
                    "booking": {"is": {"clinicianId": user.id}},
                }
            )

        patients.sort(
            key=lambda p: (p["nextAppointment"] is None, p["nextAppointment"] or _now())
        )
        return patients

    @staticmethod
    async def patient_record(user, patient_id: str) -> Dict[str, Any]:
        """
        One patient's record, restricted to the bookings assigned to this clinician.

        The restriction is the point. A clinician who saw a patient once does not
        thereby gain access to everything another clinician ever recorded about them.
        """
        if is_admin(user):
            from app.api.admin.service import AdminService

            return await AdminService.get_patient_record(patient_id)

        bookings = await db.booking.find_many(
            where={"userId": patient_id, "clinicianId": user.id},
            include={"service": True},
            order={"time": "desc"},
        )
        if not bookings:
            raise NotFoundException("Patient not found or not assigned to you.")

        booking_ids = [b.id for b in bookings]
        patient = await db.user.find_unique(where={"id": patient_id})

        posture = await db.postureanalysis.find_many(
            where={"bookingId": {"in": booking_ids}},
            order={"analysisDate": "desc"},
        )
        gait = await db.gaitanalysis.find_many(
            where={"bookingId": {"in": booking_ids}}, order={"analysisDate": "desc"}
        )
        rom = await db.romanalysis.find_many(
            where={"bookingId": {"in": booking_ids}}, order={"analysisDate": "desc"}
        )
        plans = await db.exerciseplan.find_many(
            where={"bookingId": {"in": booking_ids}},
            include={"items": {"include": {"exercise": True}}},
            order={"createdAt": "desc"},
        )

        return {
            "patient": {
                "id": patient.id,
                "name": patient.name,
                "phone": patient.phone,
                "email": patient.email,
                "profileImage": patient.profileImage,
                "createdAt": patient.createdAt,
            }
            if patient
            else None,
            "bookings": [
                {
                    "id": b.id,
                    "time": b.time,
                    "status": b.status,
                    "remainingScreeningCount": b.remainingScreeningCount,
                    "usedScreeningCount": b.usedScreeningCount,
                    "service": (
                        {"id": b.service.id, "name": b.service.name} if b.service else None
                    ),
                }
                for b in bookings
            ],
            "analyses": {
                "posture": [
                    {
                        "id": a.id,
                        "type": "POSTURE",
                        "bookingId": a.bookingId,
                        "analysisDate": a.analysisDate,
                        "status": a.status,
                    }
                    for a in posture
                ],
                "gait": [
                    {
                        "id": a.id,
                        "type": "GAIT",
                        "bookingId": a.bookingId,
                        "analysisDate": a.analysisDate,
                        "status": a.status,
                    }
                    for a in gait
                ],
                "rom": [
                    {
                        "id": a.id,
                        "type": "ROM",
                        "bookingId": a.bookingId,
                        "analysisDate": a.analysisDate,
                        "status": a.status,
                    }
                    for a in rom
                ],
            },
            "exercisePlans": [
                {
                    "id": p.id,
                    "analysisType": p.analysisType,
                    "analysisId": p.analysisId,
                    "status": p.status,
                    "title": p.title,
                    "summary": p.summary,
                    "itemCount": len([i for i in (p.items or []) if not i.isRemoved]),
                    "createdAt": p.createdAt,
                    "activatedAt": p.activatedAt,
                }
                for p in plans
            ],
        }

    @staticmethod
    async def review_queue(user) -> List[Dict[str, Any]]:
        """
        Draft plans waiting on this clinician.

        Every row is a patient who finished a screening and has not been given their
        programme yet, which makes this the clinician's actual to-do list.
        """
        where: Dict[str, Any] = {"status": "DRAFT"}
        if not is_admin(user):
            where["booking"] = {"is": {"clinicianId": user.id}}

        plans = await db.exerciseplan.find_many(
            where=where,
            include={
                "patient": True,
                "items": {"include": {"exercise": True}},
                "booking": True,
            },
            order={"createdAt": "asc"},
            take=100,
        )
        return [
            {
                "id": p.id,
                "analysisType": p.analysisType,
                "analysisId": p.analysisId,
                "title": p.title,
                "summary": p.summary,
                "createdAt": p.createdAt,
                "itemCount": len([i for i in (p.items or []) if not i.isRemoved]),
                "findingCount": len(p.findings) if isinstance(p.findings, list) else 0,
                "patient": (
                    {"id": p.patient.id, "name": p.patient.name} if p.patient else None
                ),
            }
            for p in plans
        ]

    # -------------------------------------------------------------------
    # Booking on a patient's behalf
    # -------------------------------------------------------------------

    @staticmethod
    async def book_for_patient(
        user,
        *,
        patient_id: str,
        service_id: str,
        slot_time: datetime,
        clinician_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Any:
        """
        Book an appointment on a patient's behalf. Clinician or admin.

        The follow-up path: a clinician finishes a consultation and books the patient
        back in for four weeks' time, without asking them to go through checkout.

        The payment record is created as COMPLETED with a zero amount and a
        clinician-booked marker. That is deliberate and it is a real decision: a
        clinician-arranged follow-up is not a self-service purchase, and inventing a
        PENDING payment for it would leave a booking that the screening services refuse
        to run against. Billing for these is handled outside this flow.
        """
        if not (is_clinician(user) or is_admin(user)):
            raise ForbiddenException(
                "Only a clinician or administrator can book on a patient's behalf."
            )

        target_clinician = clinician_id or (user.id if is_clinician(user) else None)
        if target_clinician is None:
            raise BadRequestException(
                "An administrator must say which clinician the appointment is for."
            )
        if is_clinician(user) and target_clinician != user.id:
            raise ForbiddenException(
                "You can only book appointments into your own calendar."
            )

        patient = await db.user.find_unique(where={"id": patient_id})
        if patient is None or Role.parse(patient.role) is not Role.PATIENT:
            raise NotFoundException("Patient not found.")

        service = await db.service.find_unique(where={"id": service_id})
        if service is None:
            raise NotFoundException("Service not found.")

        slot_time = _as_aware(slot_time)
        if slot_time < _now():
            raise BadRequestException("That appointment time is in the past.")

        clash = await db.booking.find_first(
            where={
                "clinicianId": target_clinician,
                "time": slot_time,
                "status": {"not": "CANCELLED"},
            }
        )
        if clash is not None:
            raise ConflictException(
                "That clinician already has an appointment at that time."
            )

        payment = await db.payment.create(
            data={
                "userId": patient_id,
                "totalAmount": 0.0,
                "paidAmount": 0.0,
                "remainingAmount": 0.0,
                "status": "COMPLETED",
                "paymentMethod": "CLINICIAN_BOOKED",
                "transactionId": f"CLINBOOK-{slot_time.strftime('%Y%m%d%H%M')}-{patient_id[:8]}",
                "completedAt": _now(),
            }
        )

        screening_count = service.includedScreeningCount or 0
        booking = await db.booking.create(
            data={
                "userId": patient_id,
                "serviceId": service_id,
                "paymentId": payment.id,
                "clinicianId": target_clinician,
                "totalAmount": 0.0,
                "paidAmount": 0.0,
                "remainingAmount": 0.0,
                "time": slot_time,
                # CONFIRMED rather than PENDING: a clinician putting an appointment in
                # their own calendar has already confirmed it, and PENDING would block
                # the screening they booked it for.
                "status": "CONFIRMED",
                "description": description or "Booked by clinician",
                "totalScreeningCount": screening_count,
                "usedScreeningCount": 0,
                "remainingScreeningCount": screening_count,
            },
            include={"service": True, "user": True, "clinician": True},
        )
        return booking

    # -------------------------------------------------------------------
    # Serialisation
    # -------------------------------------------------------------------

    @staticmethod
    def serialise_profile(clinician, profile) -> Dict[str, Any]:
        availability = getattr(profile, "availability", None) or []
        time_off = getattr(profile, "timeOff", None) or []
        return {
            "id": clinician.id,
            "name": clinician.name,
            "email": clinician.email,
            "phone": clinician.phone,
            "profileImage": clinician.profileImage,
            "status": clinician.status,
            "profile": {
                "id": profile.id,
                "specialisation": profile.specialisation,
                "qualifications": profile.qualifications,
                "registrationNo": profile.registrationNo,
                "yearsExperience": profile.yearsExperience,
                "bio": profile.bio,
                "languages": [l for l in (profile.languages or "").split(",") if l],
                "consultationModes": [
                    m for m in (profile.consultationModes or "").split(",") if m
                ],
                "isAcceptingPatients": profile.isAcceptingPatients,
                "timezone": profile.timezone,
                "slotDurationMinutes": profile.slotDurationMinutes,
                "maxDailyBookings": profile.maxDailyBookings,
            },
            "availability": sorted(
                (
                    {
                        "id": a.id,
                        "dayOfWeek": a.dayOfWeek,
                        "dayName": DAY_NAMES[a.dayOfWeek],
                        "startMinute": a.startMinute,
                        "endMinute": a.endMinute,
                        "startLabel": _minutes_to_label(a.startMinute),
                        "endLabel": _minutes_to_label(a.endMinute),
                        "isActive": a.isActive,
                    }
                    for a in availability
                ),
                key=lambda w: (w["dayOfWeek"], w["startMinute"]),
            ),
            "timeOff": [
                {
                    "id": t.id,
                    "startAt": t.startAt,
                    "endAt": t.endAt,
                    "reason": t.reason,
                }
                for t in sorted(time_off, key=lambda t: t.startAt)
            ],
        }


def _as_aware(value: Optional[datetime]) -> datetime:
    """
    Compare stored timestamps against `now` without a TypeError.

    Postgres returns aware datetimes and several test doubles return naive ones;
    subtracting one from the other raises, and a raise inside slot generation shows up
    as "no slots available" rather than as an error anybody can see.
    """
    if value is None:
        return _now()
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
