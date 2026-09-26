"""Request shapes for the admin API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class CreateClinicianRequest(BaseModel):
    """
    Create a clinician account and its profile in one call.

    Phone is required because it is the identity OTP login keys off; everything else
    is optional so an admin can create the account now and let the clinician fill in
    their own biography later.
    """

    name: Optional[str] = None
    phone: str = Field(..., description="Login identity. Must be unique.")
    email: Optional[str] = None
    specialisation: Optional[str] = None
    qualifications: Optional[str] = None
    registrationNo: Optional[str] = Field(
        None, description="Professional registration number. Visible to admins only."
    )
    yearsExperience: Optional[int] = Field(None, ge=0, le=70)
    bio: Optional[str] = None
    languages: Optional[str] = Field(None, description="Comma-separated.")
    timezone: Optional[str] = Field(None, description="IANA name, e.g. Asia/Kolkata.")
    slotDurationMinutes: Optional[int] = Field(None, ge=5, le=240)
    maxDailyBookings: Optional[int] = Field(None, ge=1, le=50)


class UpdateUserStatusRequest(BaseModel):
    status: str = Field(..., description="ACTIVE | INACTIVE | BLOCKED")


class UpdateUserRoleRequest(BaseModel):
    role: str = Field(
        ...,
        description="USER (patient) | CLINICIAN | ADMIN. 'patient' and 'doctor' are "
        "accepted as aliases.",
    )


class AssignClinicianRequest(BaseModel):
    clinicianId: Optional[str] = Field(
        None,
        description="Null unassigns the booking, returning it to the admin queue.",
    )
