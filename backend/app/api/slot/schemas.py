"""
Slot schemas for request/response validation.

This module contains Pydantic models for slot management endpoints including
available slots, slot locking, and slot release operations.
"""

from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Optional


class AvailableSlot(BaseModel):
    """Single available time slot."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "slotTime": "2026-02-24T10:00:00Z"
            }
        }
    )
    
    slotTime: datetime = Field(..., description="Slot start time in ISO format")


class AvailableSlotsResponse(BaseModel):
    """Response with list of available slots for a service."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "serviceId": "cm5abc123xyz",
                "serviceName": "AI Assessment",
                "date": "2026-02-24",
                "duration": 30,
                "slots": [
                    {"slotTime": "2026-02-24T08:00:00Z"},
                    {"slotTime": "2026-02-24T08:30:00Z"},
                    {"slotTime": "2026-02-24T09:00:00Z"}
                ]
            }
        }
    )
    
    serviceId: str = Field(..., description="Service ID")
    serviceName: str = Field(..., description="Service name")
    clinicianId: Optional[str] = Field(
        None, description="Echoed back when the query was scoped to one clinician."
    )
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    duration: int = Field(..., description="Slot duration in minutes")
    slots: List[AvailableSlot] = Field(..., description="List of available time slots")


class LockSlotRequest(BaseModel):
    """Request to lock a time slot."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "serviceId": "cm5abc123xyz",
                "slotTime": "2026-02-24T10:00:00Z"
            }
        }
    )
    
    serviceId: str = Field(..., description="Service ID to lock slot for")
    clinicianId: Optional[str] = Field(
        None,
        description=(
            "Whose calendar the hold consumes. Null means the service-wide slot, which "
            "is the pre-existing behaviour; naming a clinician is what lets two of them "
            "be booked at the same hour."
        ),
    )
    slotTime: datetime = Field(..., description="Slot start time to lock")


class LockSlotResponse(BaseModel):
    """Response after successfully locking a slot."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "lockId": "lock-uuid-123",
                "serviceId": "cm5abc123xyz",
                "slotTime": "2026-02-24T10:00:00Z",
                "expiresAt": "2026-02-24T10:05:00Z",
                "message": "Slot locked successfully for 5 minutes"
            }
        }
    )
    
    lockId: str = Field(..., description="Lock ID for reference")
    serviceId: str = Field(..., description="Service ID")
    slotTime: datetime = Field(..., description="Locked slot time")
    expiresAt: datetime = Field(..., description="Lock expiration time")
    message: str = Field(..., description="Success message")


class ReleaseLockResponse(BaseModel):
    """Response after releasing a slot lock."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "message": "Slot lock released successfully"
            }
        }
    )
    
    message: str = Field(..., description="Success message")
