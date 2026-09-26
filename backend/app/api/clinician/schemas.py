"""Request shapes for the clinician API."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class AvailabilityWindow(BaseModel):
    """
    One recurring weekly working window.

    Minutes from midnight rather than a time string: a weekly pattern has no date, and
    the arithmetic slot generation does on it is minute arithmetic. The UI renders the
    labels.
    """

    dayOfWeek: int = Field(..., ge=0, le=6, description="0 = Monday, 6 = Sunday")
    startMinute: int = Field(..., ge=0, le=1439, description="Minutes from midnight")
    endMinute: int = Field(..., ge=1, le=1440)


class SetAvailabilityRequest(BaseModel):
    """
    Replace the whole week.

    A whole-week replace rather than per-row edits, because the UI is a weekly grid and
    reconciling partial updates on the client is how a day quietly disappears.
    """

    windows: List[AvailabilityWindow]


class UpdateClinicianProfileRequest(BaseModel):
    specialisation: Optional[str] = None
    qualifications: Optional[str] = None
    yearsExperience: Optional[int] = Field(None, ge=0, le=70)
    bio: Optional[str] = None
    languages: Optional[str] = Field(None, description="Comma-separated.")
    consultationModes: Optional[str] = Field(None, description="Comma-separated.")
    isAcceptingPatients: Optional[bool] = None
    timezone: Optional[str] = None
    slotDurationMinutes: Optional[int] = Field(None, ge=5, le=240)
    maxDailyBookings: Optional[int] = Field(None, ge=1, le=50)
    registrationNo: Optional[str] = Field(
        None, description="Admin only. Ignored when a clinician sends it about themselves."
    )


class AddTimeOffRequest(BaseModel):
    startAt: datetime
    endAt: datetime
    reason: Optional[str] = None


class BookForPatientRequest(BaseModel):
    """
    A clinician booking an appointment on a patient's behalf.

    The follow-up path: finish a consultation, book the patient back in, no checkout.
    """

    patientId: str
    serviceId: str
    slotTime: datetime
    clinicianId: Optional[str] = Field(
        None,
        description="Admin only - which clinician's calendar. A clinician always books "
        "into their own.",
    )
    description: Optional[str] = None
