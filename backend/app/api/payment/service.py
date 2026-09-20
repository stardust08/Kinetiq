"""
Payment Service for business logic.

This module provides the PaymentService class for handling payment-related
operations including payment initiation, verification, and remaining payment
processing.
"""

import uuid
from typing import Any
from app.db.client import db
from app.core.exceptions import NotFoundException
from prisma import Json


class PaymentService:
    """
    Service for payment operations.
    
    This class handles all business logic related to payments including:
    - Initiating payments with payment gateway
    - Verifying payment status from gateway callbacks
    - Processing remaining payments for partial payment bookings
    - Managing payment status updates
    """
    
    @staticmethod
    async def initiate_payment(payment_id: str) -> dict[str, Any]:
        """
        Initiate payment with mock payment gateway.
        
        This method initiates a payment transaction with a mock payment gateway
        for development purposes. In production, this would integrate with
        real payment gateways like Razorpay or Stripe.
        
        Args:
            payment_id: The ID of the payment record to initiate
            
        Returns:
            dict containing:
                - paymentId: The payment record ID
                - amount: The amount to be paid
                - transactionId: Generated transaction ID for the gateway
                - gatewayUrl: Mock payment gateway URL
                
        Raises:
            NotFoundException: If payment record is not found
        """
        # Fetch payment record
        payment = await db.payment.find_unique(where={"id": payment_id})
        
        if not payment:
            raise NotFoundException(f"Payment with id {payment_id} not found")
        
        # Generate mock transaction ID
        # In production, this would come from the payment gateway
        transaction_id = f"TXN_{uuid.uuid4().hex[:12].upper()}"
        
        # Return payment details for frontend
        return {
            "paymentId": payment.id,
            "amount": payment.paidAmount,
            "transactionId": transaction_id,
            "gatewayUrl": "https://mock-gateway.com/pay"
        }

    @staticmethod
    async def verify_payment(payment_id: str, transaction_id: str, status: str) -> dict[str, Any]:
        """
        Verify payment from gateway callback.

        This method processes payment verification callbacks from the payment gateway,
        updates payment and booking statuses accordingly, and clears the user's cart
        on successful payment.

        Args:
            payment_id: The ID of the payment to verify
            transaction_id: Transaction ID from the payment gateway
            status: Payment status from gateway ("success" or "failed")

        Returns:
            dict containing:
                - success: Boolean indicating if payment was successful
                - message: Verification message

        Raises:
            NotFoundException: If payment record is not found
        """
        from datetime import datetime

        # Fetch payment with related bookings
        payment = await db.payment.find_unique(
            where={"id": payment_id},
            include={"bookings": True}
        )

        if not payment:
            raise NotFoundException(f"Payment with id {payment_id} not found")

        if status == "success":
            # Determine payment status based on remaining amount
            payment_status = "COMPLETED" if payment.remainingAmount == 0 else "PARTIAL"

            # Update payment record
            await db.payment.update(
                where={"id": payment_id},
                data={
                    "status": payment_status,
                    "transactionId": transaction_id,
                    "completedAt": datetime.utcnow() if payment_status == "COMPLETED" else None
                }
            )

            # Update all associated bookings to CONFIRMED
            for booking in payment.bookings:
                await db.booking.update(
                    where={"id": booking.id},
                    data={"status": "CONFIRMED"}
                )

            # Clear the user's cart
            cart = await db.cart.find_first(where={"userId": payment.userId})
            if cart:
                await db.cart.update(
                    where={"id": cart.id},
                    data={"items": Json([]), "cartValue": 0}
                )

            return {"success": True, "message": "Payment verified"}
        else:
            # Payment failed - update payment status
            await db.payment.update(
                where={"id": payment_id},
                data={"status": "FAILED"}
            )

            return {"success": False, "message": "Payment failed"}

    @staticmethod
    async def pay_remaining_amount(payment_id: str, transaction_id: str) -> dict[str, Any]:
        """
        Process remaining payment for partial payment bookings.

        This method handles the payment of remaining amount for bookings that
        were initially paid partially. It updates the payment record to reflect
        full payment completion and updates the payment status to COMPLETED.

        Args:
            payment_id: The ID of the payment to complete
            transaction_id: Transaction ID from the payment gateway for the remaining payment

        Returns:
            dict containing:
                - success: Boolean indicating if remaining payment was successful
                - message: Payment completion message
                - payment: Updated payment record with all details

        Raises:
            NotFoundException: If payment record is not found
            BadRequestException: If there's no remaining amount to pay
        """
        from datetime import datetime
        from app.core.exceptions import BadRequestException

        # Fetch payment with related bookings
        payment = await db.payment.find_unique(
            where={"id": payment_id},
            include={"bookings": True}
        )

        if not payment:
            raise NotFoundException(f"Payment with id {payment_id} not found")

        # Validate that there's a remaining amount to pay
        if payment.remainingAmount <= 0:
            raise BadRequestException("No remaining amount to pay for this payment")

        # Update payment record - add remaining amount to paid amount
        updated_payment = await db.payment.update(
            where={"id": payment_id},
            data={
                "paidAmount": payment.totalAmount,
                "remainingAmount": 0,
                "status": "COMPLETED",
                "transactionId": transaction_id,
                "completedAt": datetime.utcnow()
            }
        )

        # Update all associated bookings to reflect full payment
        for booking in payment.bookings:
            await db.booking.update(
                where={"id": booking.id},
                data={
                    "paidAmount": booking.totalAmount,
                    "remainingAmount": 0
                }
            )

        return {
            "success": True,
            "message": "Remaining payment completed",
            "payment": updated_payment
        }

