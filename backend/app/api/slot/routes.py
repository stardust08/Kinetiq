"""
Slot routes for API endpoints.

This module provides REST API endpoints for slot management including:
- Getting available slots for a service
- Locking slots during checkout
- Releasing slot locks
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import date
from app.core.dependencies import get_current_user
from app.api.slot.schemas import (
    AvailableSlotsResponse,
    LockSlotRequest,
    LockSlotResponse,
    ReleaseLockResponse
)
from app.api.slot.service import SlotService

router = APIRouter(prefix="/slots", tags=["Slots"])


@router.get("/{service_id}/available", response_model=AvailableSlotsResponse)
async def get_available_slots(
    service_id: str,
    date: date = Query(..., description="Date to check slots (YYYY-MM-DD format)"),
    clinicianId: Optional[str] = Query(
        None,
        description=(
            "Restrict to one clinician's calendar. When given, the answer honours that "
            "clinician's weekly hours, time off and existing appointments across every "
            "service - rather than the service-wide 8am-8pm grid, which offers times "
            "nobody is available to deliver."
        ),
    ),
):
    """
    Get available time slots for a service on a specific date.
    
    Returns list of available time slots based on:
    - Service duration (parsed from service.duration field)
    - Business hours (8 AM - 8 PM)
    - Existing bookings (excludes booked slots)
    - Active slot locks (excludes locked slots that haven't expired)
    
    Args:
        service_id: UUID of the service
        date: Date to check availability (YYYY-MM-DD)
        
    Returns:
        AvailableSlotsResponse with list of available slots
        
    Example:
        GET /api/slots/cm5abc123xyz/available?date=2026-02-24
    """
    result = await SlotService.get_available_slots(service_id, date, clinicianId)
    return result


@router.post("/lock", response_model=LockSlotResponse)
async def lock_slot(
    request: LockSlotRequest,
    current_user = Depends(get_current_user)
):
    """
    Lock a time slot for 5 minutes.
    
    Prevents other users from booking the same slot while the current user
    completes their checkout process. Lock automatically expires after 5 minutes.
    
    Args:
        request: LockSlotRequest with serviceId and slotTime
        current_user: Authenticated user from JWT token
        
    Returns:
        LockSlotResponse with lock details and expiration time
        
    Raises:
        HTTPException 400: If slot is already booked or locked
        HTTPException 404: If service not found
        
    Example:
        POST /api/slots/lock
        Body: {"serviceId": "cm5abc123xyz", "slotTime": "2026-02-24T10:00:00Z"}
    """
    result = await SlotService.lock_slot(
        request.serviceId,
        current_user.id,
        request.slotTime,
        getattr(request, "clinicianId", None),
    )
    return result


@router.delete("/{lock_id}", response_model=ReleaseLockResponse)
async def release_lock(
    lock_id: str,
    current_user = Depends(get_current_user)
):
    """
    Release a locked slot.
    
    Called when user cancels checkout or completes booking.
    Only the user who created the lock can release it.
    
    Args:
        lock_id: UUID of the slot lock to release
        current_user: Authenticated user from JWT token
        
    Returns:
        ReleaseLockResponse with success message
        
    Raises:
        HTTPException 404: If lock not found or doesn't belong to user
        
    Example:
        DELETE /api/slots/lock-uuid-123
    """
    await SlotService.release_lock(lock_id, current_user.id)
    return {"message": "Slot lock released successfully"}
