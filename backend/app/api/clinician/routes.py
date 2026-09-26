"""
Clinician endpoints.

Split by who the route is *about*, not only by who may call it:

  * `/me/...` acts on the caller's own calendar and caseload. Clinician only - an
    admin has no calendar of their own, and letting them call these would silently
    create an empty profile against an admin account.
  * everything else takes an explicit clinician or patient id and admits admins too.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.clinician.schemas import (
    AddTimeOffRequest,
    BookForPatientRequest,
    SetAvailabilityRequest,
    UpdateClinicianProfileRequest,
)
from app.api.clinician.service import ClinicianService
from app.core.dependencies import (
    get_current_active_user,
    get_current_clinician,
    get_current_staff,
)

clinician_router = APIRouter(prefix="/clinician", tags=["clinician"])


# ---------------------------------------------------------------------------
# Profile and availability
# ---------------------------------------------------------------------------


@clinician_router.get("/me", response_model=dict)
async def get_my_profile(user=Depends(get_current_clinician)):
    """The caller's own profile, weekly hours and time off."""
    return {"data": await ClinicianService.get_profile(user)}


@clinician_router.patch("/me", response_model=dict)
async def update_my_profile(
    request: UpdateClinicianProfileRequest, user=Depends(get_current_clinician)
):
    return {
        "data": await ClinicianService.update_profile(
            user, request.model_dump(exclude_none=True)
        )
    }


@clinician_router.put("/me/availability", response_model=dict)
async def set_my_availability(
    request: SetAvailabilityRequest, user=Depends(get_current_clinician)
):
    """
    Replace the caller's weekly working hours.

    Slot generation reads these: a day with no window configured offers no slots at
    all, once the clinician has configured any day. A clinician who has never used the
    feature falls back to the platform's 08:00-20:00 default rather than vanishing from
    every booking page.
    """
    windows = [w.model_dump() for w in request.windows]
    return {"data": await ClinicianService.set_availability(user, windows)}


@clinician_router.post("/me/time-off", response_model=dict)
async def add_time_off(
    request: AddTimeOffRequest, user=Depends(get_current_clinician)
):
    """
    Block out leave.

    Refused when appointments are already booked inside the window - marking leave over
    them does not move them, and the clash would otherwise be discovered by not turning
    up.
    """
    entry = await ClinicianService.add_time_off(
        user, request.startAt, request.endAt, request.reason
    )
    return {
        "data": {
            "id": entry.id,
            "startAt": entry.startAt,
            "endAt": entry.endAt,
            "reason": entry.reason,
        }
    }


@clinician_router.delete("/me/time-off/{time_off_id}", response_model=dict)
async def remove_time_off(time_off_id: str, user=Depends(get_current_clinician)):
    await ClinicianService.remove_time_off(user, time_off_id)
    return {"data": {"message": "Time off removed."}}


@clinician_router.get("/{clinician_id}/profile", response_model=dict)
async def get_clinician_profile(clinician_id: str, user=Depends(get_current_staff)):
    """Another clinician's profile. Admin, or the clinician themselves."""
    return {"data": await ClinicianService.get_profile(user, clinician_id)}


@clinician_router.put("/{clinician_id}/availability", response_model=dict)
async def set_clinician_availability(
    clinician_id: str,
    request: SetAvailabilityRequest,
    user=Depends(get_current_staff),
):
    """Set another clinician's hours. Admin only - enforced in the service."""
    windows = [w.model_dump() for w in request.windows]
    return {
        "data": await ClinicianService.set_availability(user, windows, clinician_id)
    }


@clinician_router.get("/{clinician_id}/slots", response_model=dict)
async def get_clinician_slots(
    clinician_id: str,
    slot_date: date = Query(..., alias="date", description="YYYY-MM-DD"),
    durationMinutes: int = Query(30, ge=5, le=240),
    user=Depends(get_current_active_user),
):
    """
    Bookable slots for one clinician on one date.

    Open to patients: it is what the booking page asks in order to show a particular
    clinician's free times. It returns availability, never anybody's identity or
    appointments.
    """
    slots = await ClinicianService.available_slots_for_clinician(
        clinician_id, slot_date, durationMinutes
    )
    return {
        "data": {
            "clinicianId": clinician_id,
            "date": slot_date.isoformat(),
            "slots": [{"slotTime": s} for s in slots],
        }
    }


# ---------------------------------------------------------------------------
# Caseload
# ---------------------------------------------------------------------------


@clinician_router.get("/me/schedule", response_model=dict)
async def get_my_schedule(
    dateFrom: Optional[datetime] = None,
    dateTo: Optional[datetime] = None,
    status: Optional[str] = None,
    limit: int = 100,
    user=Depends(get_current_clinician),
):
    """
    The caller's appointments, each carrying whether a consultation is open and whether
    the patient is already waiting in it.
    """
    return {
        "data": await ClinicianService.my_schedule(
            user, date_from=dateFrom, date_to=dateTo, status=status, limit=limit
        )
    }


@clinician_router.get("/me/patients", response_model=dict)
async def get_my_patients(
    search: Optional[str] = None, user=Depends(get_current_clinician)
):
    """
    The caller's caseload, derived from booking assignments.

    Sorted by next appointment, so the clinic's day is at the top of the list.
    """
    return {"data": await ClinicianService.my_patients(user, search=search)}


@clinician_router.get("/me/review-queue", response_model=dict)
async def get_review_queue(user=Depends(get_current_staff)):
    """
    Draft exercise plans waiting for review.

    Each row is a patient who completed a screening and has not yet been given their
    programme, because a draft is invisible to them until a clinician activates it.
    """
    return {"data": await ClinicianService.review_queue(user)}


@clinician_router.get("/patients/{patient_id}", response_model=dict)
async def get_patient_record(patient_id: str, user=Depends(get_current_staff)):
    """
    One patient's record, limited to the bookings assigned to the calling clinician.

    An admin gets the unrestricted record; a clinician who saw this patient once does
    not thereby gain access to everything another clinician recorded about them.
    """
    return {"data": await ClinicianService.patient_record(user, patient_id)}


# ---------------------------------------------------------------------------
# Booking on a patient's behalf
# ---------------------------------------------------------------------------


@clinician_router.post("/bookings", response_model=dict)
async def book_for_patient(
    request: BookForPatientRequest, user=Depends(get_current_staff)
):
    """
    Book an appointment for a patient. Clinician or admin.

    The follow-up path - finish a consultation and book the patient back in without
    sending them through checkout. The booking is created CONFIRMED with a zero-value
    payment marked CLINICIAN_BOOKED; see the service for why that is deliberate rather
    than a shortcut.
    """
    booking = await ClinicianService.book_for_patient(
        user,
        patient_id=request.patientId,
        service_id=request.serviceId,
        slot_time=request.slotTime,
        clinician_id=request.clinicianId,
        description=request.description,
    )
    return {"data": booking}
