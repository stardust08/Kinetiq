"""
Unit tests for payment schemas.

Tests Pydantic model validation and serialization for payment-related schemas.
"""

import pytest
from datetime import datetime
from pydantic import ValidationError
from app.api.payment.schemas import (
    InitiatePaymentRequest,
    VerifyPaymentRequest,
    PayRemainingRequest,
    PaymentResponse,
    InitiatePaymentResponse,
    VerifyPaymentResponse,
    PayRemainingResponse
)


class TestInitiatePaymentRequest:
    """Test InitiatePaymentRequest schema."""
    
    def test_valid_initiate_payment_request(self):
        """Test valid payment initiation request."""
        data = {"paymentId": "payment-123"}
        request = InitiatePaymentRequest(**data)
        assert request.paymentId == "payment-123"
    
    def test_missing_payment_id(self):
        """Test initiate request fails without payment ID."""
        with pytest.raises(ValidationError):
            InitiatePaymentRequest(**{})


class TestVerifyPaymentRequest:
    """Test VerifyPaymentRequest schema."""
    
    def test_valid_verify_payment_request(self):
        """Test valid payment verification request."""
        data = {
            "paymentId": "payment-123",
            "transactionId": "TXN_ABC123",
            "status": "success"
        }
        request = VerifyPaymentRequest(**data)
        assert request.paymentId == "payment-123"
        assert request.transactionId == "TXN_ABC123"
        assert request.status == "success"
    
    def test_missing_required_fields(self):
        """Test verify request fails without required fields."""
        with pytest.raises(ValidationError):
            VerifyPaymentRequest(**{"paymentId": "payment-123"})


class TestPayRemainingRequest:
    """Test PayRemainingRequest schema."""
    
    def test_valid_pay_remaining_request(self):
        """Test valid remaining payment request."""
        data = {"transactionId": "TXN_XYZ789"}
        request = PayRemainingRequest(**data)
        assert request.transactionId == "TXN_XYZ789"
    
    def test_missing_transaction_id(self):
        """Test pay remaining request fails without transaction ID."""
        with pytest.raises(ValidationError):
            PayRemainingRequest(**{})


class TestPaymentResponse:
    """Test PaymentResponse schema."""
    
    def test_valid_payment_response(self):
        """Test valid payment response with all fields."""
        data = {
            "id": "payment-123",
            "userId": "user-456",
            "totalAmount": 399.0,
            "paidAmount": 399.0,
            "remainingAmount": 0.0,
            "status": "COMPLETED",
            "transactionId": "TXN_ABC123",
            "createdAt": "2024-01-01T00:00:00Z",
            "completedAt": "2024-01-01T00:05:00Z"
        }
        payment = PaymentResponse(**data)
        assert payment.id == "payment-123"
        assert payment.totalAmount == 399.0
        assert payment.status == "COMPLETED"
        assert payment.transactionId == "TXN_ABC123"
    
    def test_payment_response_without_optional_fields(self):
        """Test payment response with optional fields as None."""
        data = {
            "id": "payment-123",
            "userId": "user-456",
            "totalAmount": 399.0,
            "paidAmount": 199.5,
            "remainingAmount": 199.5,
            "status": "PARTIAL",
            "createdAt": "2024-01-01T00:00:00Z"
        }
        payment = PaymentResponse(**data)
        assert payment.transactionId is None
        assert payment.completedAt is None
        assert payment.status == "PARTIAL"


class TestInitiatePaymentResponse:
    """Test InitiatePaymentResponse schema."""
    
    def test_valid_initiate_payment_response(self):
        """Test valid payment initiation response."""
        data = {
            "paymentId": "payment-123",
            "amount": 399.0,
            "transactionId": "TXN_ABC123",
            "gatewayUrl": "https://mock-gateway.com/pay"
        }
        response = InitiatePaymentResponse(**data)
        assert response.paymentId == "payment-123"
        assert response.amount == 399.0
        assert response.transactionId == "TXN_ABC123"
        assert response.gatewayUrl == "https://mock-gateway.com/pay"


class TestVerifyPaymentResponse:
    """Test VerifyPaymentResponse schema."""
    
    def test_valid_verify_payment_response_success(self):
        """Test valid payment verification response for success."""
        data = {
            "success": True,
            "message": "Payment verified successfully"
        }
        response = VerifyPaymentResponse(**data)
        assert response.success is True
        assert response.message == "Payment verified successfully"
    
    def test_valid_verify_payment_response_failure(self):
        """Test valid payment verification response for failure."""
        data = {
            "success": False,
            "message": "Payment failed"
        }
        response = VerifyPaymentResponse(**data)
        assert response.success is False
        assert response.message == "Payment failed"


class TestPayRemainingResponse:
    """Test PayRemainingResponse schema."""
    
    def test_valid_pay_remaining_response(self):
        """Test valid remaining payment response."""
        data = {
            "success": True,
            "message": "Remaining payment completed",
            "payment": {
                "id": "payment-123",
                "userId": "user-456",
                "totalAmount": 399.0,
                "paidAmount": 399.0,
                "remainingAmount": 0.0,
                "status": "COMPLETED",
                "transactionId": "TXN_XYZ789",
                "createdAt": "2024-01-01T00:00:00Z",
                "completedAt": "2024-01-02T00:00:00Z"
            }
        }
        response = PayRemainingResponse(**data)
        assert response.success is True
        assert response.message == "Remaining payment completed"
        assert response.payment.status == "COMPLETED"
        assert response.payment.remainingAmount == 0.0
