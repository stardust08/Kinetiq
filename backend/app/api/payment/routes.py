"""
Payment routes for the API.

This module provides FastAPI endpoints for payment processing,
including payment initiation, verification, and remaining payment
processing. Most endpoints require authentication.
"""

from fastapi import APIRouter, Depends
from app.api.payment.service import PaymentService
from app.api.payment.schemas import (
    InitiatePaymentRequest,
    InitiatePaymentResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
    PayRemainingRequest,
    PayRemainingResponse
)
from app.core.dependencies import get_current_active_user

# Create payment router with /payments prefix
payment_router = APIRouter(prefix="/payments", tags=["payments"])


@payment_router.post("/initiate")
async def initiate_payment(
    request: InitiatePaymentRequest,
    user=Depends(get_current_active_user)
):
    """
    Initiate payment with payment gateway.
    
    This endpoint initiates a payment transaction with the payment gateway
    for a given payment ID. It generates a transaction ID and returns
    payment details needed for the frontend to complete the payment.
    
    Args:
        request: Payment initiation request containing paymentId
        user: Current authenticated user (from dependency)
        
    Returns:
        Payment details including transaction ID and gateway URL wrapped in data field
        
    Raises:
        NotFoundException: If payment record is not found
    """
    result = await PaymentService.initiate_payment(request.paymentId)
    return {"data": result}


@payment_router.post("/verify")
async def verify_payment(request: VerifyPaymentRequest):
    """
    Verify payment from gateway callback.
    
    This endpoint processes payment verification callbacks from the payment
    gateway. It updates payment and booking statuses based on the payment
    result and clears the user's cart on successful payment.
    
    Note: This endpoint does not require authentication as it's called by
    the payment gateway callback system.
    
    Args:
        request: Payment verification request containing paymentId,
                transactionId, and status
        
    Returns:
        Verification result with success status and message wrapped in data field
        
    Raises:
        NotFoundException: If payment record is not found
    """
    result = await PaymentService.verify_payment(
        request.paymentId,
        request.transactionId,
        request.status
    )
    return {"data": result}


@payment_router.post("/{id}/pay-remaining")
async def pay_remaining(
    id: str,
    request: PayRemainingRequest,
    user=Depends(get_current_active_user)
):
    """
    Pay remaining amount for partial payment bookings.
    
    This endpoint processes the remaining payment for bookings that were
    initially paid partially. It updates the payment record to reflect
    full payment completion and updates all associated bookings.
    
    Args:
        id: Payment ID for which to pay the remaining amount
        request: Payment request containing transactionId from gateway
        user: Current authenticated user (from dependency)
        
    Returns:
        Payment completion result with updated payment details wrapped in data field
        
    Raises:
        NotFoundException: If payment record is not found
        BadRequestException: If there's no remaining amount to pay
    """
    result = await PaymentService.pay_remaining_amount(id, request.transactionId)
    return {"data": result}
