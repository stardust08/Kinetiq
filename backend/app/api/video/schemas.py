"""Request and response shapes for the video consultation API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    bookingId: str = Field(..., description="Booking the consultation belongs to")
    scheduledAt: Optional[datetime] = Field(
        None,
        description="Overrides the booking time. Used when a consultation is moved "
        "without moving the appointment itself.",
    )


class EnableScreeningRequest(BaseModel):
    screeningType: str = Field(
        ...,
        description="POSTURE | GAIT | ROM. The capture the patient is being authorised "
        "to perform in this consultation.",
    )


class EndSessionRequest(BaseModel):
    clinicalNotes: Optional[str] = Field(
        None, description="Saved onto the consultation as it closes."
    )


class SaveNotesRequest(BaseModel):
    clinicalNotes: str


class ScreeningAuthorisation(BaseModel):
    enabled: bool
    type: Optional[str] = None
    enabledAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None
    consumedAt: Optional[datetime] = None


class VideoSessionResponse(BaseModel):
    """
    A consultation as returned to any participant.

    Note the absence of `screeningToken`. It is returned exactly once, by
    POST /sessions/{id}/enable-screening, to the staff member who minted it.
    """

    id: str
    bookingId: str
    roomName: str
    status: str
    scheduledAt: Optional[datetime] = None
    startedAt: Optional[datetime] = None
    endedAt: Optional[datetime] = None
    screening: ScreeningAuthorisation
    patient: Optional[Dict[str, Any]] = None
    clinician: Optional[Dict[str, Any]] = None
    booking: Optional[Dict[str, Any]] = None
    clinicalNotes: Optional[str] = None
    activeParticipants: List[Dict[str, Any]] = []
    createdAt: Optional[datetime] = None


class JoinResponse(BaseModel):
    session: VideoSessionResponse
    iceServers: List[Dict[str, Any]]
    role: str
    permissions: Dict[str, bool]


class EnableScreeningResponse(BaseModel):
    session: VideoSessionResponse
    screeningToken: str
    screeningType: str
    expiresAt: datetime
