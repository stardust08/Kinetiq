"""
Who may see, and who may act on, whose record.

Every module that touches patient data asks the same two questions - "is this booking
mine?" and "may I read this analysis?" - and before this file each answered them
itself. `app/api/posture/service.py` filtered on `userId`, `app/api/rom/service.py`
filtered on `userId`, and the booking module checked ownership in the route. That is
three copies of one rule, and adding a clinician who is allowed to read a patient's
screening would have meant finding all three.

So the rule lives here once, expressed two ways:

  * `assert_can_*` raises when the caller may not proceed. Use it when you already hold
    the row.
  * `*_scope_filter` returns a Prisma `where` fragment. Use it when you are about to
    query, so the database never returns rows the caller cannot see. This matters more
    than it looks: fetching first and checking after leaks existence - a 403 on a real
    booking id and a 404 on a fake one tells an attacker which ids are real.

The policy itself, in one sentence: a patient reaches exactly their own records, a
clinician reaches the records of patients whose bookings are assigned to them, and an
admin reaches everything.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.core.exceptions import ForbiddenException, NotFoundException
from app.core.roles import Role, is_admin, is_clinician, is_patient


# ---------------------------------------------------------------------------
# Query scoping
# ---------------------------------------------------------------------------


def booking_scope_filter(user) -> Dict[str, Any]:
    """
    Prisma `where` fragment restricting Booking rows to those `user` may see.

        bookings = await db.booking.find_many(
            where={**booking_scope_filter(user), "status": "CONFIRMED"}
        )

    An admin gets `{}` - no restriction. Merging `{}` into a larger filter is a no-op,
    which is why this returns a fragment rather than a complete filter.
    """
    role = Role.parse(user.role)
    if role is Role.ADMIN:
        return {}
    if role is Role.CLINICIAN:
        return {"clinicianId": user.id}
    return {"userId": user.id}


def patient_scope_filter(user) -> Dict[str, Any]:
    """
    Prisma `where` fragment restricting User rows to the patients `user` may see.

    A clinician sees a patient once that patient has a booking assigned to them;
    there is no other route by which a patient's record becomes visible to a
    clinician, and in particular browsing the full patient list is an admin action.
    """
    role = Role.parse(user.role)
    if role is Role.ADMIN:
        return {"role": Role.PATIENT.value}
    if role is Role.CLINICIAN:
        return {
            "role": Role.PATIENT.value,
            "bookings": {"some": {"clinicianId": user.id}},
        }
    # A patient's "patient list" is themselves.
    return {"id": user.id}


def analysis_scope_filter(user) -> Dict[str, Any]:
    """
    Prisma `where` fragment for PostureAnalysis / GaitAnalysis / ROMAnalysis.

    All three carry `userId` (the patient) and `bookingId`, so one fragment covers
    them. A clinician is scoped through the booking rather than through the analysis,
    because the assignment that grants access is recorded on the booking.
    """
    role = Role.parse(user.role)
    if role is Role.ADMIN:
        return {}
    if role is Role.CLINICIAN:
        return {"booking": {"is": {"clinicianId": user.id}}}
    return {"userId": user.id}


def plan_scope_filter(user) -> Dict[str, Any]:
    """
    Prisma `where` fragment for ExercisePlan.

    Note the extra clause for patients: a DRAFT plan is a machine suggestion that no
    clinician has looked at yet, and showing one to a patient would present an
    unreviewed algorithm as clinical advice. Staff see drafts precisely because
    reviewing them is their job.
    """
    role = Role.parse(user.role)
    if role is Role.ADMIN:
        return {}
    if role is Role.CLINICIAN:
        return {"booking": {"is": {"clinicianId": user.id}}}
    return {"patientId": user.id, "status": {"not": "DRAFT"}}


def video_session_scope_filter(user) -> Dict[str, Any]:
    """Prisma `where` fragment for VideoSession."""
    role = Role.parse(user.role)
    if role is Role.ADMIN:
        return {}
    if role is Role.CLINICIAN:
        # A clinician reaches a consultation they are assigned to, or one attached to
        # a booking assigned to them - the session may be created before the clinician
        # column on it is filled in.
        return {
            "OR": [
                {"clinicianId": user.id},
                {"booking": {"is": {"clinicianId": user.id}}},
            ]
        }
    return {"patientId": user.id}


# ---------------------------------------------------------------------------
# Assertions over a row already loaded
# ---------------------------------------------------------------------------


def can_access_booking(user, booking) -> bool:
    if booking is None:
        return False
    if is_admin(user):
        return True
    if is_clinician(user):
        return getattr(booking, "clinicianId", None) == user.id
    return getattr(booking, "userId", None) == user.id


def assert_can_access_booking(user, booking, *, action: str = "access") -> None:
    """
    Raise unless `user` may `action` this booking.

    Raises NotFoundException - not ForbiddenException - when the booking is missing OR
    out of scope. The two cases are deliberately indistinguishable from outside: a 403
    on somebody else's real booking id confirms that the id exists.
    """
    if booking is None or not can_access_booking(user, booking):
        raise NotFoundException("Booking not found or access denied.")


def can_modify_booking(user, booking) -> bool:
    """
    Who may cancel or reschedule.

    Same set as read access. Kept as its own function because the two will diverge -
    a clinician reading a booking they are not assigned to may become acceptable long
    before a clinician cancelling one does.
    """
    return can_access_booking(user, booking)


def assert_can_modify_booking(user, booking) -> None:
    if booking is None:
        raise NotFoundException("Booking not found or access denied.")
    if not can_modify_booking(user, booking):
        raise ForbiddenException("You do not have permission to modify this booking.")


def can_access_patient_record(user, patient_id: str, *, assigned_patient_ids=None) -> bool:
    """
    Whether `user` may read patient `patient_id`.

    `assigned_patient_ids` is the clinician's caseload, passed in rather than queried
    here so that a caller looping over many patients does not issue one query per
    patient. Omitted for a clinician, the answer is False - fail closed.
    """
    if is_admin(user):
        return True
    if is_patient(user):
        return user.id == patient_id
    if is_clinician(user):
        if assigned_patient_ids is None:
            return False
        return patient_id in set(assigned_patient_ids)
    return False


def assert_can_access_patient_record(user, patient_id: str, *, assigned_patient_ids=None) -> None:
    if not can_access_patient_record(
        user, patient_id, assigned_patient_ids=assigned_patient_ids
    ):
        raise NotFoundException("Patient not found or access denied.")


def can_access_analysis(user, analysis, booking=None) -> bool:
    """
    Whether `user` may read one analysis row.

    `booking` is optional but required for a clinician: the analysis itself records
    only the patient, and a clinician's claim runs through the booking assignment.
    """
    if analysis is None:
        return False
    if is_admin(user):
        return True
    if is_patient(user):
        return getattr(analysis, "userId", None) == user.id
    if is_clinician(user):
        if booking is None:
            booking = getattr(analysis, "booking", None)
        if booking is None:
            return False
        return getattr(booking, "clinicianId", None) == user.id
    return False


def assert_can_access_analysis(user, analysis, booking=None) -> None:
    if not can_access_analysis(user, analysis, booking):
        raise NotFoundException("Analysis not found or access denied.")


def can_review_plan(user) -> bool:
    """
    Only staff turn a machine-generated draft into a prescription.

    This is the whole reason PlanStatus.DRAFT exists, so it is checked rather than
    assumed anywhere a plan changes status.
    """
    return is_clinician(user) or is_admin(user)


def assert_can_review_plan(user) -> None:
    if not can_review_plan(user):
        raise ForbiddenException(
            "Only a clinician or administrator can review and prescribe an exercise plan."
        )


def can_start_screening(user) -> bool:
    """
    Who may begin a capture.

    A screening produces numbers that go into a clinical record, and the patient is
    the subject of the measurement rather than its operator. Enforced for real in
    app/core/screening_gate.py; this is the role half of that rule.
    """
    return is_clinician(user) or is_admin(user)


def resolve_target_patient_id(user, requested_patient_id: Optional[str]) -> str:
    """
    Work out which patient an endpoint is acting on.

    Staff endpoints take a patient id; the same endpoint called by a patient acts on
    themselves. Centralised because the failure mode when it is not - a patient
    passing somebody else's id into a staff-shaped endpoint - is a data breach rather
    than a bug.
    """
    if requested_patient_id is None:
        return user.id
    if is_patient(user) and requested_patient_id != user.id:
        raise ForbiddenException("You can only act on your own records.")
    return requested_patient_id
