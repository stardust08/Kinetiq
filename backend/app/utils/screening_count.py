"""
Screening Count Management Utility.

This module provides atomic operations for managing screening counts
with proper validation and error handling.
"""

from typing import Dict, Any, Optional
from app.db.client import db
from app.core.exceptions import BadRequestException


class ScreeningCountManager:
    """
    Utility for managing screening count operations.
    
    Provides atomic operations for count management with
    proper validation and error handling.
    """
    
    @staticmethod
    async def validate_and_reserve_count(
        booking_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Validate booking has remaining count and reserve it.
        
        This is a pre-check before starting analysis.
        Actual deduction happens in finalize_analysis.
        
        Args:
            booking_id: The booking ID to validate
            user_id: The user ID who owns the booking
            
        Returns:
            Dict containing validation result and count information
            
        Raises:
            BadRequestException: If booking not found, no counts remaining,
                               or booking status is invalid
        """
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id}
        )
        
        if not booking:
            raise BadRequestException("Booking not found")
        
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException(
                f"No remaining screening counts. "
                f"Used: {booking.usedScreeningCount}/{booking.totalScreeningCount}"
            )
        
        if booking.status not in ["CONFIRMED", "COMPLETED"]:
            raise BadRequestException(
                f"Booking status '{booking.status}' is not valid for analysis"
            )
        
        return {
            "valid": True,
            "remainingCount": booking.remainingScreeningCount,
            "bookingId": booking.id
        }
    
    @staticmethod
    async def deduct_count_atomic(
        booking_id: str,
        user_id: str,
        transaction=None
    ) -> Dict[str, Any]:
        """
        Atomically deduct one screening count from booking.
        
        MUST be called within a database transaction to ensure atomicity.
        
        Args:
            booking_id: The booking ID to deduct count from
            user_id: The user ID who owns the booking
            transaction: Optional Prisma transaction client. If None, uses global db.
            
        Returns:
            Dict containing success status and updated count information
            
        Raises:
            BadRequestException: If booking not found, no counts remaining,
                               or count consistency check fails
        """
        db_client = transaction if transaction else db
        
        # Get current booking state
        booking = await db_client.booking.find_first(
            where={"id": booking_id, "userId": user_id}
        )
        
        if not booking:
            raise BadRequestException("Booking not found")
        
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException("No remaining screening counts")
        
        # Atomic update
        updated_booking = await db_client.booking.update(
            where={"id": booking_id},
            data={
                "usedScreeningCount": {"increment": 1},
                "remainingScreeningCount": {"decrement": 1}
            }
        )
        
        # Verify consistency
        if updated_booking.totalScreeningCount != (
            updated_booking.usedScreeningCount + 
            updated_booking.remainingScreeningCount
        ):
            raise BadRequestException("Count consistency check failed")
        
        return {
            "success": True,
            "remainingCount": updated_booking.remainingScreeningCount,
            "usedCount": updated_booking.usedScreeningCount
        }
    
    @staticmethod
    async def get_count_summary(user_id: str) -> Dict[str, Any]:
        """
        Get summary of screening counts across all user bookings.
        
        Args:
            user_id: The user ID to get count summary for
            
        Returns:
            Dict containing aggregated count information across all bookings
        """
        bookings = await db.booking.find_many(
            where={"userId": user_id},
            include={"service": True}
        )
        
        total_allocated = sum(b.totalScreeningCount for b in bookings)
        total_used = sum(b.usedScreeningCount for b in bookings)
        total_remaining = sum(b.remainingScreeningCount for b in bookings)
        
        return {
            "totalAllocated": total_allocated,
            "totalUsed": total_used,
            "totalRemaining": total_remaining,
            "bookingsWithCounts": len([b for b in bookings if b.remainingScreeningCount > 0])
        }
