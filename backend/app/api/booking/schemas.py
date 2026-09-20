"""
Booking schemas for request/response validation.

This module contains Pydantic models for booking endpoints including
checkout requests, booking responses, and clinician assignment.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


# =========================
# Request Schemas
# =========================

class CheckoutRequest(BaseModel):
    """Request schema for creating bookings from cart."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "scheduledTime": "2024-12-25T10:00:00Z",
                "lockId": "lock-uuid-123"
            }
        }
    )
    
    scheduledTime: datetime = Field(..., description="Scheduled time for the booking")
    lockId: Optional[str] = Field(None, description="Slot lock ID (optional, for slot-based bookings)")


class AssignClinicianRequest(BaseModel):
    """Request schema for assigning a clinician to a booking."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "clinicianId": "clinician-uuid-123"
            }
        }
    )
    
    clinicianId: str = Field(..., description="Clinician ID to assign to the booking")


# =========================
# Response Schemas
# =========================

class ServiceInfo(BaseModel):
    """Service information in booking response."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "service-uuid-123",
                "name": "AI Assessment",
                "slug": "ai-assessment",
                "basePrice": 399.0,
                "paymentType": "FULL"
            }
        }
    )
    
    id: str = Field(..., description="Service ID")
    name: str = Field(..., description="Service name")
    slug: str = Field(..., description="Service slug")
    basePrice: float = Field(..., description="Service base price")
    paymentType: str = Field(..., description="Payment type (FULL or PARTIAL)")


class PaymentInfo(BaseModel):
    """Payment information in booking response."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "payment-uuid-456",
                "totalAmount": 399.0,
                "paidAmount": 399.0,
                "remainingAmount": 0.0,
                "status": "COMPLETED",
                "transactionId": "TXN_ABC123"
            }
        }
    )
    
    id: str = Field(..., description="Payment ID")
    totalAmount: float = Field(..., description="Total payment amount")
    paidAmount: float = Field(..., description="Amount paid")
    remainingAmount: float = Field(..., description="Remaining amount to be paid")
    status: str = Field(..., description="Payment status (PENDING, PARTIAL, COMPLETED, FAILED)")
    transactionId: Optional[str] = Field(None, description="Transaction ID from payment gateway")


class BookingResponse(BaseModel):
    """Response schema for a booking."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "booking-uuid-789",
                "userId": "user-uuid-123",
                "serviceId": "service-uuid-456",
                "paymentId": "payment-uuid-789",
                "clinicianId": None,
                "totalAmount": 399.0,
                "paidAmount": 399.0,
                "remainingAmount": 0.0,
                "time": "2024-12-25T10:00:00Z",
                "status": "CONFIRMED",
                "description": None,
                "createdAt": "2024-01-01T00:00:00Z",
                "service": {
                    "id": "service-uuid-456",
                    "name": "AI Assessment",
                    "slug": "ai-assessment",
                    "basePrice": 399.0,
                    "paymentType": "FULL"
                },
                "payment": {
                    "id": "payment-uuid-789",
                    "totalAmount": 399.0,
                    "paidAmount": 399.0,
                    "remainingAmount": 0.0,
                    "status": "COMPLETED",
                    "transactionId": "TXN_ABC123"
                }
            }
        }
    )
    
    id: str = Field(..., description="Booking ID")
    userId: str = Field(..., description="User ID who made the booking")
    serviceId: str = Field(..., description="Service ID")
    paymentId: str = Field(..., description="Payment ID")
    clinicianId: Optional[str] = Field(None, description="Assigned clinician ID")
    totalAmount: float = Field(..., description="Total booking amount")
    paidAmount: float = Field(..., description="Amount paid")
    remainingAmount: float = Field(..., description="Remaining amount to be paid")
    time: datetime = Field(..., description="Scheduled time for the booking")
    status: str = Field(..., description="Booking status (PENDING, CONFIRMED, COMPLETED, CANCELLED)")
    description: Optional[str] = Field(None, description="Booking description")
    createdAt: datetime = Field(..., description="Booking creation timestamp")
    service: ServiceInfo = Field(..., description="Service information")
    payment: PaymentInfo = Field(..., description="Payment information")


class PaymentDetails(BaseModel):
    """Payment gateway details for checkout."""
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


class CheckoutResponse(BaseModel):
    """Response schema for checkout endpoint."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "payment": {
                    "id": "payment-uuid-123",
                    "totalAmount": 399.0,
                    "paidAmount": 399.0,
                    "remainingAmount": 0.0,
                    "status": "PENDING",
                    "transactionId": None
                },
                "bookings": [],
                "paymentDetails": {
                    "paymentId": "payment-uuid-123",
                    "amount": 399.0,
                    "transactionId": "TXN_ABC123DEF456",
                    "gatewayUrl": "https://mock-gateway.com/pay"
                }
            }
        }
    )
    
    payment: PaymentInfo = Field(..., description="Payment information")
    bookings: List[BookingResponse] = Field(..., description="List of created bookings")
    paymentDetails: PaymentDetails = Field(..., description="Payment gateway details")


class BookingListResponse(BaseModel):
    """Response wrapper for booking list."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "data": [],
                "total": 0
            }
        }
    )
    
    data: List[BookingResponse] = Field(..., description="List of bookings")
    total: int = Field(..., description="Total number of bookings")
