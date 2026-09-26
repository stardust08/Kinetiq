"""
Video consultation lifecycle.

A consultation is a row, a signalling room, and a permission. The row is the audit
record - who met whom, when, and who authorised the screening that came out of it. The
room is in-memory and disappears when the call ends (see signaling.py). The permission
is `screeningEnabled`, and it is the reason this module exists rather than the call
being a thin WebSocket with no database behind it.

The rule the whole module is built around: **a patient cannot start a screening on
their own.** A capture produces joint angles that go into a clinical record and drive a
prescription. The patient is the subject of that measurement, not its operator - they
cannot see whether they are square to the camera, and they have no way to judge whether
a reading is plausible. So a clinician or admin opens the consultation, watches, and
unlocks the capture; the patient's browser is handed a one-shot token and may start
exactly one screening with it.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.authz import (
    assert_can_access_booking,
    video_session_scope_filter,
)
from app.core.config import settings
from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.roles import Role, is_admin, is_clinician, is_patient
from app.db.client import db

#: Booking states in which a consultation may be held. A cancelled booking has no
#: appointment to hold, and a PENDING one has not been paid for.
JOINABLE_BOOKING_STATUSES = ("CONFIRMED", "COMPLETED")

#: Screenings a consultation can authorise. Matches the AnalysisType enum.
SCREENING_TYPES = ("POSTURE", "GAIT", "ROM")

_INCLUDE = {
    "patient": True,
    "clinician": True,
    "booking": {"include": {"service": True}},
    "participants": True,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _participant_role(user) -> str:
    if is_admin(user):
        return "ADMIN"
    if is_clinician(user):
        return "CLINICIAN"
    return "PATIENT"


class VideoSessionService:
    # -------------------------------------------------------------------
    # Creation and lookup
    # -------------------------------------------------------------------

    @staticmethod
    async def create_for_booking(
        staff_user,
        booking_id: str,
        *,
        scheduled_at: Optional[datetime] = None,
    ) -> Any:
        """
        Open (or return) the consultation for a booking. Staff only.

        Idempotent on purpose. A clinician clicking "start consultation" twice, or two
        admins opening the same appointment, must land in the same room - creating a
        second session would put the clinician and the patient in different rooms, each
        looking at a black rectangle waiting for the other.
        """
        booking = await db.booking.find_unique(
            where={"id": booking_id}, include={"user": True, "service": True}
        )
        if booking is None:
            raise NotFoundException("Booking not found.")

        # An admin may open any consultation; a clinician only one assigned to them.
        assert_can_access_booking(staff_user, booking)

        if booking.status not in JOINABLE_BOOKING_STATUSES:
            raise BadRequestException(
                f"Booking status '{booking.status}' cannot host a consultation. "
                "Only a confirmed or completed booking can."
            )

        existing = await db.videosession.find_first(
            where={
                "bookingId": booking_id,
                "status": {"in": ["SCHEDULED", "WAITING", "LIVE"]},
            },
            include=_INCLUDE,
            order={"createdAt": "desc"},
        )
        if existing is not None:
            # Claim an unassigned session for the clinician opening it, so the audit
            # trail records who actually took the appointment.
            if existing.clinicianId is None and is_clinician(staff_user):
                existing = await db.videosession.update(
                    where={"id": existing.id},
                    data={"clinicianId": staff_user.id},
                    include=_INCLUDE,
                )
            return existing

        session = await db.videosession.create(
            data={
                "bookingId": booking_id,
                "patientId": booking.userId,
                "clinicianId": (
                    staff_user.id if is_clinician(staff_user) else booking.clinicianId
                ),
                # 32 hex characters of entropy. Deriving the room name from the booking
                # id would let anybody holding a booking id join the call.
                "roomName": f"neura-{secrets.token_hex(16)}",
                "status": "SCHEDULED",
                "scheduledAt": scheduled_at or booking.time,
            },
            include=_INCLUDE,
        )
        await VideoSessionService.record_event(
            session.id, staff_user.id, "session_created", {"bookingId": booking_id}
        )
        return session

    @staticmethod
    async def get_for_user(user, session_id: str) -> Any:
        """One consultation, or 404 if this caller has no claim on it."""
        session = await db.videosession.find_first(
            where={"id": session_id, **video_session_scope_filter(user)},
            include=_INCLUDE,
        )
        if session is None:
            raise NotFoundException("Consultation not found or access denied.")
        return session

    @staticmethod
    async def get_active_for_booking(user, booking_id: str) -> Optional[Any]:
        """
        The consultation a patient should join for this booking, if one is open.

        Returns None rather than raising: "your clinician has not started the call yet"
        is the normal state of a waiting room, not an error.
        """
        return await db.videosession.find_first(
            where={
                "bookingId": booking_id,
                "status": {"in": ["SCHEDULED", "WAITING", "LIVE"]},
                **video_session_scope_filter(user),
            },
            include=_INCLUDE,
            order={"createdAt": "desc"},
        )

    @staticmethod
    async def list_for_user(
        user, *, status: Optional[str] = None, limit: int = 50, offset: int = 0
    ) -> List[Any]:
        where: Dict[str, Any] = dict(video_session_scope_filter(user))
        if status:
            where["status"] = status.upper()
        return await db.videosession.find_many(
            where=where,
            include=_INCLUDE,
            order={"createdAt": "desc"},
            take=min(limit, 100),
            skip=offset,
        )

    # -------------------------------------------------------------------
    # Joining
    # -------------------------------------------------------------------

    @staticmethod
    async def join(user, session_id: str) -> Dict[str, Any]:
        """
        Everything a browser needs to enter the room.

        Returns the ICE configuration, the caller's permissions, and the current
        screening authorisation. Permissions are computed server-side and sent for the
        UI's benefit only - the frontend uses them to decide which buttons to draw, and
        every one of them is re-checked on the endpoint that acts.
        """
        session = await VideoSessionService.get_for_user(user, session_id)

        if session.status in ("ENDED", "CANCELLED"):
            raise ConflictException(
                "This consultation has ended. Ask your clinician to start a new one."
            )

        staff = is_clinician(user) or is_admin(user)

        # A patient arriving before the clinician waits. Moving the session to WAITING
        # rather than LIVE is what lets the clinician's dashboard show "patient is
        # waiting" instead of "scheduled".
        if session.status == "SCHEDULED":
            new_status = "LIVE" if staff else "WAITING"
            data: Dict[str, Any] = {"status": new_status}
            if staff:
                data["startedAt"] = _now()
                data["startedById"] = user.id
                if session.clinicianId is None and is_clinician(user):
                    data["clinicianId"] = user.id
            session = await db.videosession.update(
                where={"id": session.id}, data=data, include=_INCLUDE
            )
        elif session.status == "WAITING" and staff:
            session = await db.videosession.update(
                where={"id": session.id},
                data={
                    "status": "LIVE",
                    "startedAt": session.startedAt or _now(),
                    "startedById": session.startedById or user.id,
                    **(
                        {"clinicianId": user.id}
                        if session.clinicianId is None and is_clinician(user)
                        else {}
                    ),
                },
                include=_INCLUDE,
            )

        return {
            "session": VideoSessionService.serialise(session, viewer=user),
            "iceServers": settings.ice_servers,
            "role": _participant_role(user),
            "permissions": VideoSessionService.permissions_for(user, session),
        }

    @staticmethod
    def permissions_for(user, session) -> Dict[str, bool]:
        """
        What this caller may do in this room.

        `canStartScreening` is the one that matters and the one the frontend must not
        be trusted on: it is enforced again in app/core/screening_gate.py on the
        endpoint that actually begins a capture.
        """
        staff = is_clinician(user) or is_admin(user)
        return {
            "canStartScreening": staff,
            "canEndSession": staff,
            "canWriteClinicalNotes": staff,
            "canInviteParticipants": staff,
            "canShareScreen": True,
            "canChat": True,
            # A patient performs the capture - they stand in front of the camera - but
            # only once staff have unlocked it for them.
            "canPerformScreening": is_patient(user) or staff,
        }

    # -------------------------------------------------------------------
    # The screening gate
    # -------------------------------------------------------------------

    @staticmethod
    async def enable_screening(
        staff_user, session_id: str, screening_type: str
    ) -> Dict[str, Any]:
        """
        Unlock one screening for the patient in this room. Staff only.

        Mints a single-use token with a short life. The token is the thing the
        patient's browser presents to `/start-analysis`, and it is what ties a set of
        joint angles back to the clinician who stood behind them.
        """
        screening_type = (screening_type or "").upper()
        if screening_type not in SCREENING_TYPES:
            raise BadRequestException(
                f"Unknown screening type '{screening_type}'. "
                f"Expected one of: {', '.join(SCREENING_TYPES)}."
            )

        session = await VideoSessionService.get_for_user(staff_user, session_id)

        if not (is_clinician(staff_user) or is_admin(staff_user)):
            raise ForbiddenException(
                "Only a clinician or administrator can start a screening."
            )
        if session.status not in ("WAITING", "LIVE"):
            raise ConflictException(
                "The consultation must be running before a screening can be started."
            )

        booking = await db.booking.find_unique(where={"id": session.bookingId})
        if booking is None:
            raise NotFoundException("Booking not found.")
        if booking.remainingScreeningCount <= 0:
            # Caught here as well as in the analysis services, so the clinician is told
            # before the patient has been asked to stand up and hold four poses.
            raise BadRequestException(
                "This booking has no screenings remaining."
            )

        token = secrets.token_urlsafe(32)
        expires = _now() + timedelta(minutes=settings.SCREENING_TOKEN_TTL_MINUTES)

        session = await db.videosession.update(
            where={"id": session.id},
            data={
                "screeningEnabled": True,
                "screeningEnabledAt": _now(),
                "screeningEnabledById": staff_user.id,
                "screeningType": screening_type,
                "screeningToken": token,
                "screeningTokenExpiresAt": expires,
                # A previous capture's consumption must not carry over, or the new
                # token would be born spent.
                "screeningConsumedAt": None,
            },
            include=_INCLUDE,
        )
        await VideoSessionService.record_event(
            session.id,
            staff_user.id,
            "screening_enabled",
            {"screeningType": screening_type, "expiresAt": expires.isoformat()},
        )

        return {
            "session": VideoSessionService.serialise(session, viewer=staff_user),
            "screeningToken": token,
            "screeningType": screening_type,
            "expiresAt": expires,
        }

    @staticmethod
    async def revoke_screening(staff_user, session_id: str) -> Any:
        """
        Withdraw the authorisation. Staff only.

        Needed for the case where the clinician unlocks a capture, the patient's camera
        turns out to be unusable, and the consultation moves on - leaving a live token
        behind would let that capture start hours later with nobody watching.
        """
        session = await VideoSessionService.get_for_user(staff_user, session_id)
        if not (is_clinician(staff_user) or is_admin(staff_user)):
            raise ForbiddenException(
                "Only a clinician or administrator can withdraw a screening."
            )
        session = await db.videosession.update(
            where={"id": session.id},
            data={
                "screeningEnabled": False,
                "screeningToken": None,
                "screeningTokenExpiresAt": None,
                "screeningType": None,
            },
            include=_INCLUDE,
        )
        await VideoSessionService.record_event(
            session.id, staff_user.id, "screening_revoked", None
        )
        return session

    @staticmethod
    async def consume_screening_token(session_id: str, analysis_id: str) -> None:
        """
        Spend the authorisation once its capture has been finalised.

        Called by the analysis services after an analysis row exists. Clearing the
        token is what makes it single-use: without this, one unlock would let a patient
        run screenings all afternoon and bill every one of them to the same clinician's
        supervision.
        """
        await db.videosession.update(
            where={"id": session_id},
            data={
                "screeningEnabled": False,
                "screeningConsumedAt": _now(),
                "screeningToken": None,
                "screeningTokenExpiresAt": None,
            },
        )
        await VideoSessionService.record_event(
            session_id, None, "screening_completed", {"analysisId": analysis_id}
        )

    # -------------------------------------------------------------------
    # Ending
    # -------------------------------------------------------------------

    @staticmethod
    async def end(user, session_id: str, *, notes: Optional[str] = None) -> Any:
        """
        Close the consultation. Staff only.

        A patient closing their browser leaves the call; it does not end the
        appointment, because the clinician may still be writing notes and because a
        dropped connection on a train would otherwise end the consultation for good.
        """
        session = await VideoSessionService.get_for_user(user, session_id)
        if not (is_clinician(user) or is_admin(user)):
            raise ForbiddenException(
                "Only a clinician or administrator can end a consultation."
            )
        if session.status in ("ENDED", "CANCELLED"):
            return session

        data: Dict[str, Any] = {
            "status": "ENDED",
            "endedAt": _now(),
            "endedById": user.id,
            # Never leave a live authorisation behind on a closed consultation.
            "screeningEnabled": False,
            "screeningToken": None,
            "screeningTokenExpiresAt": None,
        }
        if notes is not None:
            data["clinicalNotes"] = notes

        session = await db.videosession.update(
            where={"id": session.id}, data=data, include=_INCLUDE
        )
        await db.videosessionparticipant.update_many(
            where={"sessionId": session.id, "leftAt": None},
            data={"leftAt": _now()},
        )
        await VideoSessionService.record_event(session.id, user.id, "ended", None)
        return session

    @staticmethod
    async def save_notes(user, session_id: str, notes: str) -> Any:
        session = await VideoSessionService.get_for_user(user, session_id)
        if not (is_clinician(user) or is_admin(user)):
            raise ForbiddenException("Only a clinician or administrator can write notes.")
        return await db.videosession.update(
            where={"id": session.id}, data={"clinicalNotes": notes}, include=_INCLUDE
        )

    # -------------------------------------------------------------------
    # Participants and audit
    # -------------------------------------------------------------------

    @staticmethod
    async def register_participant(
        session_id: str, user, connection_id: str
    ) -> Any:
        """Record a peer entering the room. One browser tab is one peer."""
        existing = await db.videosessionparticipant.find_first(
            where={"sessionId": session_id, "connectionId": connection_id}
        )
        if existing is not None:
            return await db.videosessionparticipant.update(
                where={"id": existing.id}, data={"leftAt": None}
            )
        return await db.videosessionparticipant.create(
            data={
                "sessionId": session_id,
                "userId": user.id,
                "role": _participant_role(user),
                "connectionId": connection_id,
            }
        )

    @staticmethod
    async def mark_participant_left(session_id: str, connection_id: str) -> None:
        await db.videosessionparticipant.update_many(
            where={
                "sessionId": session_id,
                "connectionId": connection_id,
                "leftAt": None,
            },
            data={"leftAt": _now()},
        )

    @staticmethod
    async def record_event(
        session_id: str,
        user_id: Optional[str],
        event_type: str,
        payload: Optional[Dict[str, Any]],
    ) -> None:
        """
        Append to the consultation's audit trail.

        Failures are swallowed but LOGGED. This is a record of what happened, and losing
        one line of it is better than aborting the action it was describing - a clinician
        must not be unable to end a call because an audit insert failed. Logging is the
        other half of that bargain: a silent `except: pass` here hid a real bug for as
        long as it existed (see below), because the only symptom was a missing row.

        The `payload` key is OMITTED rather than set to None when there is nothing to
        record. Passing an explicit None for a nullable Json column is rejected by the
        client, so every event without a payload - "screening_revoked", "ended", "left" -
        failed to insert while the ones carrying a payload succeeded. The audit trail
        looked like it worked.
        """
        from prisma import Json

        data: Dict[str, Any] = {
            "sessionId": session_id,
            "userId": user_id,
            "type": event_type,
        }
        if payload is not None:
            data["payload"] = Json(payload)

        try:
            await db.videosessionevent.create(data=data)
        except Exception:  # pragma: no cover - audit must never break the call
            import logging

            logging.getLogger(__name__).warning(
                "could not record '%s' on consultation %s", event_type, session_id,
                exc_info=True,
            )

    @staticmethod
    async def list_events(user, session_id: str, limit: int = 200) -> List[Any]:
        await VideoSessionService.get_for_user(user, session_id)
        return await db.videosessionevent.find_many(
            where={"sessionId": session_id},
            order={"createdAt": "asc"},
            take=min(limit, 500),
        )

    # -------------------------------------------------------------------
    # Serialisation
    # -------------------------------------------------------------------

    @staticmethod
    def serialise(session, *, viewer=None) -> Dict[str, Any]:
        """
        A consultation as the API returns it.

        `screeningToken` is never included. It is returned exactly once, from
        `enable_screening`, to the staff member who created it; putting it in the
        general session payload would hand it to the patient on every poll and defeat
        the point of it being an authorisation.
        """
        booking = getattr(session, "booking", None)
        patient = getattr(session, "patient", None)
        clinician = getattr(session, "clinician", None)
        participants = getattr(session, "participants", None) or []
        staff_viewer = viewer is not None and (is_clinician(viewer) or is_admin(viewer))

        return {
            "id": session.id,
            "bookingId": session.bookingId,
            "roomName": session.roomName,
            "status": session.status,
            "scheduledAt": session.scheduledAt,
            "startedAt": session.startedAt,
            "endedAt": session.endedAt,
            "screening": {
                "enabled": session.screeningEnabled,
                "type": session.screeningType,
                "enabledAt": session.screeningEnabledAt,
                "expiresAt": session.screeningTokenExpiresAt,
                "consumedAt": session.screeningConsumedAt,
            },
            "patient": (
                {
                    "id": patient.id,
                    "name": patient.name,
                    "profileImage": patient.profileImage,
                    # A patient's phone number is staff-facing contact detail, not
                    # something to echo back into the patient's own call payload.
                    **({"phone": patient.phone} if staff_viewer else {}),
                }
                if patient
                else None
            ),
            "clinician": (
                {
                    "id": clinician.id,
                    "name": clinician.name,
                    "profileImage": clinician.profileImage,
                }
                if clinician
                else None
            ),
            "booking": (
                {
                    "id": booking.id,
                    "time": booking.time,
                    "status": booking.status,
                    "remainingScreeningCount": booking.remainingScreeningCount,
                    "service": (
                        {"id": booking.service.id, "name": booking.service.name}
                        if getattr(booking, "service", None)
                        else None
                    ),
                }
                if booking
                else None
            ),
            "clinicalNotes": session.clinicalNotes if staff_viewer else None,
            "activeParticipants": [
                {
                    "userId": p.userId,
                    "role": p.role,
                    "connectionId": p.connectionId,
                    "joinedAt": p.joinedAt,
                }
                for p in participants
                if getattr(p, "leftAt", None) is None
            ],
            "createdAt": session.createdAt,
        }
