"""
Slot Service for business logic.

This module provides the SlotService class for handling slot-related operations
including parsing durations, generating time slots, checking availability,
and managing slot locks.
"""

import re
from typing import Optional, List, Dict, Any
from datetime import datetime, date, time, timedelta, timezone
from app.db.client import db
from app.core.exceptions import BadRequestException, NotFoundException


class SlotService:
    """
    Service for slot operations.
    
    This class handles all business logic related to appointment slots including:
    - Parsing service duration strings
    - Generating time slots based on business hours
    - Checking slot availability
    - Locking and releasing slots
    """
    
    @staticmethod
    def parse_duration(duration_str: Optional[str]) -> int:
        """
        Parse duration string to minutes.
        
        Converts human-readable duration strings like "30 min" or "1 hour"
        into numeric minutes for slot calculations.
        
        Args:
            duration_str: Duration from Service.duration field
                         Examples: "30 min", "45 min", "1 hour", None
            
        Returns:
            int: Duration in minutes (default: 60 if parsing fails)
            
        Examples:
            >>> SlotService.parse_duration("30 min")
            30
            >>> SlotService.parse_duration("45 min")
            45
            >>> SlotService.parse_duration("1 hour")
            60
            >>> SlotService.parse_duration("2 hours")
            120
            >>> SlotService.parse_duration(None)
            60
            >>> SlotService.parse_duration("invalid")
            60
            
        Note:
            - Returns 60 (1 hour) as default for any invalid/None input
            - Case-insensitive matching
            - Extracts first number found in the string
        """
        # Handle None or empty string - return default 1 hour
        if not duration_str:
            return 60
        
        try:
            # Normalize: lowercase and remove whitespace
            # "30 MIN  " becomes "30 min"
            duration_str = duration_str.lower().strip()
            
            # Extract the number using regex
            # Finds "30" in "30 min", "1" in "1 hour"
            match = re.search(r'\d+', duration_str)
            
            # If no number found, return default
            if not match:
                return 60
            
            # Convert matched string to integer
            # "30" (string) becomes 30 (int)
            number = int(match.group())
            
            # Check if duration is in hours
            if 'hour' in duration_str:
                return number * 60
            
            # Otherwise, assume it's already in minutes
            return number
            
        except Exception:
            # If anything goes wrong, return safe default
            return 60
    
    @staticmethod
    def generate_time_slots(target_date: date, duration_minutes: int) -> List[datetime]:
        """
        Generate time slots for a specific date.
        
        Creates time slots from 8 AM to 8 PM based on the service duration.
        The last slot must start early enough so the service ends by 8 PM.
        
        Args:
            target_date: Date to generate slots for
            duration_minutes: Duration of each slot in minutes
            
        Returns:
            List[datetime]: List of slot start times
            
        Examples:
            >>> # For 30-minute slots
            >>> slots = SlotService.generate_time_slots(date(2026, 2, 24), 30)
            >>> # Returns: [8:00, 8:30, 9:00, ..., 19:30]
            >>> # Last slot at 19:30 (7:30 PM) ends at 20:00 (8:00 PM)
            
            >>> # For 60-minute slots
            >>> slots = SlotService.generate_time_slots(date(2026, 2, 24), 60)
            >>> # Returns: [8:00, 9:00, 10:00, ..., 19:00]
            >>> # Last slot at 19:00 (7:00 PM) ends at 20:00 (8:00 PM)
            
        Note:
            - Business hours: 8 AM - 8 PM (12 hours)
            - Slots are evenly spaced by duration_minutes
            - Last slot must complete by 8 PM
        """
        start_time = datetime.combine(target_date, time (8, 0))
        end_time = datetime.combine(target_date, time(20, 0))
        slots = []
        current_time = start_time 
        while current_time + timedelta(minutes=duration_minutes) <=end_time:
          slots.append(current_time)
          current_time = current_time + timedelta(minutes=duration_minutes)
        return slots
    
    @staticmethod
    async def get_available_slots(
        service_id: str,
        target_date: date,
        clinician_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get available slots for a service on a specific date.
        
        Filters out slots that are:
        1. Already booked (Booking exists with status != CANCELLED)
        2. Currently locked (SlotLock exists, not expired, not released)
        
        Args:
            service_id: UUID of the service
            target_date: Date to check availability
            
        Returns:
            Dictionary with:
                - serviceId: Service UUID
                - serviceName: Service name
                - date: Date string (YYYY-MM-DD)
                - duration: Slot duration in minutes
                - slots: List of available slot times
                
        Raises:
            NotFoundException: If service not found
            
        Example:
            >>> result = await SlotService.get_available_slots(
            ...     "cm5abc123xyz",
            ...     date(2026, 2, 24)
            ... )
            >>> print(result["slots"])
            [{"slotTime": "2026-02-24T08:00:00Z"}, ...]
        """
        # Step 1: Get service from database
        service = await db.service.find_unique(where={"id": service_id})
        if not service:
            raise NotFoundException(f"Service with ID '{service_id}' not found")

        # Step 2: Parse duration and generate all slots
        duration = SlotService.parse_duration(service.duration)

        # When the patient is booking a particular clinician, that clinician's calendar
        # is the answer and the service-wide 08:00-20:00 grid is not. The grid knows
        # nothing about who works Tuesday mornings, who is on leave, or who is already
        # booked at 10:00 for a different service - and a slot offered on those terms
        # is one the clinic cannot honour.
        if clinician_id:
            from app.api.clinician.service import ClinicianService

            available_slots = await ClinicianService.available_slots_for_clinician(
                clinician_id, target_date, duration
            )
            return {
                "serviceId": service.id,
                "serviceName": service.name,
                "clinicianId": clinician_id,
                "date": target_date.isoformat(),
                "duration": duration,
                "slots": [{"slotTime": slot} for slot in available_slots],
            }

        all_slots = SlotService.generate_time_slots(target_date, duration)
        
        # Step 3: Get booked slots from the database
        bookings = await db.booking.find_many(
            where={
                "serviceId": service_id,
                "time": {
                    "gte": datetime.combine(target_date, time(0, 0)),
                    "lt": datetime.combine(target_date + timedelta(days=1), time(0, 0))
                },
                "status": {"not": "CANCELLED"}
            }
        )
        booked_times = {booking.time for booking in bookings}
        
        # Step 4: Get locked slots from the database
        now = datetime.now(timezone.utc)
        locks = await db.slotlock.find_many(
            where={
                "serviceId": service_id,
                "slotTime": {
                    "gte": datetime.combine(target_date, time(0, 0)),
                    "lt": datetime.combine(target_date + timedelta(days=1), time(0, 0))
                },
                "expiresAt": {"gt": now},
                "isReleased": False
            }
        )
        locked_times = {lock.slotTime for lock in locks}
        
        # Step 5: Filter available slots (exclude booked and locked)
        available_slots = [
            slot for slot in all_slots
            if slot not in booked_times and slot not in locked_times
        ]
        
        # Step 6: Return response
        return {
            "serviceId": service.id,
            "serviceName": service.name,
            "date": target_date.isoformat(),
            "duration": duration,
            "slots": [{"slotTime": slot} for slot in available_slots]
        }

    
    @staticmethod
    async def lock_slot(
        service_id: str,
        user_id: str,
        slot_time: datetime,
        clinician_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Lock a time slot for 5 minutes.
        
        Creates a SlotLock record that prevents other users from booking
        the same slot. Lock expires automatically after 5 minutes.
        
        Args:
            service_id: UUID of the service
            user_id: UUID of the user locking the slot
            slot_time: Slot start time to lock
            
        Returns:
            Dictionary with:
                - lockId: Created lock UUID
                - serviceId: Service UUID
                - slotTime: Locked slot time
                - expiresAt: Lock expiration time
                - message: Success message
                
        Raises:
            NotFoundException: If service not found
            BadRequestException: If slot already booked or locked
            
        Example:
            >>> result = await SlotService.lock_slot(
            ...     "cm5abc123xyz",
            ...     "user-123",
            ...     datetime(2026, 2, 24, 10, 0)
            ... )
            >>> print(result["lockId"])
            "lock-uuid-456"
        """
        # Step 1: Verify service exists
        service = await db.service.find_unique(where={"id": service_id})
        if not service:
            raise NotFoundException(f"Service with ID '{service_id}' not found")
        
        # Step 2: Check if slot is already booked.
        #
        # Scoped to the clinician when one is named. Without that scope a booking on
        # ANY clinician blocked the hour across the whole service, so a clinic with
        # three physiotherapists could sell one 10:00 appointment a day.
        booking_where = {
            "serviceId": service_id,
            "time": slot_time,
            "status": {"not": "CANCELLED"},
        }
        if clinician_id:
            booking_where["clinicianId"] = clinician_id
        existing_booking = await db.booking.find_first(where=booking_where)
        if existing_booking:
            raise BadRequestException("This slot is already booked")

        # Step 3: Check for a live hold on the same calendar.
        now = datetime.now(timezone.utc)
        lock_key = {
            "serviceId": service_id,
            "slotTime": slot_time,
            "clinicianId": clinician_id,
        }
        existing_lock = await db.slotlock.find_first(
            where={**lock_key, "expiresAt": {"gt": now}, "isReleased": False}
        )
        if existing_lock:
            if existing_lock.userId == user_id:
                # The same person re-entering checkout. Extending their own hold beats
                # telling them the slot they are holding is unavailable.
                extended = await db.slotlock.update(
                    where={"id": existing_lock.id},
                    data={"expiresAt": now + timedelta(minutes=5)},
                )
                return {
                    "lockId": extended.id,
                    "serviceId": extended.serviceId,
                    "slotTime": extended.slotTime,
                    "expiresAt": extended.expiresAt,
                    "message": "Slot lock extended for 5 minutes",
                }
            raise BadRequestException("This slot is currently locked by another user")

        # Step 4: Take the lock, expiring in 5 minutes.
        #
        # A released or expired row for the same slot is REUSED rather than inserted
        # alongside. The unique key covers (serviceId, slotTime, clinicianId), so once
        # any lock exists for a slot a second insert fails forever - which meant that
        # before this, a user who abandoned checkout made that slot permanently
        # unlockable by anybody, including themselves.
        expires_at = now + timedelta(minutes=5)
        stale_lock = await db.slotlock.find_first(where=lock_key)
        if stale_lock is not None:
            lock = await db.slotlock.update(
                where={"id": stale_lock.id},
                data={
                    "userId": user_id,
                    "expiresAt": expires_at,
                    "isReleased": False,
                    "lockedAt": now,
                },
            )
        else:
            lock = await db.slotlock.create(
                data={
                    "serviceId": service_id,
                    "userId": user_id,
                    "slotTime": slot_time,
                    "clinicianId": clinician_id,
                    "expiresAt": expires_at,
                }
            )
        
        # Step 5: Return lock details
        return {
            "lockId": lock.id,
            "serviceId": lock.serviceId,
            "slotTime": lock.slotTime,
            "expiresAt": lock.expiresAt,
            "message": "Slot locked successfully for 5 minutes"
        }


    @staticmethod
    async def release_lock(lock_id: str, user_id: str) -> None:
        """
        Release a locked slot.
        
        Marks the SlotLock as released so the slot becomes available again.
        Only the user who created the lock can release it.
        
        Args:
            lock_id: UUID of the lock to release
            user_id: UUID of the user (for authorization)
            
        Raises:
            NotFoundException: If lock not found or doesn't belong to user
            
        Example:
            >>> await SlotService.release_lock("lock-uuid-456", "user-123")
        """
        # Step 1: Find the lock and verify ownership
        lock = await db.slotlock.find_first(
            where={
                "id": lock_id,
                "userId": user_id
            }
        )
        
        # Step 2: If not found or doesn't belong to user, raise error
        if not lock:
            raise NotFoundException("Lock not found or you don't have permission to release it")
        
        # Step 3: Mark the lock as released
        await db.slotlock.update(
            where={"id": lock_id},
            data={"isReleased": True}
        )
