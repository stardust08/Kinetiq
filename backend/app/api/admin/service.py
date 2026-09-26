"""
Administration: the view across every patient, clinician, booking and screening.

An admin is the only role that reads unscoped. That is the point of the role and also
its risk, so two things are true throughout this module:

  * Every endpoint behind it goes through `get_current_admin`. There is no "mostly
    admin" path.
  * Nothing here returns raw clinical payloads in a list. A patient list carries names
    and counts; the joint angles live behind an explicit request for one patient's
    record, so an admin browsing the platform is not casually handed every patient's
    measurements.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    NotFoundException,
)
from app.core.roles import Role
from app.db.client import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialise_user(user, *, include_profile: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "roleLabel": _role_label(user.role),
        "status": user.status,
        "profileImage": user.profileImage,
        "sessionCount": user.sessionCount,
        "createdAt": user.createdAt,
    }
    profile = getattr(user, "clinicianProfile", None)
    if include_profile and profile is not None:
        payload["clinicianProfile"] = {
            "id": profile.id,
            "specialisation": profile.specialisation,
            "qualifications": profile.qualifications,
            "registrationNo": profile.registrationNo,
            "yearsExperience": profile.yearsExperience,
            "bio": profile.bio,
            "languages": [l for l in (profile.languages or "").split(",") if l],
            "isAcceptingPatients": profile.isAcceptingPatients,
            "timezone": profile.timezone,
            "slotDurationMinutes": profile.slotDurationMinutes,
            "maxDailyBookings": profile.maxDailyBookings,
        }
    return payload


def _role_label(stored_role: str) -> str:
    """`USER` must never be shown to a human as "User"."""
    try:
        return Role.parse(stored_role).label
    except ValueError:
        return str(stored_role).title()


class AdminService:
    # -------------------------------------------------------------------
    # Users
    # -------------------------------------------------------------------

    @staticmethod
    async def list_users(
        *,
        role: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        where: Dict[str, Any] = {}
        if role:
            # Accepts "patient" and "doctor" as well as the stored spellings, so an
            # admin filtering by the word the UI shows them gets the right rows.
            where["role"] = Role.parse(role).value
        if status:
            where["status"] = status.upper()
        if search:
            where["OR"] = [
                {"name": {"contains": search, "mode": "insensitive"}},
                {"email": {"contains": search, "mode": "insensitive"}},
                {"phone": {"contains": search}},
            ]

        users = await db.user.find_many(
            where=where,
            include={"clinicianProfile": True},
            order={"createdAt": "desc"},
            take=min(limit, 200),
            skip=offset,
        )
        total = await db.user.count(where=where)
        return {
            "users": [_serialise_user(u, include_profile=True) for u in users],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @staticmethod
    async def get_user(user_id: str) -> Dict[str, Any]:
        user = await db.user.find_unique(
            where={"id": user_id}, include={"clinicianProfile": True}
        )
        if user is None:
            raise NotFoundException("User not found.")
        return _serialise_user(user, include_profile=True)

    @staticmethod
    async def set_user_status(admin_user, user_id: str, status: str) -> Dict[str, Any]:
        status = status.upper()
        if status not in ("ACTIVE", "INACTIVE", "BLOCKED"):
            raise BadRequestException(
                "Status must be ACTIVE, INACTIVE or BLOCKED."
            )
        if user_id == admin_user.id and status != "ACTIVE":
            # Locking yourself out of the only role that can unlock accounts is a
            # one-way door, and it has no legitimate use.
            raise BadRequestException("You cannot deactivate your own account.")

        target = await db.user.find_unique(where={"id": user_id})
        if target is None:
            raise NotFoundException("User not found.")

        updated = await db.user.update(where={"id": user_id}, data={"status": status})
        return _serialise_user(updated)

    @staticmethod
    async def set_user_role(admin_user, user_id: str, role: str) -> Dict[str, Any]:
        """
        Change somebody's role.

        Promoting to CLINICIAN creates the clinician profile at the same time, because
        a clinician without one has no calendar and cannot be booked - and the failure
        shows up later, as an empty availability list nobody can explain.
        """
        new_role = Role.parse(role)
        target = await db.user.find_unique(
            where={"id": user_id}, include={"clinicianProfile": True}
        )
        if target is None:
            raise NotFoundException("User not found.")

        if user_id == admin_user.id and new_role is not Role.ADMIN:
            raise BadRequestException("You cannot remove your own admin role.")

        if Role.parse(target.role) is Role.CLINICIAN and new_role is not Role.CLINICIAN:
            # Demoting a clinician who still has appointments would leave those
            # bookings pointing at somebody who can no longer open the consultation.
            upcoming = await db.booking.count(
                where={
                    "clinicianId": user_id,
                    "status": {"in": ["PENDING", "CONFIRMED"]},
                    "time": {"gte": _now()},
                }
            )
            if upcoming:
                raise ConflictException(
                    f"This clinician has {upcoming} upcoming appointment(s). Reassign "
                    f"them before changing the role."
                )

        updated = await db.user.update(
            where={"id": user_id}, data={"role": new_role.value}
        )

        if new_role is Role.CLINICIAN and target.clinicianProfile is None:
            await db.clinicianprofile.create(data={"userId": user_id})

        return _serialise_user(updated)

    # -------------------------------------------------------------------
    # Clinicians
    # -------------------------------------------------------------------

    @staticmethod
    async def create_clinician(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a clinician account and its profile together.

        Phone is the identity in this system - it is what OTP login keys off - so a
        collision is reported as a conflict rather than quietly attaching the profile
        to whoever already holds that number.
        """
        phone = (data.get("phone") or "").strip()
        if not phone:
            raise BadRequestException("A phone number is required.")

        existing = await db.user.find_unique(where={"phone": phone})
        if existing is not None:
            raise ConflictException(
                "An account already exists with that phone number. Change that "
                "account's role instead of creating a second one."
            )

        email = (data.get("email") or "").strip() or None
        if email:
            clash = await db.user.find_unique(where={"email": email})
            if clash is not None:
                raise ConflictException("An account already exists with that email.")

        user = await db.user.create(
            data={
                "name": data.get("name"),
                "email": email,
                "phone": phone,
                "role": Role.CLINICIAN.value,
                "status": "ACTIVE",
            }
        )
        profile = await db.clinicianprofile.create(
            data={
                "userId": user.id,
                "specialisation": data.get("specialisation"),
                "qualifications": data.get("qualifications"),
                "registrationNo": data.get("registrationNo"),
                "yearsExperience": data.get("yearsExperience"),
                "bio": data.get("bio"),
                "languages": data.get("languages"),
                "timezone": data.get("timezone") or "Asia/Kolkata",
                "slotDurationMinutes": data.get("slotDurationMinutes") or 30,
                "maxDailyBookings": data.get("maxDailyBookings"),
            }
        )
        user = await db.user.find_unique(
            where={"id": user.id}, include={"clinicianProfile": True}
        )
        return _serialise_user(user, include_profile=True)

    @staticmethod
    async def list_clinicians(
        *, include_inactive: bool = False, limit: int = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        where: Dict[str, Any] = {"role": Role.CLINICIAN.value}
        if not include_inactive:
            where["status"] = "ACTIVE"
        clinicians = await db.user.find_many(
            where=where,
            include={"clinicianProfile": True},
            order={"name": "asc"},
            take=min(limit, 200),
            skip=offset,
        )

        out = []
        for clinician in clinicians:
            payload = _serialise_user(clinician, include_profile=True)
            payload["stats"] = {
                "upcomingBookings": await db.booking.count(
                    where={
                        "clinicianId": clinician.id,
                        "status": {"in": ["PENDING", "CONFIRMED"]},
                        "time": {"gte": _now()},
                    }
                ),
                "totalBookings": await db.booking.count(
                    where={"clinicianId": clinician.id}
                ),
            }
            out.append(payload)
        return out

    # -------------------------------------------------------------------
    # Patients
    # -------------------------------------------------------------------

    @staticmethod
    async def list_patients(
        *, search: Optional[str] = None, limit: int = 50, offset: int = 0
    ) -> Dict[str, Any]:
        where: Dict[str, Any] = {"role": Role.PATIENT.value}
        if search:
            where["OR"] = [
                {"name": {"contains": search, "mode": "insensitive"}},
                {"email": {"contains": search, "mode": "insensitive"}},
                {"phone": {"contains": search}},
            ]

        patients = await db.user.find_many(
            where=where,
            order={"createdAt": "desc"},
            take=min(limit, 200),
            skip=offset,
        )
        total = await db.user.count(where=where)

        out = []
        for patient in patients:
            payload = _serialise_user(patient)
            # Counts, not clinical data. An admin scanning the patient list has no
            # business being handed everybody's joint angles on the way past.
            payload["stats"] = {
                "bookings": await db.booking.count(where={"userId": patient.id}),
                "postureAnalyses": await db.postureanalysis.count(
                    where={"userId": patient.id}
                ),
                "gaitAnalyses": await db.gaitanalysis.count(
                    where={"userId": patient.id}
                ),
                "romAnalyses": await db.romanalysis.count(where={"userId": patient.id}),
                "activePlans": await db.exerciseplan.count(
                    where={"patientId": patient.id, "status": "ACTIVE"}
                ),
            }
            out.append(payload)

        return {"patients": out, "total": total, "limit": limit, "offset": offset}

    @staticmethod
    async def get_patient_record(patient_id: str) -> Dict[str, Any]:
        """One patient's full record: bookings, every screening, every plan."""
        patient = await db.user.find_unique(where={"id": patient_id})
        if patient is None or Role.parse(patient.role) is not Role.PATIENT:
            raise NotFoundException("Patient not found.")

        bookings = await db.booking.find_many(
            where={"userId": patient_id},
            include={"service": True, "payment": True, "clinician": True},
            order={"time": "desc"},
        )
        posture = await db.postureanalysis.find_many(
            where={"userId": patient_id}, order={"analysisDate": "desc"}, take=50
        )
        gait = await db.gaitanalysis.find_many(
            where={"userId": patient_id}, order={"analysisDate": "desc"}, take=50
        )
        rom = await db.romanalysis.find_many(
            where={"userId": patient_id}, order={"analysisDate": "desc"}, take=50
        )
        plans = await db.exerciseplan.find_many(
            where={"patientId": patient_id},
            include={"items": {"include": {"exercise": True}}},
            order={"createdAt": "desc"},
        )
        sessions = await db.videosession.find_many(
            where={"patientId": patient_id},
            include={"clinician": True},
            order={"createdAt": "desc"},
            take=50,
        )

        return {
            "patient": _serialise_user(patient),
            "bookings": [
                {
                    "id": b.id,
                    "time": b.time,
                    "status": b.status,
                    "totalAmount": b.totalAmount,
                    "paidAmount": b.paidAmount,
                    "remainingAmount": b.remainingAmount,
                    "totalScreeningCount": b.totalScreeningCount,
                    "usedScreeningCount": b.usedScreeningCount,
                    "remainingScreeningCount": b.remainingScreeningCount,
                    "service": (
                        {"id": b.service.id, "name": b.service.name} if b.service else None
                    ),
                    "clinician": (
                        {"id": b.clinician.id, "name": b.clinician.name}
                        if getattr(b, "clinician", None)
                        else None
                    ),
                }
                for b in bookings
            ],
            "analyses": {
                "posture": [_analysis_summary(a, "POSTURE") for a in posture],
                "gait": [_analysis_summary(a, "GAIT") for a in gait],
                "rom": [_analysis_summary(a, "ROM") for a in rom],
            },
            "exercisePlans": [
                {
                    "id": p.id,
                    "analysisType": p.analysisType,
                    "analysisId": p.analysisId,
                    "status": p.status,
                    "title": p.title,
                    "itemCount": len(
                        [i for i in (p.items or []) if not i.isRemoved]
                    ),
                    "activatedAt": p.activatedAt,
                    "createdAt": p.createdAt,
                }
                for p in plans
            ],
            "consultations": [
                {
                    "id": s.id,
                    "status": s.status,
                    "startedAt": s.startedAt,
                    "endedAt": s.endedAt,
                    "clinician": (
                        {"id": s.clinician.id, "name": s.clinician.name}
                        if getattr(s, "clinician", None)
                        else None
                    ),
                }
                for s in sessions
            ],
        }

    # -------------------------------------------------------------------
    # Bookings
    # -------------------------------------------------------------------

    @staticmethod
    async def list_bookings(
        *,
        status: Optional[str] = None,
        clinician_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        unassigned_only: bool = False,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        where: Dict[str, Any] = {}
        if status:
            where["status"] = status.upper()
        if clinician_id:
            where["clinicianId"] = clinician_id
        if patient_id:
            where["userId"] = patient_id
        if unassigned_only:
            # The admin's main working queue: paid appointments with nobody to take
            # them. A booking with no clinician cannot host a consultation, so this is
            # the list that has to be kept empty.
            where["clinicianId"] = None
        if date_from or date_to:
            window: Dict[str, Any] = {}
            if date_from:
                window["gte"] = date_from
            if date_to:
                window["lte"] = date_to
            where["time"] = window

        bookings = await db.booking.find_many(
            where=where,
            include={"user": True, "service": True, "clinician": True, "payment": True},
            order={"time": "desc"},
            take=min(limit, 200),
            skip=offset,
        )
        total = await db.booking.count(where=where)

        return {
            "bookings": [
                {
                    "id": b.id,
                    "time": b.time,
                    "status": b.status,
                    "description": b.description,
                    "totalAmount": b.totalAmount,
                    "paidAmount": b.paidAmount,
                    "remainingAmount": b.remainingAmount,
                    "totalScreeningCount": b.totalScreeningCount,
                    "usedScreeningCount": b.usedScreeningCount,
                    "remainingScreeningCount": b.remainingScreeningCount,
                    "createdAt": b.createdAt,
                    "patient": (
                        {"id": b.user.id, "name": b.user.name, "phone": b.user.phone}
                        if b.user
                        else None
                    ),
                    "clinician": (
                        {"id": b.clinician.id, "name": b.clinician.name}
                        if getattr(b, "clinician", None)
                        else None
                    ),
                    "service": (
                        {"id": b.service.id, "name": b.service.name} if b.service else None
                    ),
                    "payment": (
                        {"id": b.payment.id, "status": b.payment.status}
                        if b.payment
                        else None
                    ),
                }
                for b in bookings
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    # -------------------------------------------------------------------
    # Dashboard
    # -------------------------------------------------------------------

    @staticmethod
    async def platform_stats() -> Dict[str, Any]:
        """Headline numbers for the admin dashboard."""
        now = _now()
        week_ago = now - timedelta(days=7)
        day_end = now + timedelta(days=1)

        return {
            "users": {
                "patients": await db.user.count(where={"role": Role.PATIENT.value}),
                "clinicians": await db.user.count(where={"role": Role.CLINICIAN.value}),
                "admins": await db.user.count(where={"role": Role.ADMIN.value}),
                "newThisWeek": await db.user.count(
                    where={"createdAt": {"gte": week_ago}}
                ),
            },
            "bookings": {
                "total": await db.booking.count(),
                "confirmed": await db.booking.count(where={"status": "CONFIRMED"}),
                "completed": await db.booking.count(where={"status": "COMPLETED"}),
                "cancelled": await db.booking.count(where={"status": "CANCELLED"}),
                "upcoming": await db.booking.count(
                    where={"time": {"gte": now}, "status": {"in": ["PENDING", "CONFIRMED"]}}
                ),
                # The queue that matters: paid, upcoming, and nobody assigned.
                "unassigned": await db.booking.count(
                    where={
                        "clinicianId": None,
                        "time": {"gte": now},
                        "status": {"in": ["PENDING", "CONFIRMED"]},
                    }
                ),
                "today": await db.booking.count(
                    where={"time": {"gte": now - timedelta(hours=now.hour), "lt": day_end}}
                ),
            },
            "screenings": {
                "posture": await db.postureanalysis.count(),
                "gait": await db.gaitanalysis.count(),
                "rom": await db.romanalysis.count(),
                "thisWeek": (
                    await db.postureanalysis.count(
                        where={"analysisDate": {"gte": week_ago}}
                    )
                    + await db.gaitanalysis.count(
                        where={"analysisDate": {"gte": week_ago}}
                    )
                    + await db.romanalysis.count(
                        where={"analysisDate": {"gte": week_ago}}
                    )
                ),
            },
            "consultations": {
                "live": await db.videosession.count(
                    where={"status": {"in": ["WAITING", "LIVE"]}}
                ),
                "completed": await db.videosession.count(where={"status": "ENDED"}),
            },
            "exercisePlans": {
                # Drafts are work waiting on a clinician: every one is a patient who
                # finished a screening and has not been given their programme yet.
                "awaitingReview": await db.exerciseplan.count(where={"status": "DRAFT"}),
                "active": await db.exerciseplan.count(where={"status": "ACTIVE"}),
                "completed": await db.exerciseplan.count(where={"status": "COMPLETED"}),
            },
        }


def _analysis_summary(analysis, analysis_type: str) -> Dict[str, Any]:
    """
    One analysis, without its metric payload.

    The payload is tens of kilobytes per row, and a patient with forty screenings
    would otherwise return several megabytes to render a list of dates.
    """
    return {
        "id": analysis.id,
        "type": analysis_type,
        "bookingId": analysis.bookingId,
        "analysisDate": analysis.analysisDate,
        "status": getattr(analysis, "status", None),
        "schemaVersion": getattr(analysis, "schemaVersion", None),
    }
