"""
Payment schemas for request/response validation.

This module contains Pydantic models for payment endpoints including
payment initiation, verification, and remaining payment processing.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


# =========================
# Request Schemas
# =========================

class InitiatePaymentRequest(BaseModel):
    """Request schema for initiating a payment."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "paymentId": "payment-uuid-123"
            }
        }
    )
    
    paymentId: str = Field(..., description="Payment ID to initiate")


class VerifyPaymentRequest(BaseModel):
    """Request schema for verifying a payment from gateway callback."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "paymentId": "payment-uuid-123",
                "transactionId": "TXN_ABC123DEF456",
                "status": "success"
            }
        }
    )
    
    paymentId: str = Field(..., description="Payment ID to verify")
    transactionId: str = Field(..., description="Transaction ID from payment gateway")
    status: str = Field(..., description="Payment status from gateway (success or failed)")


class PayRemainingRequest(BaseModel):
    """Request schema for paying remaining amount."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "transactionId": "TXN_XYZ789ABC012"
            }
        }
    )
    
    transactionId: str = Field(..., description="Transaction ID from payment gateway")


# =========================
# Response Schemas
# =========================

class PaymentResponse(BaseModel):
    """Response schema for payment details."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "payment-uuid-123",
                "userId": "user-uuid-456",
                "totalAmount": 399.0,
                "paidAmount": 399.0,
                "remainingAmount": 0.0,
                "status": "COMPLETED",
                "transactionId": "TXN_ABC123DEF456",
                "createdAt": "2024-01-01T00:00:00Z",
                "completedAt": "2024-01-01T00:05:00Z"
            }
        }
    )
    
    id: str = Field(..., description="Payment ID")
    userId: str = Field(..., description="User ID who made the payment")
    totalAmount: float = Field(..., description="Total payment amount")
    paidAmount: float = Field(..., description="Amount paid so far")
    remainingAmount: float = Field(..., description="Remaining amount to be paid")
    status: str = Field(..., description="Payment status (PENDING, PARTIAL, COMPLETED, FAILED)")
    transactionId: Optional[str] = Field(None, description="Transaction ID from payment gateway")
    createdAt: datetime = Field(..., description="Payment creation timestamp")
    completedAt: Optional[datetime] = Field(None, description="Payment completion timestamp")


class InitiatePaymentResponse(BaseModel):
    """Response schema for payment initiation."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "paymentId": "payment-uuid-123",
                "amount": 399.0,
                "transactionId": "TXN_ABC123DEF456",
                "gatewayUrl": "https://mock-gateway.com/pay"
            }
        }
    )
    
    paymentId: str = Field(..., description="Payment ID")
    amount: float = Field(..., description="Amount to be paid")
    transactionId: str = Field(..., description="Transaction ID for payment gateway")
    gatewayUrl: str = Field(..., description="Payment gateway URL")


class VerifyPaymentResponse(BaseModel):
    """Response schema for payment verification."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Payment verified successfully"
            }
        }
    )
    
    success: bool = Field(..., description="Whether payment verification was successful")
    message: str = Field(..., description="Verification message")


class PayRemainingResponse(BaseModel):
    """Response schema for remaining payment."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Remaining payment completed",
                "payment": {
                    "id": "payment-uuid-123",
                    "userId": "user-uuid-456",
                    "totalAmount": 399.0,
                    "paidAmount": 399.0,
                    "remainingAmount": 0.0,
                    "status": "COMPLETED",
                    "transactionId": "TXN_XYZ789ABC012",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "completedAt": "2024-01-02T00:00:00Z"
                }
            }
        }
    )
    
    success: bool = Field(..., description="Whether remaining payment was successful")
    message: str = Field(..., description="Payment message")
    payment: PaymentResponse = Field(..., description="Updated payment details")
