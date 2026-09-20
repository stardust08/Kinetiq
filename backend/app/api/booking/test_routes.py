"""
Integration tests for booking routes.

Tests the booking API endpoints including:
- POST /bookings/checkout (create bookings from cart)
- Authentication requirements
"""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.core.dependencies import get_current_active_user

client = TestClient(app)


@pytest.fixture
def auth_headers():
    """Mock authentication headers with valid JWT token."""
    return {"Authorization": "Bearer valid-test-token"}


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    return type('User', (), {
        'id': 'user-123',
        'email': 'test@example.com',
        'status': 'ACTIVE'
    })()


@pytest.fixture
def checkout_request():
    """Sample checkout request data."""
    return {
        "scheduledTime": "2024-12-25T10:00:00Z"
    }


@pytest.fixture
def mock_payment():
    """Mock payment record."""
    return {
        'id': 'payment-123',
        'userId': 'user-123',
        'totalAmount': 399.0,
        'paidAmount': 399.0,
        'remainingAmount': 0.0,
        'status': 'PENDING',
        'transactionId': None
    }


@pytest.fixture
def mock_booking():
    """Mock booking record."""
    return {
        'id': 'booking-456',
        'userId': 'user-123',
        'serviceId': 'service-789',
        'paymentId': 'payment-123',
        'totalAmount': 399.0,
        'paidAmount': 399.0,
        'remainingAmount': 0.0,
        'time': datetime(2024, 12, 25, 10, 0, 0),
        'status': 'PENDING',
        'description': None,
        'createdAt': datetime(2024, 1, 1, 0, 0, 0)
    }


@pytest.fixture
def mock_payment_details():
    """Mock payment gateway details."""
    return {
        "paymentId": "payment-123",
        "amount": 399.0,
        "transactionId": "TXN_ABC123DEF456",
        "gatewayUrl": "https://mock-gateway.com/pay"
    }


def override_get_current_active_user(mock_user):
    """Create a dependency override for authentication."""
    async def _override():
        return mock_user
    return _override


class TestAuthentication:
    """Tests for authentication requirements on booking endpoints."""
    
    def test_checkout_requires_auth(self):
        """Test that POST /bookings/checkout requires authentication."""
        response = client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": "2024-12-25T10:00:00Z"}
        )
        assert response.status_code == 401


class TestCheckoutEndpoint:
    """Tests for POST /bookings/checkout endpoint."""
    
    @patch('app.api.booking.service.BookingService.create_bookings_from_cart')
    @patch('app.api.payment.service.PaymentService.initiate_payment')
    def test_checkout_success(
        self,
        mock_initiate_payment,
        mock_create_bookings,
        auth_headers,
        mock_user,
        checkout_request,
        mock_payment,
        mock_booking,
        mock_payment_details
    ):
        """Test successful checkout from cart."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        
        # Mock service responses
        mock_create_bookings.return_value = {
            "payment": mock_payment,
            "bookings": [mock_booking]
        }
        mock_initiate_payment.return_value = mock_payment_details
        
        # Make request
        response = client.post(
            "/api/bookings/checkout",
            json=checkout_request,
            headers=auth_headers
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "payment" in data["data"]
        assert "bookings" in data["data"]
        assert "paymentDetails" in data["data"]
        assert data["data"]["paymentDetails"]["paymentId"] == "payment-123"
        assert data["data"]["paymentDetails"]["transactionId"] == "TXN_ABC123DEF456"
        
        # Verify service calls
        mock_create_bookings.assert_called_once()
        mock_initiate_payment.assert_called_once_with("payment-123")
        
        # Clean up
        app.dependency_overrides.clear()
    
    @patch('app.api.booking.service.BookingService.create_bookings_from_cart')
    def test_checkout_empty_cart(
        self,
        mock_create_bookings,
        auth_headers,
        mock_user,
        checkout_request
    ):
        """Test checkout with empty cart raises error."""
        from app.core.exceptions import BadRequestException
        
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        
        # Mock service to raise exception
        mock_create_bookings.side_effect = BadRequestException("Cart is empty")
        
        # Make request
        response = client.post(
            "/api/bookings/checkout",
            json=checkout_request,
            headers=auth_headers
        )
        
        # Verify error response
        assert response.status_code == 400
        response_data = response.json()
        assert "error" in response_data
        assert "Cart is empty" in response_data["error"]
        
        # Clean up
        app.dependency_overrides.clear()
    
    def test_checkout_invalid_scheduled_time(self, auth_headers, mock_user):
        """Test checkout with invalid scheduledTime format."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        
        # Make request with invalid date format
        response = client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": "invalid-date"},
            headers=auth_headers
        )
        
        # Verify validation error
        assert response.status_code == 422
        
        # Clean up
        app.dependency_overrides.clear()


class TestGetBookingsEndpoint:
    """Tests for GET /bookings endpoint."""
    
    def test_get_bookings_requires_auth(self):
        """Test that GET /bookings requires authentication."""
        response = client.get("/api/bookings/")
        assert response.status_code == 401
    
    @patch('app.api.booking.service.BookingService.get_user_bookings_with_screening_counts')
    def test_get_bookings_success(
        self,
        mock_get_bookings,
        auth_headers,
        mock_user,
        mock_booking
    ):
        """Test successful retrieval of user bookings with screening counts."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        
        # Add screening count fields to mock booking
        mock_booking['totalScreeningCount'] = 10
        mock_booking['usedScreeningCount'] = 3
        mock_booking['remainingScreeningCount'] = 7
        mock_booking['postureAnalyses'] = []
        
        # Mock service response
        mock_get_bookings.return_value = [mock_booking]
        
        # Make request
        response = client.get(
            "/api/bookings/",
            headers=auth_headers
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data["data"][0]["id"] == "booking-456"
        
        # Verify service call
        mock_get_bookings.assert_called_once_with("user-123")
        
        # Clean up
        app.dependency_overrides.clear()
    
    @patch('app.api.booking.service.BookingService.get_user_bookings_with_screening_counts')
    def test_get_bookings_empty_list(
        self,
        mock_get_bookings,
        auth_headers,
        mock_user
    ):
        """Test retrieval when user has no bookings."""
        app.dependency_overrides[get_current_active_user] = override_get_current_active_user(mock_user)
        
        # Mock service response with empty list
        mock_get_bookings.return_value = []
        
        # Make request
        response = client.get(
            "/api/bookings/",
            headers=auth_headers
        )
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 0
        
        # Clean up
        app.dependency_overrides.clear()

