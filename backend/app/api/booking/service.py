"""
Booking Service for business logic.

This module provides the BookingService class for handling booking-related
operations including creating bookings from cart, retrieving bookings,
and managing booking details.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from app.db.client import db
from app.core.exceptions import BadRequestException
import datetime as dt_module


class BookingService:
    """
    Service for booking operations.
    
    This class handles all business logic related to bookings including:
    - Creating bookings from cart items
    - Retrieving user bookings
    - Getting booking details
    - Managing booking status
    """
    
    @staticmethod
    async def create_bookings_from_cart(user_id: str, scheduled_time: datetime, lock_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Create bookings from cart items.
        
        This method validates the cart, calculates payment amounts based on service
        payment types (FULL or PARTIAL), creates a payment record, and creates
        booking records for each cart item.
        
        Args:
            user_id: UUID of the user
            scheduled_time: Scheduled time for the bookings
            
        Returns:
            Dictionary containing:
                - payment: Payment record
                - bookings: List of created booking records
                
        Raises:
            BadRequestException: If cart is empty or has no items
            
        Example:
            >>> result = await BookingService.create_bookings_from_cart(
            ...     "user-123",
            ...     datetime(2024, 12, 25, 10, 0, 0)
            ... )
            >>> print(result["payment"].totalAmount)
            399.0
            >>> print(len(result["bookings"]))
            1
            
        Note:
            Implements requirements:
            - US-5.1: Create bookings from cart
            - TR-5.2: Checkout flow
            - TR-5.3: Payment calculation
        """
        # Get cart
        cart = await db.cart.find_first(where={"userId": user_id})
        if not cart or not cart.items:
            raise BadRequestException("Cart is empty")
        
        # Validate slot lock if provided
        if lock_id:
            lock = await db.slotlock.find_first(
                where={
                    "id": lock_id,
                    "userId": user_id
                }
            )
            
            if not lock:
                raise BadRequestException("Invalid lock ID or lock doesn't belong to you")
            
            # Check if lock has expired
            if lock.expiresAt < datetime.now(timezone.utc):
                raise BadRequestException("Slot lock has expired. Please select a new slot.")
            
            # Check if lock is already released
            if lock.isReleased:
                raise BadRequestException("Slot lock has already been released")
            
            # Normalize both datetimes to timezone-aware for comparison
            # If scheduled_time is naive, assume it's UTC
            scheduled_time_aware = scheduled_time
            if scheduled_time.tzinfo is None:
                scheduled_time_aware = scheduled_time.replace(tzinfo=timezone.utc)
            
            lock_time_aware = lock.slotTime
            if lock.slotTime.tzinfo is None:
                lock_time_aware = lock.slotTime.replace(tzinfo=timezone.utc)
            
            # Verify the lock time matches the scheduled time
            if lock_time_aware != scheduled_time_aware:
                raise BadRequestException("Lock time doesn't match scheduled time")
        
        # Calculate totals
        total_amount = cart.cartValue
        total_paid = 0.0
        total_remaining = 0.0
        
        # Calculate advance amounts for each item
        for item in cart.items:
            service = await db.service.find_unique(where={"id": item["serviceId"]})
            if service.paymentType == "PARTIAL":
                if service.advanceAmount:
                    advance = service.advanceAmount
                elif service.advancePercent:
                    advance = item["subtotal"] * (service.advancePercent / 100)
                else:
                    advance = item["subtotal"]
                total_paid += advance
                total_remaining += (item["subtotal"] - advance)
            else:
                total_paid += item["subtotal"]
        
        # Create payment record
        payment = await db.payment.create(
            data={
                "userId": user_id,
                "totalAmount": total_amount,
                "paidAmount": total_paid,
                "remainingAmount": total_remaining,
                "status": "PENDING"
            }
        )
        
        # Create bookings
        bookings = []
        for item in cart.items:
            service = await db.service.find_unique(where={"id": item["serviceId"]})
            
            # Calculate booking amounts
            if service.paymentType == "PARTIAL":
                if service.advanceAmount:
                    paid = service.advanceAmount
                elif service.advancePercent:
                    paid = item["subtotal"] * (service.advancePercent / 100)
                else:
                    paid = item["subtotal"]
                remaining = item["subtotal"] - paid
            else:
                paid = item["subtotal"]
                remaining = 0.0
            
            # Populate screening counts from service configuration
            screening_count = service.includedScreeningCount if service.includedScreeningCount else 0
            
            booking = await db.booking.create(
                data={
                    "userId": user_id,
                    "serviceId": item["serviceId"],
                    "paymentId": payment.id,
                    "totalAmount": item["subtotal"],
                    "paidAmount": paid,
                    "remainingAmount": remaining,
                    "time": scheduled_time,
                    "status": "PENDING",
                    # AI Screening Count Management
                    "totalScreeningCount": screening_count,
                    "usedScreeningCount": 0,
                    "remainingScreeningCount": screening_count
                }
            )
            bookings.append(booking)
        
        # Release the slot lock after successful booking
        if lock_id:
            await db.slotlock.update(
                where={"id": lock_id},
                data={"isReleased": True}
            )
        
        return {"payment": payment, "bookings": bookings}

    @staticmethod
    async def get_user_bookings(user_id: str) -> List[Any]:
        """
        Retrieve all bookings for a user.

        This method retrieves all bookings for a specific user, including
        service and payment details, sorted by creation date (newest first).

        Args:
            user_id: UUID of the user

        Returns:
            List of booking records with service and payment details

        Example:
            >>> bookings = await BookingService.get_user_bookings("user-123")
            >>> print(len(bookings))
            2
            >>> print(bookings[0].service.name)
            "AI Assessment"

        Note:
            Implements requirements:
            - US-5.4: View list of all bookings
            - Bookings sorted by creation date (newest first)
            - Includes service and payment details
        """
        bookings = await db.booking.find_many(
            where={"userId": user_id},
            include={"service": True, "payment": True},
            order={"createdAt": "desc"}
        )
        return bookings
    @staticmethod
    async def get_booking_details(booking_id: str, user_id: str) -> Any:
        """
        Retrieve detailed information for a specific booking.

        This method retrieves comprehensive details for a booking including
        service information, payment details, and clinician assignment (if any).
        The booking must belong to the specified user.

        Args:
            booking_id: UUID of the booking
            user_id: UUID of the user (for authorization)

        Returns:
            Booking record with service and payment details, or None if not found
            or doesn't belong to the user

        Example:
            >>> booking = await BookingService.get_booking_details(
            ...     "booking-123",
            ...     "user-123"
            ... )
            >>> print(booking.service.name)
            "AI Assessment"
            >>> print(booking.payment.remainingAmount)
            0.0

        Note:
            Implements requirements:
            - US-5.5: View booking details
            - Includes service info, payment breakdown, clinician (if assigned)
            - Shows remaining amount for partial payments
        """
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id},
            include={"service": True, "payment": True}
        )
        return booking

    @staticmethod
    async def assign_clinician(booking_id: str, clinician_id: str) -> Any:
        """
        Assign a clinician to a booking (admin only).

        This method assigns a clinician to a booking. The clinician must exist
        in the database and have the CLINICIAN role.

        Args:
            booking_id: UUID of the booking
            clinician_id: UUID of the clinician to assign

        Returns:
            Updated booking record with service and payment details

        Raises:
            BadRequestException: If booking not found or clinician not found/invalid

        Example:
            >>> booking = await BookingService.assign_clinician(
            ...     "booking-123",
            ...     "clinician-456"
            ... )
            >>> print(booking.clinicianId)
            "clinician-456"

        Note:
            Implements requirements:
            - US-5.7: Admin can assign clinicians to bookings
            - Validates clinician exists and has CLINICIAN role
        """
        # Check if booking exists
        booking = await db.booking.find_unique(where={"id": booking_id})
        if not booking:
            raise BadRequestException("Booking not found")
        
        # Check if clinician exists and has CLINICIAN role
        clinician = await db.user.find_unique(where={"id": clinician_id})
        if not clinician:
            raise BadRequestException("Clinician not found")
        if clinician.role != "CLINICIAN":
            raise BadRequestException("User is not a clinician")
        
        # Update booking with clinician
        updated_booking = await db.booking.update(
            where={"id": booking_id},
            data={"clinicianId": clinician_id},
            include={"service": True, "payment": True}
        )
        
        return updated_booking

    @staticmethod
    async def get_user_bookings_with_screening_counts(user_id: str) -> List[Any]:
        """
        Get user bookings with screening count information.
        
        This method extends the existing get_user_bookings to include screening counts
        and posture analysis information. It retrieves all bookings for a user with
        service details, payment details, and a summary of posture analyses.
        
        Args:
            user_id: UUID of the user
            
        Returns:
            List of booking records with service, payment, and posture analyses
            
        Example:
            >>> bookings = await BookingService.get_user_bookings_with_screening_counts("user-123")
            >>> print(bookings[0].totalScreeningCount)
            10
            >>> print(bookings[0].remainingScreeningCount)
            7
            >>> print(len(bookings[0].postureAnalyses))
            3
            
        Note:
            Implements requirements:
            - US-2: View bookings with screening count information
            - AC-2.2: Display total/used/remaining screening counts
            - AC-2.3: Sort by date (most recent first)
        """
        # postureAnalyses intentionally excluded — the list view only needs
        # usedScreeningCount (already on the booking row) for the count badge.
        # Fetching full analyses would pull large landmarksData JSON blobs for nothing.
        bookings = await db.booking.find_many(
            where={"userId": user_id},
            include={
                "service": True,
                "payment": True,
            },
            order={"createdAt": "desc"}
        )

        # --- Synthesize cart items as draft PENDING bookings ---
        # Cart items that do not yet have a real PENDING/CONFIRMED booking for
        # the same service are exposed as virtual draft entries so "My Bookings
        # → Pending" is never empty while the cart has items.
        cart = await db.cart.find_first(where={"userId": user_id})
        draft_entries: List[Dict[str, Any]] = []

        if cart and cart.items:
            # Every cart item becomes its own draft PENDING entry regardless of
            # whether the user has booked the same service before.  A new cart
            # item always represents a *new* intended booking.
            for item in cart.items:
                service = await db.service.find_unique(where={"id": item["serviceId"]})
                if not service:
                    continue

                # Resolve paymentType to a plain string (handles Prisma enum objects)
                payment_type = (
                    service.paymentType.value
                    if hasattr(service.paymentType, "value")
                    else str(service.paymentType)
                )

                screening_count = service.includedScreeningCount or 0
                now_iso = dt_module.datetime.now(dt_module.timezone.utc).isoformat()

                draft_entries.append({
                    "id": f"cart-{item['id']}",
                    "userId": user_id,
                    "serviceId": item["serviceId"],
                    "paymentId": None,
                    "clinicianId": None,
                    "totalAmount": item["subtotal"],
                    "paidAmount": 0.0,
                    "remainingAmount": item["subtotal"],
                    "time": None,
                    "status": "PENDING",
                    "description": None,
                    "createdAt": now_iso,
                    "totalScreeningCount": screening_count,
                    "usedScreeningCount": 0,
                    "remainingScreeningCount": screening_count,
                    "isDraft": True,
                    "service": {
                        "id": service.id,
                        "name": service.name,
                        "slug": service.slug,
                        "basePrice": service.basePrice,
                        "salePrice": service.salePrice,
                        "paymentType": payment_type,
                        "duration": service.duration,
                        "serviceType": service.serviceType,
                    },
                    "payment": {
                        "id": None,
                        "userId": user_id,
                        "totalAmount": item["subtotal"],
                        "paidAmount": 0.0,
                        "remainingAmount": item["subtotal"],
                        "status": "PENDING",
                        "transactionId": None,
                        "createdAt": now_iso,
                    },
                })

        # Draft entries are prepended so they appear at the top of the Pending tab
        return draft_entries + list(bookings)
    
    @staticmethod
    async def get_booking_screening_info(
        booking_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Get detailed screening count information for a booking.
        
        This method retrieves comprehensive screening count details for a specific
        booking, including the service name, count allocation, and a list of all
        completed assessments.
        
        Args:
            booking_id: UUID of the booking
            user_id: UUID of the user (for authorization)
            
        Returns:
            Dictionary containing:
                - bookingId: Booking UUID
                - serviceName: Name of the service
                - totalScreeningCount: Total allocated screening count
                - usedScreeningCount: Number of screenings used
                - remainingScreeningCount: Number of screenings remaining
                - assessments: List of posture analyses with dates
                - bookingStatus: Current booking status
                
        Raises:
            BadRequestException: If booking not found or doesn't belong to user
            
        Example:
            >>> info = await BookingService.get_booking_screening_info(
            ...     "booking-123",
            ...     "user-123"
            ... )
            >>> print(info["serviceName"])
            "AI Assessment Package"
            >>> print(info["remainingScreeningCount"])
            7
            
        Note:
            Implements requirements:
            - US-2: View screening count information
            - AC-2.2: Display detailed count breakdown
            - Shows assessment history for the booking
        """
        # Prisma Python 0.15.0 does not support nested select inside include.
        # Fetch all fields then filter to only the needed ones in Python.
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id},
            include={
                "service": True,
                "postureAnalyses": True,
            }
        )
        
        if not booking:
            raise BadRequestException("Booking not found")
        
        # Extract only the fields the frontend needs, sorted by date desc
        raw_analyses = booking.postureAnalyses or []
        assessments = sorted(
            [
                {"id": a.id, "analysisDate": a.analysisDate, "status": a.status}
                for a in raw_analyses
            ],
            key=lambda x: x["analysisDate"],
            reverse=True
        )
        
        return {
            "bookingId": booking.id,
            "serviceName": booking.service.name,
            "totalScreeningCount": booking.totalScreeningCount,
            "usedScreeningCount": booking.usedScreeningCount,
            "remainingScreeningCount": booking.remainingScreeningCount,
            "assessments": assessments,
            "bookingStatus": booking.status
        }
    
    @staticmethod
    async def cancel_booking(booking_id: str, user_id: str) -> Any:
        """
        Cancel a booking (PENDING or CONFIRMED only).

        Args:
            booking_id: UUID of the booking
            user_id: UUID of the user (for authorization)

        Returns:
            Updated booking record with status CANCELLED

        Raises:
            BadRequestException: If booking not found or already cancelled/completed
        """
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id}
        )
        if not booking:
            raise BadRequestException("Booking not found")

        if booking.status not in ["PENDING", "CONFIRMED"]:
            raise BadRequestException(
                f"Cannot cancel a booking with status {booking.status}"
            )

        updated_booking = await db.booking.update(
            where={"id": booking_id},
            data={"status": "CANCELLED"},
            include={"service": True, "payment": True}
        )
        return updated_booking

    @staticmethod
    async def get_booking_assessments(
        booking_id: str,
        user_id: str
    ) -> List[Any]:
        """
        Get all posture assessments for a specific booking.
        
        This method retrieves all posture analyses associated with a booking,
        sorted by analysis date (most recent first). It verifies that the booking
        belongs to the specified user before returning the assessments.
        
        Args:
            booking_id: UUID of the booking
            user_id: UUID of the user (for authorization)
            
        Returns:
            List of PostureAnalysis records sorted by date (newest first)
            
        Raises:
            BadRequestException: If booking not found or doesn't belong to user
            
        Example:
            >>> assessments = await BookingService.get_booking_assessments(
            ...     "booking-123",
            ...     "user-123"
            ... )
            >>> print(len(assessments))
            3
            >>> print(assessments[0].fhdPixels)
            45.2
            
        Note:
            Implements requirements:
            - US-7: View past posture analyses by booking
            - AC-7.2: List completed assessments with dates
            - AC-7.6: Sort by date (most recent first)
        """
        # Verify ownership
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id}
        )
        if not booking:
            raise BadRequestException("Booking not found")
        
        assessments = await db.postureanalysis.find_many(
            where={"bookingId": booking_id},
            order={"analysisDate": "desc"}
        )
        
        return assessments
