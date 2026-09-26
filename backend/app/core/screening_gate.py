"""
Who may start a screening, and under what conditions.

A screening measures a patient's joint angles and writes them into a clinical record
that a prescription is then derived from. Before this module, any signed-in patient
could start one from their own laptop, unobserved, and the resulting numbers entered
the record with nobody's name against them.

The rule now:

  * **A clinician or admin may start a screening directly.** They are operating the
    capture, and the analysis is recorded against their supervision.

  * **A patient may only start one inside a live consultation that staff have
    unlocked**, and must present the one-shot token minted when it was unlocked.

Why the patient cannot self-serve, stated once so it is not relitigated in each
service: the patient is the subject of the measurement, not its operator. They are
standing in front of the camera and cannot see whether they are square to it, whether
the frame has cut off their feet, or whether a 118-degree shoulder reading is a real
restriction or an arm that drifted behind their body. Every one of those failures
produces a number that looks fine and is wrong, and the pipeline's own quality flags
catch some but not all of them. A clinician watching the capture is the check.

This is enforced in one place because it must hold identically for posture, gait and
range of motion. Three copies of it would become two.

The `SUPERVISED_SCREENING_REQUIRED` setting turns the patient half off. It exists for
deployments that have decided unsupervised self-screening is acceptable, and for the
parts of the test suite written before supervision existed. It does not weaken the
staff path, and it never lets a spent or expired token through.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.roles import is_admin, is_clinician, is_patient
from app.db.client import db


class ScreeningAuthorisation:
    """
    The outcome of the gate: who is running this capture, and under whose supervision.

    Carried through to the analysis services so the finished analysis can record the
    consultation it came out of and spend the token that authorised it.
    """

    def __init__(
        self,
        *,
        patient_id: str,
        booking_id: str,
        operator_id: str,
        supervised: bool,
        session_id: Optional[str] = None,
        supervising_clinician_id: Optional[str] = None,
    ) -> None:
        self.patient_id = patient_id
        self.booking_id = booking_id
        #: The user who pressed start. Same as patient_id for a supervised self-capture.
        self.operator_id = operator_id
        self.supervised = supervised
        self.session_id = session_id
        self.supervising_clinician_id = supervising_clinician_id

    def to_dict(self) -> Dict[str, Any]:
        return {
            "patientId": self.patient_id,
            "bookingId": self.booking_id,
            "operatorId": self.operator_id,
            "supervised": self.supervised,
            "sessionId": self.session_id,
            "supervisingClinicianId": self.supervising_clinician_id,
        }


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: Optional[datetime]) -> Optional[datetime]:
    """
    Make a stored timestamp comparable to `now`.

    Postgres hands these back timezone-aware, SQLite and several test doubles hand them
    back naive, and comparing the two raises TypeError. Left unhandled, an expiry check
    against a naive timestamp does not reject the token - it raises, and a 500 on the
    gate is indistinguishable to the caller from the gate being broken open.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def authorise_screening(
    user,
    booking_id: str,
    screening_type: str,
    *,
    screening_token: Optional[str] = None,
    patient_id: Optional[str] = None,
) -> ScreeningAuthorisation:
    """
    Decide whether this caller may begin this capture, and against which booking.

    Raises rather than returning a boolean: there is no caller that wants to continue
    after a refusal, and a boolean invites one to be written.

    Args:
        user: the authenticated caller.
        booking_id: booking the screening is charged to.
        screening_type: POSTURE | GAIT | ROM. Checked against what the consultation
            actually authorised, so unlocking a posture capture does not silently
            permit a gait one.
        screening_token: the one-shot token from the consultation. Required for a
            patient when supervision is on; ignored for staff.
        patient_id: staff only - whose screening this is. Defaults to the booking owner.
    """
    screening_type = (screening_type or "").upper()

    booking = await db.booking.find_unique(where={"id": booking_id})
    if booking is None:
        # UnauthorizedException, matching what PostureAnalysisService, GaitAnalysisService
        # and ROMAnalysisService already raise for the same condition. The gate sits in
        # front of all three, and giving it a different status for an identical failure
        # would mean the same mistake produced a 404 or a 401 depending on how far the
        # request got. Whether 401 is the right code here at all is a separate question -
        # the frontend's interceptor clears the token on 401, so a patient who picks the
        # wrong booking is logged out - but changing it is not this feature's business.
        raise UnauthorizedException("Booking not found or access denied.")

    # ---- Staff path ----------------------------------------------------
    if is_clinician(user) or is_admin(user):
        # A clinician may only operate on a booking assigned to them; an admin on any.
        if is_clinician(user) and booking.clinicianId != user.id:
            raise UnauthorizedException("Booking not found or access denied.")

        target_patient = patient_id or booking.userId
        if target_patient != booking.userId:
            raise ForbiddenException(
                "That patient is not the owner of this booking."
            )

        session = await db.videosession.find_first(
            where={
                "bookingId": booking_id,
                "status": {"in": ["WAITING", "LIVE"]},
            },
            order={"createdAt": "desc"},
        )
        return ScreeningAuthorisation(
            patient_id=target_patient,
            booking_id=booking_id,
            operator_id=user.id,
            supervised=True,
            session_id=session.id if session else None,
            supervising_clinician_id=user.id,
        )

    # ---- Patient path --------------------------------------------------
    if not is_patient(user):
        raise ForbiddenException("Your account role cannot start a screening.")

    if booking.userId != user.id:
        raise UnauthorizedException("Booking not found or access denied.")

    if patient_id is not None and patient_id != user.id:
        # `patientId` is a staff override. Silently ignoring it for a patient would be
        # safe - the authorisation below is built from `user.id` regardless - but it
        # would also tell a client that a request it got wrong had succeeded, and the
        # next reader of this function would have to work out for themselves that the
        # field cannot be trusted. Reject it where it is read.
        raise ForbiddenException("You can only start a screening for yourself.")

    if not settings.SUPERVISED_SCREENING_REQUIRED:
        # Unsupervised self-screening, explicitly enabled for this deployment. The
        # analysis still records that no clinician supervised it, so a report drawn
        # from it can say so rather than implying a clinician stood behind the numbers.
        return ScreeningAuthorisation(
            patient_id=user.id,
            booking_id=booking_id,
            operator_id=user.id,
            supervised=False,
        )

    if not screening_token:
        raise ForbiddenException(
            "A screening has to be started by your clinician. Join your video "
            "consultation and your clinician will unlock the capture for you."
        )

    session = await db.videosession.find_first(
        where={"screeningToken": screening_token}
    )
    if session is None:
        raise ForbiddenException(
            "That screening authorisation is no longer valid. Ask your clinician to "
            "unlock the capture again."
        )

    # Each of the following is a separate way the same token can be the wrong one, and
    # each gets its own check so the message the patient sees is the true reason.
    if session.bookingId != booking_id:
        raise ForbiddenException(
            "That screening authorisation belongs to a different appointment."
        )
    if session.patientId != user.id:
        raise ForbiddenException("That screening authorisation is not yours.")
    if not session.screeningEnabled:
        raise ForbiddenException(
            "The screening has not been unlocked yet. Your clinician starts it from "
            "their side of the call."
        )
    if session.screeningConsumedAt is not None:
        raise ForbiddenException(
            "That authorisation has already been used. Ask your clinician to unlock "
            "another screening."
        )
    if session.status not in ("WAITING", "LIVE"):
        raise ForbiddenException(
            "The consultation is no longer running, so the screening cannot start."
        )

    expires = _as_aware(session.screeningTokenExpiresAt)
    if expires is not None and expires < _now():
        raise ForbiddenException(
            "That screening authorisation has expired. Ask your clinician to unlock "
            "the capture again."
        )

    authorised_type = (session.screeningType or "").upper()
    if authorised_type and screening_type and authorised_type != screening_type:
        raise ForbiddenException(
            f"Your clinician unlocked a {authorised_type.title()} screening, not a "
            f"{screening_type.title()} one."
        )

    return ScreeningAuthorisation(
        patient_id=user.id,
        booking_id=booking_id,
        operator_id=user.id,
        supervised=True,
        session_id=session.id,
        supervising_clinician_id=session.screeningEnabledById or session.clinicianId,
    )


async def consume_authorisation(
    authorisation: Optional[ScreeningAuthorisation], analysis_id: str
) -> None:
    """
    Spend the authorisation now that an analysis row exists.

    Called from finalize, not from start: a capture the patient abandoned halfway
    should leave the unlock usable, or the clinician has to unlock again for a capture
    that never produced anything.

    Failures here are swallowed. The analysis is already stored and the patient has
    already done the work; refusing to return their result because a token could not be
    cleared would be the wrong trade. The token expires on its own regardless.
    """
    if authorisation is None or authorisation.session_id is None:
        return
    try:
        from app.api.video.service import VideoSessionService

        await VideoSessionService.consume_screening_token(
            authorisation.session_id, analysis_id
        )
    except Exception:  # pragma: no cover - never fail a finished screening on this
        pass
