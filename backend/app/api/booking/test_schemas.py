"""
Unit tests for booking schemas.

Tests Pydantic model validation and serialization for booking-related schemas.
"""

import pytest
from datetime import datetime
from pydantic import ValidationError
from app.api.booking.schemas import (
    CheckoutRequest,
    AssignClinicianRequest,
    ServiceInfo,
    PaymentInfo,
    BookingResponse,
    PaymentDetails,
    CheckoutResponse,
    BookingListResponse
)


class TestCheckoutRequest:
    """Test CheckoutRequest schema."""
    
    def test_valid_checkout_request(self):
        """Test valid checkout request with scheduled time."""
        data = {
            "scheduledTime": "2024-12-25T10:00:00Z"
        }
        request = CheckoutRequest(**data)
        assert request.scheduledTime.year == 2024
        assert request.scheduledTime.month == 12
        assert request.scheduledTime.day == 25
        assert request.scheduledTime.hour == 10
    
    def test_missing_scheduled_time(self):
        """Test checkout request fails without scheduled time."""
        with pytest.raises(ValidationError):
            CheckoutRequest(**{})


class TestAssignClinicianRequest:
    """Test AssignClinicianRequest schema."""
    
    def test_valid_assign_clinician_request(self):
        """Test valid clinician assignment request."""
        data = {"clinicianId": "clinician-123"}
        request = AssignClinicianRequest(**data)
        assert request.clinicianId == "clinician-123"
    
    def test_missing_clinician_id(self):
        """Test assignment request fails without clinician ID."""
        with pytest.raises(ValidationError):
            AssignClinicianRequest(**{})


class TestServiceInfo:
    """Test ServiceInfo schema."""
    
    def test_valid_service_info(self):
        """Test valid service information."""
        data = {
            "id": "service-123",
            "name": "AI Assessment",
            "slug": "ai-assessment",
            "basePrice": 399.0,
            "paymentType": "FULL"
        }
        service = ServiceInfo(**data)
        assert service.id == "service-123"
        assert service.name == "AI Assessment"
        assert service.basePrice == 399.0


class TestPaymentInfo:
    """Test PaymentInfo schema."""
    
    def test_valid_payment_info(self):
        """Test valid payment information."""
        data = {
            "id": "payment-123",
            "totalAmount": 399.0,
            "paidAmount": 399.0,
            "remainingAmount": 0.0,
            "status": "COMPLETED",
            "transactionId": "TXN_ABC123"
        }
        payment = PaymentInfo(**data)
        assert payment.id == "payment-123"
        assert payment.totalAmount == 399.0
        assert payment.status == "COMPLETED"
    
    def test_payment_info_without_transaction_id(self):
        """Test payment info with optional transaction ID."""
        data = {
            "id": "payment-123",
            "totalAmount": 399.0,
            "paidAmount": 399.0,
            "remainingAmount": 0.0,
            "status": "PENDING"
        }
        payment = PaymentInfo(**data)
        assert payment.transactionId is None


class TestBookingResponse:
    """Test BookingResponse schema."""
    
    def test_valid_booking_response(self):
        """Test valid booking response with all fields."""
        data = {
            "id": "booking-123",
            "userId": "user-123",
            "serviceId": "service-123",
            "paymentId": "payment-123",
            "clinicianId": None,
            "totalAmount": 399.0,
            "paidAmount": 399.0,
            "remainingAmount": 0.0,
            "time": "2024-12-25T10:00:00Z",
            "status": "CONFIRMED",
            "description": None,
            "createdAt": "2024-01-01T00:00:00Z",
            "service": {
                "id": "service-123",
                "name": "AI Assessment",
                "slug": "ai-assessment",
                "basePrice": 399.0,
                "paymentType": "FULL"
            },
            "payment": {
                "id": "payment-123",
                "totalAmount": 399.0,
                "paidAmount": 399.0,
                "remainingAmount": 0.0,
                "status": "COMPLETED",
                "transactionId": "TXN_ABC123"
            }
        }
        booking = BookingResponse(**data)
        assert booking.id == "booking-123"
        assert booking.status == "CONFIRMED"
        assert booking.service.name == "AI Assessment"
        assert booking.payment.status == "COMPLETED"


class TestPaymentDetails:
    """Test PaymentDetails schema."""
    
    def test_valid_payment_details(self):
        """Test valid payment gateway details."""
        data = {
            "paymentId": "payment-123",
            "amount": 399.0,
            "transactionId": "TXN_ABC123",
            "gatewayUrl": "https://mock-gateway.com/pay"
        }
        details = PaymentDetails(**data)
        assert details.paymentId == "payment-123"
        assert details.amount == 399.0
        assert details.transactionId == "TXN_ABC123"


class TestCheckoutResponse:
    """Test CheckoutResponse schema."""
    
    def test_valid_checkout_response(self):
        """Test valid checkout response."""
        data = {
            "payment": {
                "id": "payment-123",
                "totalAmount": 399.0,
                "paidAmount": 399.0,
                "remainingAmount": 0.0,
                "status": "PENDING",
                "transactionId": None
            },
            "bookings": [],
            "paymentDetails": {
                "paymentId": "payment-123",
                "amount": 399.0,
                "transactionId": "TXN_ABC123",
                "gatewayUrl": "https://mock-gateway.com/pay"
            }
        }
        response = CheckoutResponse(**data)
        assert response.payment.id == "payment-123"
        assert len(response.bookings) == 0
        assert response.paymentDetails.transactionId == "TXN_ABC123"


class TestBookingListResponse:
    """Test BookingListResponse schema."""
    
    def test_valid_booking_list_response(self):
        """Test valid booking list response."""
        data = {
            "data": [],
            "total": 0
        }
        response = BookingListResponse(**data)
        assert response.total == 0
        assert len(response.data) == 0
