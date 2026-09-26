"""
Admin endpoints.

Every route in this file sits behind `get_current_admin`. There is no partial access
here: a clinician who needs a cross-patient view gets it from /api/clinician, scoped to
their own caseload.
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.api.admin.schemas import (
    AssignClinicianRequest,
    CreateClinicianRequest,
    UpdateUserRoleRequest,
    UpdateUserStatusRequest,
)
from app.api.admin.service import AdminService
from app.core.config import settings
from app.core.dependencies import get_current_admin
from app.core.exceptions import BadRequestException, NotFoundException

admin_router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


@admin_router.get("/stats", response_model=dict)
async def get_stats(user=Depends(get_current_admin)):
    """Headline counts for the admin dashboard."""
    return {"data": await AdminService.platform_stats()}


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@admin_router.get("/users", response_model=dict)
async def list_users(
    role: Optional[str] = Query(None, description="patient | clinician | admin"),
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_admin),
):
    return {
        "data": await AdminService.list_users(
            role=role, status=status, search=search, limit=limit, offset=offset
        )
    }


@admin_router.get("/users/{user_id}", response_model=dict)
async def get_user(user_id: str, user=Depends(get_current_admin)):
    return {"data": await AdminService.get_user(user_id)}


@admin_router.patch("/users/{user_id}/status", response_model=dict)
async def set_user_status(
    user_id: str, request: UpdateUserStatusRequest, user=Depends(get_current_admin)
):
    """Activate, deactivate or block an account."""
    return {"data": await AdminService.set_user_status(user, user_id, request.status)}


@admin_router.patch("/users/{user_id}/role", response_model=dict)
async def set_user_role(
    user_id: str, request: UpdateUserRoleRequest, user=Depends(get_current_admin)
):
    """
    Change somebody's role.

    Promoting to clinician creates their profile and calendar at the same time.
    Demoting one who still has upcoming appointments is refused - reassign first.
    """
    return {"data": await AdminService.set_user_role(user, user_id, request.role)}


# ---------------------------------------------------------------------------
# Clinicians
# ---------------------------------------------------------------------------


@admin_router.get("/clinicians", response_model=dict)
async def list_clinicians(
    includeInactive: bool = False,
    limit: int = 100,
    offset: int = 0,
    user=Depends(get_current_admin),
):
    return {
        "data": await AdminService.list_clinicians(
            include_inactive=includeInactive, limit=limit, offset=offset
        )
    }


@admin_router.post("/clinicians", response_model=dict)
async def create_clinician(
    request: CreateClinicianRequest, user=Depends(get_current_admin)
):
    """Create a clinician account and profile together."""
    return {"data": await AdminService.create_clinician(request.model_dump())}


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------


@admin_router.get("/patients", response_model=dict)
async def list_patients(
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_admin),
):
    """
    Every patient, with counts.

    Counts only. The measurements live behind /patients/{id}, so browsing the list
    does not hand an admin every patient's clinical data on the way past.
    """
    return {
        "data": await AdminService.list_patients(
            search=search, limit=limit, offset=offset
        )
    }


@admin_router.get("/patients/{patient_id}", response_model=dict)
async def get_patient_record(patient_id: str, user=Depends(get_current_admin)):
    """One patient's full record: bookings, screenings, plans, consultations."""
    return {"data": await AdminService.get_patient_record(patient_id)}


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------


@admin_router.get("/bookings", response_model=dict)
async def list_bookings(
    status: Optional[str] = None,
    clinicianId: Optional[str] = None,
    patientId: Optional[str] = None,
    unassignedOnly: bool = False,
    dateFrom: Optional[datetime] = None,
    dateTo: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_admin),
):
    """
    Every booking, filterable.

    `unassignedOnly=true` is the admin's working queue: paid, upcoming appointments
    with no clinician on them. A booking in that state cannot host a consultation, so
    the queue has to be kept empty.
    """
    return {
        "data": await AdminService.list_bookings(
            status=status,
            clinician_id=clinicianId,
            patient_id=patientId,
            unassigned_only=unassignedOnly,
            date_from=dateFrom,
            date_to=dateTo,
            limit=limit,
            offset=offset,
        )
    }


@admin_router.patch("/bookings/{booking_id}/assign", response_model=dict)
async def assign_booking(
    booking_id: str, request: AssignClinicianRequest, user=Depends(get_current_admin)
):
    """
    Assign or unassign a clinician.

    Delegates to BookingService.assign_clinician, which already validates that the
    target actually holds the CLINICIAN role - assigning a patient to their own
    appointment would give them a clinician's access to it.
    """
    from app.api.booking.service import BookingService
    from app.db.client import db

    if request.clinicianId is None:
        booking = await db.booking.find_unique(where={"id": booking_id})
        if booking is None:
            raise NotFoundException("Booking not found.")
        updated = await db.booking.update(
            where={"id": booking_id},
            data={"clinicianId": None},
            include={"service": True, "payment": True},
        )
        return {"data": updated}

    booking = await BookingService.assign_clinician(booking_id, request.clinicianId)
    return {"data": booking}


# ---------------------------------------------------------------------------
# Exercise videos
# ---------------------------------------------------------------------------

#: Only formats a browser can play natively. An admin uploading an .avi would produce
#: an exercise card with a player that shows nothing and reports no error.
_ALLOWED_VIDEO_TYPES = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}
_SAFE_NAME = re.compile(r"[^a-zA-Z0-9._-]")


@admin_router.post("/exercises/{exercise_id}/video", response_model=dict)
async def upload_exercise_video(
    exercise_id: str,
    file: UploadFile = File(...),
    user=Depends(get_current_admin),
):
    """
    Upload the demonstration video for an exercise. Admin only.

    The exercise library ships without video URLs - a real URL cannot be invented in a
    source file - so this is how a deployment fills them in. Files land under
    EXERCISE_VIDEO_DIR and are served from /static/exercise-videos.

    The filename is derived from the exercise slug rather than from the upload, because
    an attacker-supplied filename is how a path traversal gets written to disk.
    """
    from app.api.exercise.service import ExerciseCatalogueService

    exercise = await ExerciseCatalogueService.get_exercise(exercise_id)

    extension = _ALLOWED_VIDEO_TYPES.get(file.content_type or "")
    if extension is None:
        raise BadRequestException(
            f"Unsupported video type '{file.content_type}'. Upload MP4, WebM or MOV - "
            f"a browser cannot play anything else without transcoding."
        )

    payload = await file.read()
    max_bytes = settings.EXERCISE_VIDEO_MAX_MB * 1024 * 1024
    if len(payload) > max_bytes:
        raise BadRequestException(
            f"That file is {len(payload) / 1024 / 1024:.0f} MB. The limit is "
            f"{settings.EXERCISE_VIDEO_MAX_MB} MB."
        )
    if not payload:
        raise BadRequestException("The uploaded file is empty.")

    directory = settings.EXERCISE_VIDEO_DIR
    os.makedirs(directory, exist_ok=True)
    safe_slug = _SAFE_NAME.sub("-", exercise.slug)
    filename = f"{safe_slug}{extension}"
    path = os.path.join(directory, filename)

    with open(path, "wb") as handle:
        handle.write(payload)

    updated = await ExerciseCatalogueService.update_exercise(
        user,
        exercise.id,
        {
            "videoUrl": f"/static/exercise-videos/{filename}",
            "videoProvider": "mp4" if extension == ".mp4" else extension.lstrip("."),
        },
    )
    return {
        "data": {
            "id": updated.id,
            "slug": updated.slug,
            "videoUrl": updated.videoUrl,
            "sizeBytes": len(payload),
        }
    }
