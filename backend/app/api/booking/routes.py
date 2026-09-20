"""
Booking routes for the API.

This module provides FastAPI endpoints for booking management,
including checkout from cart, viewing bookings, booking details,
and clinician assignment. Most endpoints require authentication.
"""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_active_user, get_current_admin
from app.api.booking.service import BookingService
from app.api.booking.schemas import CheckoutRequest, CheckoutResponse, AssignClinicianRequest
from app.api.payment.service import PaymentService

# Create booking router with /bookings prefix
booking_router = APIRouter(prefix="/bookings", tags=["bookings"])


@booking_router.get("/", response_model=dict)
async def get_bookings(user = Depends(get_current_active_user)):
    """
    Retrieve all bookings for the authenticated user.
    
    This endpoint returns all bookings for the current user, including
    service and payment details, screening count information, and posture
    analyses summary, sorted by creation date (newest first).
    
    Args:
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - data: List of booking records with service, payment, screening counts,
                   and posture analyses details
            
    Example:
        GET /api/bookings
        
        Response:
        {
            "data": [
                {
                    "id": "booking-123",
                    "userId": "user-456",
                    "serviceId": "service-789",
                    "paymentId": "payment-012",
                    "totalAmount": 399.0,
                    "paidAmount": 399.0,
                    "remainingAmount": 0.0,
                    "time": "2024-12-25T10:00:00Z",
                    "status": "CONFIRMED",
                    "totalScreeningCount": 10,
                    "usedScreeningCount": 3,
                    "remainingScreeningCount": 7,
                    "service": {...},
                    "payment": {...},
                    "postureAnalyses": [
                        {
                            "id": "analysis-123",
                            "analysisDate": "2024-01-15T10:00:00Z",
                            "status": "completed"
                        }
                    ]
                }
            ]
        }
        
    Note:
        Implements requirements:
        - US-2: View bookings with screening count information
        - AC-2.2: Display total/used/remaining screening counts
        - AC-2.3: Sort by date (most recent first)
    """
    bookings = await BookingService.get_user_bookings_with_screening_counts(user.id)
    return {"data": bookings}


@booking_router.get("/{id}", response_model=dict)
async def get_booking_details(id: str, user = Depends(get_current_active_user)):
    """
    Retrieve detailed information for a specific booking.
    
    This endpoint returns comprehensive details for a booking including
    service information, payment breakdown, and clinician assignment (if any).
    The booking must belong to the authenticated user.
    
    Args:
        id: Booking ID
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - data: Booking record with service and payment details, or None if not found
            
    Example:
        GET /api/bookings/booking-123
        
        Response:
        {
            "data": {
                "id": "booking-123",
                "userId": "user-456",
                "serviceId": "service-789",
                "paymentId": "payment-012",
                "clinicianId": "clinician-345",
                "totalAmount": 399.0,
                "paidAmount": 199.5,
                "remainingAmount": 199.5,
                "time": "2024-12-25T10:00:00Z",
                "status": "CONFIRMED",
                "service": {
                    "id": "service-789",
                    "name": "AI Assessment",
                    "slug": "ai-assessment",
                    "basePrice": 399.0,
                    "paymentType": "PARTIAL"
                },
                "payment": {
                    "id": "payment-012",
                    "totalAmount": 399.0,
                    "paidAmount": 199.5,
                    "remainingAmount": 199.5,
                    "status": "PARTIAL",
                    "transactionId": "TXN_ABC123"
                }
            }
        }
    """
    booking = await BookingService.get_booking_details(id, user.id)
    return {"data": booking}



@booking_router.post("/checkout", response_model=dict)
async def checkout(
    request: CheckoutRequest,
    user = Depends(get_current_active_user)
):
    """
    Create bookings from cart and initiate payment.
    
    This endpoint processes the checkout flow:
    1. Validates cart has items
    2. Creates payment record with calculated amounts
    3. Creates booking records for each cart item
    4. Initiates payment gateway transaction
    5. Returns payment details for frontend
    
    The cart is cleared after successful payment verification.
    
    Args:
        request: CheckoutRequest containing scheduledTime
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - data: CheckoutResponse with payment, bookings, and paymentDetails
            
    Raises:
        BadRequestException: If cart is empty
        
    Example:
        POST /api/bookings/checkout
        {
            "scheduledTime": "2024-12-25T10:00:00Z"
        }
        
        Response:
        {
            "data": {
                "payment": {...},
                "bookings": [...],
                "paymentDetails": {
                    "paymentId": "payment-123",
                    "amount": 399.0,
                    "transactionId": "TXN_ABC123",
                    "gatewayUrl": "https://mock-gateway.com/pay"
                }
            }
        }
    """
    # Create bookings from cart with optional slot lock validation
    result = await BookingService.create_bookings_from_cart(
        user.id,
        request.scheduledTime,
        request.lockId  # Pass the lockId if provided
    )
    
    # Get payment ID (handle both dict and object)
    payment_id = result["payment"].id if hasattr(result["payment"], 'id') else result["payment"]["id"]
    
    # Initiate payment gateway
    payment_details = await PaymentService.initiate_payment(payment_id)
    
    # Return combined response
    return {
        "data": {
            "payment": result["payment"],
            "bookings": result["bookings"],
            "paymentDetails": payment_details
        }
    }


@booking_router.patch("/{id}/cancel", response_model=dict)
async def cancel_booking(id: str, user = Depends(get_current_active_user)):
    """
    Cancel a booking.

    Moves a PENDING or CONFIRMED booking to CANCELLED status.
    Only the booking owner can cancel.

    Args:
        id: Booking ID
        user: Current authenticated user (from dependency)

    Returns:
        dict containing:
            - data: Updated booking record with status CANCELLED

    Raises:
        BadRequestException: If booking not found or status is already CANCELLED/COMPLETED
    """
    booking = await BookingService.cancel_booking(id, user.id)
    return {"data": booking}


@booking_router.patch("/{id}/assign-clinician", response_model=dict)
async def assign_clinician(
    id: str,
    request: AssignClinicianRequest,
    user = Depends(get_current_admin)
):
    """
    Assign a clinician to a booking (admin only).
    
    This endpoint allows administrators to assign a clinician to a booking.
    The clinician must exist in the database and have the CLINICIAN role.
    
    Args:
        id: Booking ID
        request: AssignClinicianRequest containing clinicianId
        user: Current authenticated admin user (from dependency)
        
    Returns:
        dict containing:
            - data: Updated booking record with service and payment details
            
    Raises:
        BadRequestException: If booking not found or clinician not found/invalid
        HTTPException 403: If user is not an admin
        
    Example:
        PATCH /api/bookings/booking-123/assign-clinician
        {
            "clinicianId": "clinician-456"
        }
        
        Response:
        {
            "data": {
                "id": "booking-123",
                "userId": "user-789",
                "serviceId": "service-012",
                "paymentId": "payment-345",
                "clinicianId": "clinician-456",
                "totalAmount": 399.0,
                "paidAmount": 399.0,
                "remainingAmount": 0.0,
                "time": "2024-12-25T10:00:00Z",
                "status": "CONFIRMED",
                "service": {...},
                "payment": {...}
            }
        }
    """
    booking = await BookingService.assign_clinician(id, request.clinicianId)
    return {"data": booking}
