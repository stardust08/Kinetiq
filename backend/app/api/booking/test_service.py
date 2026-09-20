"""
Unit tests for BookingService.

Tests the booking service layer business logic including:
- Creating bookings from cart
- Payment amount calculations
- Handling FULL and PARTIAL payment types
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from app.api.booking.service import BookingService
from app.core.exceptions import BadRequestException


@pytest.fixture
def mock_db(monkeypatch):
    """Mock database client."""
    mock = MagicMock()
    monkeypatch.setattr("app.api.booking.service.db", mock)
    return mock


@pytest.fixture
def sample_cart_with_full_payment_service():
    """Sample cart with a FULL payment service."""
    cart = MagicMock()
    cart.id = "cart-1"
    cart.userId = "user-1"
    cart.items = [
        {
            "id": "item-1",
            "serviceId": "service-1",
            "serviceName": "AI Assessment",
            "quantity": 1,
            "price": 399,
            "subtotal": 399
        }
    ]
    cart.cartValue = 399
    return cart


@pytest.fixture
def sample_cart_with_partial_payment_service():
    """Sample cart with a PARTIAL payment service."""
    cart = MagicMock()
    cart.id = "cart-2"
    cart.userId = "user-2"
    cart.items = [
        {
            "id": "item-2",
            "serviceId": "service-2",
            "serviceName": "Therapy Session",
            "quantity": 1,
            "price": 500,
            "subtotal": 500
        }
    ]
    cart.cartValue = 500
    return cart


@pytest.fixture
def sample_full_payment_service():
    """Sample service with FULL payment type."""
    service = MagicMock()
    service.id = "service-1"
    service.name = "AI Assessment"
    service.basePrice = 399
    service.salePrice = None
    service.paymentType = "FULL"
    service.advanceAmount = None
    service.advancePercent = None
    return service


@pytest.fixture
def sample_partial_payment_service_with_amount():
    """Sample service with PARTIAL payment type and fixed advance amount."""
    service = MagicMock()
    service.id = "service-2"
    service.name = "Therapy Session"
    service.basePrice = 500
    service.salePrice = None
    service.paymentType = "PARTIAL"
    service.advanceAmount = 200
    service.advancePercent = None
    return service


@pytest.fixture
def sample_partial_payment_service_with_percent():
    """Sample service with PARTIAL payment type and advance percentage."""
    service = MagicMock()
    service.id = "service-3"
    service.name = "Consultation"
    service.basePrice = 1000
    service.salePrice = None
    service.paymentType = "PARTIAL"
    service.advanceAmount = None
    service.advancePercent = 30
    return service


@pytest.mark.asyncio
class TestCreateBookingsFromCart:
    """Tests for create_bookings_from_cart method."""
    
    async def test_create_bookings_empty_cart(self, mock_db):
        """Test creating bookings from empty cart raises BadRequestException."""
        empty_cart = MagicMock()
        empty_cart.items = []
        mock_db.cart.find_first = AsyncMock(return_value=empty_cart)
        
        with pytest.raises(BadRequestException, match="Cart is empty"):
            await BookingService.create_bookings_from_cart(
                "user-1",
                datetime(2024, 12, 25, 10, 0, 0)
            )
    
    async def test_create_bookings_no_cart(self, mock_db):
        """Test creating bookings when user has no cart raises BadRequestException."""
        mock_db.cart.find_first = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Cart is empty"):
            await BookingService.create_bookings_from_cart(
                "user-1",
                datetime(2024, 12, 25, 10, 0, 0)
            )
    
    async def test_create_bookings_full_payment(
        self,
        mock_db,
        sample_cart_with_full_payment_service,
        sample_full_payment_service
    ):
        """Test creating bookings with FULL payment service."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_full_payment_service)
        mock_db.service.find_unique = AsyncMock(return_value=sample_full_payment_service)
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-1"
        payment.userId = "user-1"
        payment.totalAmount = 399
        payment.paidAmount = 399
        payment.remainingAmount = 0
        payment.status = "PENDING"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.serviceId = "service-1"
        booking.paymentId = "payment-1"
        booking.totalAmount = 399
        booking.paidAmount = 399
        booking.remainingAmount = 0
        booking.time = scheduled_time
        booking.status = "PENDING"
        mock_db.booking.create = AsyncMock(return_value=booking)
        
        result = await BookingService.create_bookings_from_cart("user-1", scheduled_time)
        
        # Verify payment creation
        assert result["payment"].id == "payment-1"
        assert result["payment"].totalAmount == 399
        assert result["payment"].paidAmount == 399
        assert result["payment"].remainingAmount == 0
        assert result["payment"].status == "PENDING"
        
        # Verify booking creation
        assert len(result["bookings"]) == 1
        assert result["bookings"][0].id == "booking-1"
        assert result["bookings"][0].totalAmount == 399
        assert result["bookings"][0].paidAmount == 399
        assert result["bookings"][0].remainingAmount == 0
        assert result["bookings"][0].time == scheduled_time
        
        # Verify database calls
        mock_db.payment.create.assert_called_once()
        mock_db.booking.create.assert_called_once()
    
    async def test_create_bookings_partial_payment_with_amount(
        self,
        mock_db,
        sample_cart_with_partial_payment_service,
        sample_partial_payment_service_with_amount
    ):
        """Test creating bookings with PARTIAL payment and fixed advance amount."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=sample_cart_with_partial_payment_service)
        mock_db.service.find_unique = AsyncMock(return_value=sample_partial_payment_service_with_amount)
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-2"
        payment.userId = "user-2"
        payment.totalAmount = 500
        payment.paidAmount = 200
        payment.remainingAmount = 300
        payment.status = "PENDING"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking = MagicMock()
        booking.id = "booking-2"
        booking.userId = "user-2"
        booking.serviceId = "service-2"
        booking.paymentId = "payment-2"
        booking.totalAmount = 500
        booking.paidAmount = 200
        booking.remainingAmount = 300
        booking.time = scheduled_time
        booking.status = "PENDING"
        mock_db.booking.create = AsyncMock(return_value=booking)
        
        result = await BookingService.create_bookings_from_cart("user-2", scheduled_time)
        
        # Verify payment amounts
        assert result["payment"].totalAmount == 500
        assert result["payment"].paidAmount == 200
        assert result["payment"].remainingAmount == 300
        
        # Verify booking amounts
        assert result["bookings"][0].totalAmount == 500
        assert result["bookings"][0].paidAmount == 200
        assert result["bookings"][0].remainingAmount == 300
    
    async def test_create_bookings_partial_payment_with_percent(self, mock_db):
        """Test creating bookings with PARTIAL payment and advance percentage."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Cart with service priced at 1000
        cart = MagicMock()
        cart.id = "cart-3"
        cart.userId = "user-3"
        cart.items = [
            {
                "id": "item-3",
                "serviceId": "service-3",
                "serviceName": "Consultation",
                "quantity": 1,
                "price": 1000,
                "subtotal": 1000
            }
        ]
        cart.cartValue = 1000
        
        # Service with 30% advance
        service = MagicMock()
        service.id = "service-3"
        service.name = "Consultation"
        service.paymentType = "PARTIAL"
        service.advanceAmount = None
        service.advancePercent = 30
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=cart)
        mock_db.service.find_unique = AsyncMock(return_value=service)
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-3"
        payment.userId = "user-3"
        payment.totalAmount = 1000
        payment.paidAmount = 300  # 30% of 1000
        payment.remainingAmount = 700
        payment.status = "PENDING"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking = MagicMock()
        booking.id = "booking-3"
        booking.userId = "user-3"
        booking.serviceId = "service-3"
        booking.paymentId = "payment-3"
        booking.totalAmount = 1000
        booking.paidAmount = 300
        booking.remainingAmount = 700
        booking.time = scheduled_time
        booking.status = "PENDING"
        mock_db.booking.create = AsyncMock(return_value=booking)
        
        result = await BookingService.create_bookings_from_cart("user-3", scheduled_time)
        
        # Verify payment amounts (30% advance)
        assert result["payment"].totalAmount == 1000
        assert result["payment"].paidAmount == 300
        assert result["payment"].remainingAmount == 700
        
        # Verify booking amounts
        assert result["bookings"][0].totalAmount == 1000
        assert result["bookings"][0].paidAmount == 300
        assert result["bookings"][0].remainingAmount == 700
    
    async def test_create_bookings_multiple_items(self, mock_db):
        """Test creating bookings from cart with multiple items."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Cart with multiple services
        cart = MagicMock()
        cart.id = "cart-4"
        cart.userId = "user-4"
        cart.items = [
            {
                "id": "item-4",
                "serviceId": "service-1",
                "serviceName": "AI Assessment",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            },
            {
                "id": "item-5",
                "serviceId": "service-2",
                "serviceName": "Therapy Session",
                "quantity": 1,
                "price": 500,
                "subtotal": 500
            }
        ]
        cart.cartValue = 899
        
        # Services
        service1 = MagicMock()
        service1.id = "service-1"
        service1.paymentType = "FULL"
        service1.advanceAmount = None
        service1.advancePercent = None
        
        service2 = MagicMock()
        service2.id = "service-2"
        service2.paymentType = "PARTIAL"
        service2.advanceAmount = 200
        service2.advancePercent = None
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=cart)
        mock_db.service.find_unique = AsyncMock(side_effect=[service1, service2, service1, service2])
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-4"
        payment.userId = "user-4"
        payment.totalAmount = 899
        payment.paidAmount = 599  # 399 (full) + 200 (partial advance)
        payment.remainingAmount = 300  # 500 - 200
        payment.status = "PENDING"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking1 = MagicMock()
        booking1.id = "booking-4"
        booking1.totalAmount = 399
        booking1.paidAmount = 399
        booking1.remainingAmount = 0
        
        booking2 = MagicMock()
        booking2.id = "booking-5"
        booking2.totalAmount = 500
        booking2.paidAmount = 200
        booking2.remainingAmount = 300
        
        mock_db.booking.create = AsyncMock(side_effect=[booking1, booking2])
        
        result = await BookingService.create_bookings_from_cart("user-4", scheduled_time)
        
        # Verify payment totals
        assert result["payment"].totalAmount == 899
        assert result["payment"].paidAmount == 599
        assert result["payment"].remainingAmount == 300
        
        # Verify bookings
        assert len(result["bookings"]) == 2
        assert result["bookings"][0].totalAmount == 399
        assert result["bookings"][0].paidAmount == 399
        assert result["bookings"][0].remainingAmount == 0
        assert result["bookings"][1].totalAmount == 500
        assert result["bookings"][1].paidAmount == 200
        assert result["bookings"][1].remainingAmount == 300
    
    async def test_create_bookings_partial_no_advance_config(self, mock_db):
        """Test PARTIAL payment with no advance amount or percent defaults to full amount."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        cart = MagicMock()
        cart.id = "cart-5"
        cart.userId = "user-5"
        cart.items = [
            {
                "id": "item-6",
                "serviceId": "service-4",
                "serviceName": "Service",
                "quantity": 1,
                "price": 600,
                "subtotal": 600
            }
        ]
        cart.cartValue = 600
        
        # Service with PARTIAL but no advance config
        service = MagicMock()
        service.id = "service-4"
        service.paymentType = "PARTIAL"
        service.advanceAmount = None
        service.advancePercent = None
        
        mock_db.cart.find_first = AsyncMock(return_value=cart)
        mock_db.service.find_unique = AsyncMock(return_value=service)
        
        payment = MagicMock()
        payment.id = "payment-5"
        payment.totalAmount = 600
        payment.paidAmount = 600  # Defaults to full amount
        payment.remainingAmount = 0
        payment.status = "PENDING"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        booking = MagicMock()
        booking.id = "booking-6"
        booking.totalAmount = 600
        booking.paidAmount = 600
        booking.remainingAmount = 0
        mock_db.booking.create = AsyncMock(return_value=booking)
        
        result = await BookingService.create_bookings_from_cart("user-5", scheduled_time)
        
        # Should default to full payment
        assert result["payment"].paidAmount == 600
        assert result["payment"].remainingAmount == 0
        assert result["bookings"][0].paidAmount == 600
        assert result["bookings"][0].remainingAmount == 0



@pytest.mark.asyncio
class TestGetUserBookings:
    """Tests for get_user_bookings method."""
    
    async def test_get_user_bookings_empty(self, mock_db):
        """Test getting bookings when user has no bookings."""
        mock_db.booking.find_many = AsyncMock(return_value=[])
        
        result = await BookingService.get_user_bookings("user-1")
        
        assert result == []
        mock_db.booking.find_many.assert_called_once_with(
            where={"userId": "user-1"},
            include={"service": True, "payment": True},
            order={"createdAt": "desc"}
        )
    
    async def test_get_user_bookings_single(self, mock_db):
        """Test getting bookings with single booking."""
        # Mock booking with service and payment
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.serviceId = "service-1"
        booking.paymentId = "payment-1"
        booking.totalAmount = 399
        booking.paidAmount = 399
        booking.remainingAmount = 0
        booking.status = "CONFIRMED"
        booking.createdAt = datetime(2024, 12, 25, 10, 0, 0)
        
        # Mock service
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment"
        service.basePrice = 399
        booking.service = service
        
        # Mock payment
        payment = MagicMock()
        payment.id = "payment-1"
        payment.totalAmount = 399
        payment.paidAmount = 399
        payment.remainingAmount = 0
        payment.status = "COMPLETED"
        booking.payment = payment
        
        mock_db.booking.find_many = AsyncMock(return_value=[booking])
        
        result = await BookingService.get_user_bookings("user-1")
        
        assert len(result) == 1
        assert result[0].id == "booking-1"
        assert result[0].service.name == "AI Assessment"
        assert result[0].payment.status == "COMPLETED"
        mock_db.booking.find_many.assert_called_once()
    
    async def test_get_user_bookings_multiple_sorted(self, mock_db):
        """Test getting multiple bookings sorted by creation date (newest first)."""
        # Create bookings with different creation dates
        booking1 = MagicMock()
        booking1.id = "booking-1"
        booking1.userId = "user-1"
        booking1.createdAt = datetime(2024, 12, 20, 10, 0, 0)
        booking1.service = MagicMock(name="Service 1")
        booking1.payment = MagicMock(status="COMPLETED")
        
        booking2 = MagicMock()
        booking2.id = "booking-2"
        booking2.userId = "user-1"
        booking2.createdAt = datetime(2024, 12, 25, 10, 0, 0)
        booking2.service = MagicMock(name="Service 2")
        booking2.payment = MagicMock(status="PARTIAL")
        
        booking3 = MagicMock()
        booking3.id = "booking-3"
        booking3.userId = "user-1"
        booking3.createdAt = datetime(2024, 12, 22, 10, 0, 0)
        booking3.service = MagicMock(name="Service 3")
        booking3.payment = MagicMock(status="COMPLETED")
        
        # Mock returns bookings sorted by createdAt desc
        mock_db.booking.find_many = AsyncMock(return_value=[booking2, booking3, booking1])
        
        result = await BookingService.get_user_bookings("user-1")
        
        assert len(result) == 3
        # Verify order (newest first)
        assert result[0].id == "booking-2"
        assert result[0].createdAt == datetime(2024, 12, 25, 10, 0, 0)
        assert result[1].id == "booking-3"
        assert result[1].createdAt == datetime(2024, 12, 22, 10, 0, 0)
        assert result[2].id == "booking-1"
        assert result[2].createdAt == datetime(2024, 12, 20, 10, 0, 0)
    
    async def test_get_user_bookings_includes_relations(self, mock_db):
        """Test that bookings include service and payment details."""
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        
        # Verify service details are included
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment"
        service.basePrice = 399
        service.paymentType = "FULL"
        booking.service = service
        
        # Verify payment details are included
        payment = MagicMock()
        payment.id = "payment-1"
        payment.totalAmount = 399
        payment.paidAmount = 399
        payment.remainingAmount = 0
        payment.status = "COMPLETED"
        booking.payment = payment
        
        mock_db.booking.find_many = AsyncMock(return_value=[booking])
        
        result = await BookingService.get_user_bookings("user-1")
        
        # Verify service details
        assert result[0].service.id == "service-1"
        assert result[0].service.name == "AI Assessment"
        assert result[0].service.basePrice == 399
        
        # Verify payment details
        assert result[0].payment.id == "payment-1"
        assert result[0].payment.totalAmount == 399
        assert result[0].payment.status == "COMPLETED"
        
        # Verify include parameter was passed
        mock_db.booking.find_many.assert_called_once_with(
            where={"userId": "user-1"},
            include={"service": True, "payment": True},
            order={"createdAt": "desc"}
        )


@pytest.mark.asyncio
class TestGetBookingDetails:
    """Tests for get_booking_details method."""
    
    async def test_get_booking_details_success(self, mock_db):
        """Test getting booking details successfully."""
        # Mock booking with full details
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.serviceId = "service-1"
        booking.paymentId = "payment-1"
        booking.clinicianId = None
        booking.totalAmount = 399
        booking.paidAmount = 399
        booking.remainingAmount = 0
        booking.status = "CONFIRMED"
        booking.time = datetime(2024, 12, 25, 10, 0, 0)
        booking.createdAt = datetime(2024, 12, 20, 10, 0, 0)
        
        # Mock service
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment"
        service.basePrice = 399
        service.paymentType = "FULL"
        booking.service = service
        
        # Mock payment
        payment = MagicMock()
        payment.id = "payment-1"
        payment.totalAmount = 399
        payment.paidAmount = 399
        payment.remainingAmount = 0
        payment.status = "COMPLETED"
        booking.payment = payment
        
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        result = await BookingService.get_booking_details("booking-1", "user-1")
        
        assert result is not None
        assert result.id == "booking-1"
        assert result.userId == "user-1"
        assert result.service.name == "AI Assessment"
        assert result.payment.status == "COMPLETED"
        assert result.totalAmount == 399
        assert result.paidAmount == 399
        assert result.remainingAmount == 0
        
        # Verify database call
        mock_db.booking.find_first.assert_called_once_with(
            where={"id": "booking-1", "userId": "user-1"},
            include={"service": True, "payment": True}
        )
    
    async def test_get_booking_details_not_found(self, mock_db):
        """Test getting booking details when booking doesn't exist."""
        mock_db.booking.find_first = AsyncMock(return_value=None)
        
        result = await BookingService.get_booking_details("booking-999", "user-1")
        
        assert result is None
        mock_db.booking.find_first.assert_called_once()
    
    async def test_get_booking_details_wrong_user(self, mock_db):
        """Test getting booking details with wrong user ID returns None."""
        mock_db.booking.find_first = AsyncMock(return_value=None)
        
        result = await BookingService.get_booking_details("booking-1", "wrong-user")
        
        assert result is None
        mock_db.booking.find_first.assert_called_once_with(
            where={"id": "booking-1", "userId": "wrong-user"},
            include={"service": True, "payment": True}
        )
    
    async def test_get_booking_details_partial_payment(self, mock_db):
        """Test getting booking details with partial payment."""
        # Mock booking with partial payment
        booking = MagicMock()
        booking.id = "booking-2"
        booking.userId = "user-2"
        booking.serviceId = "service-2"
        booking.paymentId = "payment-2"
        booking.totalAmount = 500
        booking.paidAmount = 200
        booking.remainingAmount = 300
        booking.status = "CONFIRMED"
        
        # Mock service
        service = MagicMock()
        service.id = "service-2"
        service.name = "Therapy Session"
        service.paymentType = "PARTIAL"
        service.advanceAmount = 200
        booking.service = service
        
        # Mock payment
        payment = MagicMock()
        payment.id = "payment-2"
        payment.totalAmount = 500
        payment.paidAmount = 200
        payment.remainingAmount = 300
        payment.status = "PARTIAL"
        booking.payment = payment
        
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        result = await BookingService.get_booking_details("booking-2", "user-2")
        
        assert result is not None
        assert result.totalAmount == 500
        assert result.paidAmount == 200
        assert result.remainingAmount == 300
        assert result.service.paymentType == "PARTIAL"
        assert result.payment.status == "PARTIAL"
    
    async def test_get_booking_details_with_clinician(self, mock_db):
        """Test getting booking details with assigned clinician."""
        # Mock booking with clinician
        booking = MagicMock()
        booking.id = "booking-3"
        booking.userId = "user-3"
        booking.clinicianId = "clinician-1"
        booking.totalAmount = 399
        booking.paidAmount = 399
        booking.remainingAmount = 0
        booking.status = "CONFIRMED"
        
        # Mock service
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment"
        booking.service = service
        
        # Mock payment
        payment = MagicMock()
        payment.id = "payment-3"
        payment.status = "COMPLETED"
        booking.payment = payment
        
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        result = await BookingService.get_booking_details("booking-3", "user-3")
        
        assert result is not None
        assert result.clinicianId == "clinician-1"
    
    async def test_get_booking_details_includes_relations(self, mock_db):
        """Test that booking details include service and payment relations."""
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        
        # Verify service details are included
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment"
        service.description = "Comprehensive AI-powered assessment"
        service.basePrice = 399
        service.paymentType = "FULL"
        booking.service = service
        
        # Verify payment details are included
        payment = MagicMock()
        payment.id = "payment-1"
        payment.totalAmount = 399
        payment.paidAmount = 399
        payment.remainingAmount = 0
        payment.status = "COMPLETED"
        payment.transactionId = "TXN_ABC123"
        booking.payment = payment
        
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        result = await BookingService.get_booking_details("booking-1", "user-1")
        
        # Verify service details
        assert result.service.id == "service-1"
        assert result.service.name == "AI Assessment"
        assert result.service.description == "Comprehensive AI-powered assessment"
        
        # Verify payment details
        assert result.payment.id == "payment-1"
        assert result.payment.totalAmount == 399
        assert result.payment.transactionId == "TXN_ABC123"
        
        # Verify include parameter was passed
        mock_db.booking.find_first.assert_called_once_with(
            where={"id": "booking-1", "userId": "user-1"},
            include={"service": True, "payment": True}
        )




@pytest.mark.asyncio
class TestAssignClinician:
    """Tests for assign_clinician method."""
    
    async def test_assign_clinician_success(self, mock_db):
        """Test successfully assigning a clinician to a booking."""
        # Mock booking
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.serviceId = "service-1"
        booking.clinicianId = None
        mock_db.booking.find_unique = AsyncMock(return_value=booking)
        
        # Mock clinician user
        clinician = MagicMock()
        clinician.id = "clinician-1"
        clinician.role = "CLINICIAN"
        mock_db.user.find_unique = AsyncMock(return_value=clinician)
        
        # Mock updated booking
        updated_booking = MagicMock()
        updated_booking.id = "booking-1"
        updated_booking.userId = "user-1"
        updated_booking.clinicianId = "clinician-1"
        updated_booking.service = MagicMock(name="AI Assessment")
        updated_booking.payment = MagicMock(status="COMPLETED")
        mock_db.booking.update = AsyncMock(return_value=updated_booking)
        
        result = await BookingService.assign_clinician("booking-1", "clinician-1")
        
        assert result is not None
        assert result.clinicianId == "clinician-1"
        
        # Verify database calls
        mock_db.booking.find_unique.assert_called_once_with(where={"id": "booking-1"})
        mock_db.user.find_unique.assert_called_once_with(where={"id": "clinician-1"})
        mock_db.booking.update.assert_called_once_with(
            where={"id": "booking-1"},
            data={"clinicianId": "clinician-1"},
            include={"service": True, "payment": True}
        )
    
    async def test_assign_clinician_booking_not_found(self, mock_db):
        """Test assigning clinician when booking doesn't exist."""
        mock_db.booking.find_unique = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Booking not found"):
            await BookingService.assign_clinician("booking-999", "clinician-1")
        
        mock_db.booking.find_unique.assert_called_once_with(where={"id": "booking-999"})
    
    async def test_assign_clinician_clinician_not_found(self, mock_db):
        """Test assigning clinician when clinician doesn't exist."""
        # Mock booking exists
        booking = MagicMock()
        booking.id = "booking-1"
        mock_db.booking.find_unique = AsyncMock(return_value=booking)
        
        # Mock clinician doesn't exist
        mock_db.user.find_unique = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Clinician not found"):
            await BookingService.assign_clinician("booking-1", "clinician-999")
        
        mock_db.user.find_unique.assert_called_once_with(where={"id": "clinician-999"})
    
    async def test_assign_clinician_user_not_clinician(self, mock_db):
        """Test assigning clinician when user doesn't have CLINICIAN role."""
        # Mock booking exists
        booking = MagicMock()
        booking.id = "booking-1"
        mock_db.booking.find_unique = AsyncMock(return_value=booking)
        
        # Mock user exists but is not a clinician
        user = MagicMock()
        user.id = "user-1"
        user.role = "USER"
        mock_db.user.find_unique = AsyncMock(return_value=user)
        
        with pytest.raises(BadRequestException, match="User is not a clinician"):
            await BookingService.assign_clinician("booking-1", "user-1")
        
        mock_db.user.find_unique.assert_called_once_with(where={"id": "user-1"})
    
    async def test_assign_clinician_admin_role(self, mock_db):
        """Test assigning clinician when user has ADMIN role (should fail)."""
        # Mock booking exists
        booking = MagicMock()
        booking.id = "booking-1"
        mock_db.booking.find_unique = AsyncMock(return_value=booking)
        
        # Mock user is admin, not clinician
        admin = MagicMock()
        admin.id = "admin-1"
        admin.role = "ADMIN"
        mock_db.user.find_unique = AsyncMock(return_value=admin)
        
        with pytest.raises(BadRequestException, match="User is not a clinician"):
            await BookingService.assign_clinician("booking-1", "admin-1")
    
    async def test_assign_clinician_includes_relations(self, mock_db):
        """Test that updated booking includes service and payment relations."""
        # Mock booking
        booking = MagicMock()
        booking.id = "booking-1"
        mock_db.booking.find_unique = AsyncMock(return_value=booking)
        
        # Mock clinician
        clinician = MagicMock()
        clinician.id = "clinician-1"
        clinician.role = "CLINICIAN"
        mock_db.user.find_unique = AsyncMock(return_value=clinician)
        
        # Mock updated booking with relations
        updated_booking = MagicMock()
        updated_booking.id = "booking-1"
        updated_booking.clinicianId = "clinician-1"
        
        # Mock service details
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment"
        service.basePrice = 399
        updated_booking.service = service
        
        # Mock payment details
        payment = MagicMock()
        payment.id = "payment-1"
        payment.totalAmount = 399
        payment.status = "COMPLETED"
        updated_booking.payment = payment
        
        mock_db.booking.update = AsyncMock(return_value=updated_booking)
        
        result = await BookingService.assign_clinician("booking-1", "clinician-1")
        
        # Verify relations are included
        assert result.service.name == "AI Assessment"
        assert result.payment.status == "COMPLETED"
        
        # Verify include parameter was passed
        mock_db.booking.update.assert_called_once_with(
            where={"id": "booking-1"},
            data={"clinicianId": "clinician-1"},
            include={"service": True, "payment": True}
        )
    
    async def test_assign_clinician_reassign(self, mock_db):
        """Test reassigning a different clinician to a booking."""
        # Mock booking with existing clinician
        booking = MagicMock()
        booking.id = "booking-1"
        booking.clinicianId = "clinician-1"
        mock_db.booking.find_unique = AsyncMock(return_value=booking)
        
        # Mock new clinician
        new_clinician = MagicMock()
        new_clinician.id = "clinician-2"
        new_clinician.role = "CLINICIAN"
        mock_db.user.find_unique = AsyncMock(return_value=new_clinician)
        
        # Mock updated booking
        updated_booking = MagicMock()
        updated_booking.id = "booking-1"
        updated_booking.clinicianId = "clinician-2"
        updated_booking.service = MagicMock()
        updated_booking.payment = MagicMock()
        mock_db.booking.update = AsyncMock(return_value=updated_booking)
        
        result = await BookingService.assign_clinician("booking-1", "clinician-2")
        
        assert result.clinicianId == "clinician-2"
        mock_db.booking.update.assert_called_once_with(
            where={"id": "booking-1"},
            data={"clinicianId": "clinician-2"},
            include={"service": True, "payment": True}
        )


@pytest.mark.asyncio
class TestCreateBookingsWithScreeningCounts:
    """Tests for screening count population in create_bookings_from_cart method."""
    
    async def test_create_bookings_with_screening_count(self, mock_db):
        """Test creating bookings populates screening counts from service."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Cart with service that includes screening counts
        cart = MagicMock()
        cart.id = "cart-1"
        cart.userId = "user-1"
        cart.items = [
            {
                "id": "item-1",
                "serviceId": "service-1",
                "serviceName": "AI Assessment with 5 Screenings",
                "quantity": 1,
                "price": 399,
                "subtotal": 399
            }
        ]
        cart.cartValue = 399
        
        # Service with includedScreeningCount
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment with 5 Screenings"
        service.paymentType = "FULL"
        service.advanceAmount = None
        service.advancePercent = None
        service.includedScreeningCount = 5
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=cart)
        mock_db.service.find_unique = AsyncMock(return_value=service)
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-1"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.serviceId = "service-1"
        booking.totalScreeningCount = 5
        booking.usedScreeningCount = 0
        booking.remainingScreeningCount = 5
        mock_db.booking.create = AsyncMock(return_value=booking)
        
        result = await BookingService.create_bookings_from_cart("user-1", scheduled_time)
        
        # Verify booking was created with screening counts
        assert len(result["bookings"]) == 1
        assert result["bookings"][0].totalScreeningCount == 5
        assert result["bookings"][0].usedScreeningCount == 0
        assert result["bookings"][0].remainingScreeningCount == 5
        
        # Verify booking.create was called with screening count fields
        create_call_args = mock_db.booking.create.call_args
        assert create_call_args[1]["data"]["totalScreeningCount"] == 5
        assert create_call_args[1]["data"]["usedScreeningCount"] == 0
        assert create_call_args[1]["data"]["remainingScreeningCount"] == 5
    
    async def test_create_bookings_without_screening_count(self, mock_db):
        """Test creating bookings when service has no screening count defaults to 0."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Cart with service that has no screening counts
        cart = MagicMock()
        cart.id = "cart-2"
        cart.userId = "user-2"
        cart.items = [
            {
                "id": "item-2",
                "serviceId": "service-2",
                "serviceName": "Regular Service",
                "quantity": 1,
                "price": 299,
                "subtotal": 299
            }
        ]
        cart.cartValue = 299
        
        # Service without includedScreeningCount
        service = MagicMock()
        service.id = "service-2"
        service.name = "Regular Service"
        service.paymentType = "FULL"
        service.advanceAmount = None
        service.advancePercent = None
        service.includedScreeningCount = None
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=cart)
        mock_db.service.find_unique = AsyncMock(return_value=service)
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-2"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking = MagicMock()
        booking.id = "booking-2"
        booking.userId = "user-2"
        booking.serviceId = "service-2"
        booking.totalScreeningCount = 0
        booking.usedScreeningCount = 0
        booking.remainingScreeningCount = 0
        mock_db.booking.create = AsyncMock(return_value=booking)
        
        result = await BookingService.create_bookings_from_cart("user-2", scheduled_time)
        
        # Verify booking was created with zero screening counts
        assert len(result["bookings"]) == 1
        assert result["bookings"][0].totalScreeningCount == 0
        assert result["bookings"][0].usedScreeningCount == 0
        assert result["bookings"][0].remainingScreeningCount == 0
        
        # Verify booking.create was called with zero screening counts
        create_call_args = mock_db.booking.create.call_args
        assert create_call_args[1]["data"]["totalScreeningCount"] == 0
        assert create_call_args[1]["data"]["usedScreeningCount"] == 0
        assert create_call_args[1]["data"]["remainingScreeningCount"] == 0
    
    async def test_create_bookings_multiple_services_different_counts(self, mock_db):
        """Test creating bookings with multiple services having different screening counts."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Cart with multiple services
        cart = MagicMock()
        cart.id = "cart-3"
        cart.userId = "user-3"
        cart.items = [
            {
                "id": "item-3",
                "serviceId": "service-3",
                "serviceName": "Basic Plan",
                "quantity": 1,
                "price": 199,
                "subtotal": 199
            },
            {
                "id": "item-4",
                "serviceId": "service-4",
                "serviceName": "Premium Plan",
                "quantity": 1,
                "price": 599,
                "subtotal": 599
            }
        ]
        cart.cartValue = 798
        
        # Service 1 with 3 screening counts
        service1 = MagicMock()
        service1.id = "service-3"
        service1.paymentType = "FULL"
        service1.advanceAmount = None
        service1.advancePercent = None
        service1.includedScreeningCount = 3
        
        # Service 2 with 10 screening counts
        service2 = MagicMock()
        service2.id = "service-4"
        service2.paymentType = "FULL"
        service2.advanceAmount = None
        service2.advancePercent = None
        service2.includedScreeningCount = 10
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=cart)
        mock_db.service.find_unique = AsyncMock(side_effect=[service1, service2, service1, service2])
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-3"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking1 = MagicMock()
        booking1.id = "booking-3"
        booking1.totalScreeningCount = 3
        booking1.usedScreeningCount = 0
        booking1.remainingScreeningCount = 3
        
        booking2 = MagicMock()
        booking2.id = "booking-4"
        booking2.totalScreeningCount = 10
        booking2.usedScreeningCount = 0
        booking2.remainingScreeningCount = 10
        
        mock_db.booking.create = AsyncMock(side_effect=[booking1, booking2])
        
        result = await BookingService.create_bookings_from_cart("user-3", scheduled_time)
        
        # Verify both bookings have correct screening counts
        assert len(result["bookings"]) == 2
        assert result["bookings"][0].totalScreeningCount == 3
        assert result["bookings"][0].remainingScreeningCount == 3
        assert result["bookings"][1].totalScreeningCount == 10
        assert result["bookings"][1].remainingScreeningCount == 10
    
    async def test_create_bookings_partial_payment_with_screening_count(self, mock_db):
        """Test creating bookings with partial payment and screening counts."""
        scheduled_time = datetime(2024, 12, 25, 10, 0, 0)
        
        # Cart with partial payment service
        cart = MagicMock()
        cart.id = "cart-4"
        cart.userId = "user-4"
        cart.items = [
            {
                "id": "item-5",
                "serviceId": "service-5",
                "serviceName": "Therapy with Assessments",
                "quantity": 1,
                "price": 800,
                "subtotal": 800
            }
        ]
        cart.cartValue = 800
        
        # Service with partial payment and screening counts
        service = MagicMock()
        service.id = "service-5"
        service.paymentType = "PARTIAL"
        service.advanceAmount = 300
        service.advancePercent = None
        service.includedScreeningCount = 8
        
        # Setup mocks
        mock_db.cart.find_first = AsyncMock(return_value=cart)
        mock_db.service.find_unique = AsyncMock(return_value=service)
        
        # Mock payment creation
        payment = MagicMock()
        payment.id = "payment-4"
        mock_db.payment.create = AsyncMock(return_value=payment)
        
        # Mock booking creation
        booking = MagicMock()
        booking.id = "booking-5"
        booking.totalAmount = 800
        booking.paidAmount = 300
        booking.remainingAmount = 500
        booking.totalScreeningCount = 8
        booking.usedScreeningCount = 0
        booking.remainingScreeningCount = 8
        mock_db.booking.create = AsyncMock(return_value=booking)
        
        result = await BookingService.create_bookings_from_cart("user-4", scheduled_time)
        
        # Verify booking has both payment and screening count fields
        assert result["bookings"][0].totalAmount == 800
        assert result["bookings"][0].paidAmount == 300
        assert result["bookings"][0].remainingAmount == 500
        assert result["bookings"][0].totalScreeningCount == 8
        assert result["bookings"][0].usedScreeningCount == 0
        assert result["bookings"][0].remainingScreeningCount == 8
        
        # Verify booking.create was called with all fields
        create_call_args = mock_db.booking.create.call_args
        assert create_call_args[1]["data"]["totalAmount"] == 800
        assert create_call_args[1]["data"]["paidAmount"] == 300
        assert create_call_args[1]["data"]["remainingAmount"] == 500
        assert create_call_args[1]["data"]["totalScreeningCount"] == 8
        assert create_call_args[1]["data"]["usedScreeningCount"] == 0
        assert create_call_args[1]["data"]["remainingScreeningCount"] == 8



@pytest.mark.asyncio
class TestGetUserBookingsWithScreeningCounts:
    """Tests for get_user_bookings_with_screening_counts method."""
    
    async def test_get_user_bookings_with_screening_counts_success(self, mock_db):
        """Test getting bookings with screening counts and posture analyses."""
        # Mock booking with screening counts and analyses
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.serviceId = "service-1"
        booking.totalScreeningCount = 10
        booking.usedScreeningCount = 3
        booking.remainingScreeningCount = 7
        booking.createdAt = datetime(2024, 12, 25, 10, 0, 0)
        
        # Mock service
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment Package"
        booking.service = service
        
        # Mock payment
        payment = MagicMock()
        payment.id = "payment-1"
        payment.status = "COMPLETED"
        booking.payment = payment
        
        # Mock posture analyses
        analysis1 = MagicMock()
        analysis1.id = "analysis-1"
        analysis1.analysisDate = datetime(2024, 12, 20, 10, 0, 0)
        analysis1.status = "completed"
        
        analysis2 = MagicMock()
        analysis2.id = "analysis-2"
        analysis2.analysisDate = datetime(2024, 12, 22, 10, 0, 0)
        analysis2.status = "completed"
        
        booking.postureAnalyses = [analysis1, analysis2]
        
        mock_db.booking.find_many = AsyncMock(return_value=[booking])
        
        result = await BookingService.get_user_bookings_with_screening_counts("user-1")
        
        assert len(result) == 1
        assert result[0].id == "booking-1"
        assert result[0].totalScreeningCount == 10
        assert result[0].usedScreeningCount == 3
        assert result[0].remainingScreeningCount == 7
        assert len(result[0].postureAnalyses) == 2
        assert result[0].service.name == "AI Assessment Package"
        
        # Verify database call includes posture analyses
        mock_db.booking.find_many.assert_called_once_with(
            where={"userId": "user-1"},
            include={
                "service": True,
                "payment": True,
                "postureAnalyses": {
                    "select": {"id": True, "analysisDate": True, "status": True}
                }
            },
            order={"createdAt": "desc"}
        )
    
    async def test_get_user_bookings_with_screening_counts_empty(self, mock_db):
        """Test getting bookings when user has no bookings."""
        mock_db.booking.find_many = AsyncMock(return_value=[])
        
        result = await BookingService.get_user_bookings_with_screening_counts("user-1")
        
        assert result == []
    
    async def test_get_user_bookings_with_screening_counts_multiple(self, mock_db):
        """Test getting multiple bookings with different screening counts."""
        # Booking 1 with some counts used
        booking1 = MagicMock()
        booking1.id = "booking-1"
        booking1.userId = "user-1"
        booking1.totalScreeningCount = 10
        booking1.usedScreeningCount = 5
        booking1.remainingScreeningCount = 5
        booking1.createdAt = datetime(2024, 12, 25, 10, 0, 0)
        booking1.service = MagicMock(name="Premium Plan")
        booking1.payment = MagicMock(status="COMPLETED")
        booking1.postureAnalyses = [MagicMock(id=f"analysis-{i}") for i in range(5)]
        
        # Booking 2 with no counts used
        booking2 = MagicMock()
        booking2.id = "booking-2"
        booking2.userId = "user-1"
        booking2.totalScreeningCount = 5
        booking2.usedScreeningCount = 0
        booking2.remainingScreeningCount = 5
        booking2.createdAt = datetime(2024, 12, 20, 10, 0, 0)
        booking2.service = MagicMock(name="Basic Plan")
        booking2.payment = MagicMock(status="COMPLETED")
        booking2.postureAnalyses = []
        
        # Booking 3 with all counts used
        booking3 = MagicMock()
        booking3.id = "booking-3"
        booking3.userId = "user-1"
        booking3.totalScreeningCount = 3
        booking3.usedScreeningCount = 3
        booking3.remainingScreeningCount = 0
        booking3.createdAt = datetime(2024, 12, 15, 10, 0, 0)
        booking3.service = MagicMock(name="Starter Plan")
        booking3.payment = MagicMock(status="COMPLETED")
        booking3.postureAnalyses = [MagicMock(id=f"analysis-{i}") for i in range(3)]
        
        mock_db.booking.find_many = AsyncMock(return_value=[booking1, booking2, booking3])
        
        result = await BookingService.get_user_bookings_with_screening_counts("user-1")
        
        assert len(result) == 3
        # Verify first booking
        assert result[0].totalScreeningCount == 10
        assert result[0].remainingScreeningCount == 5
        assert len(result[0].postureAnalyses) == 5
        # Verify second booking
        assert result[1].totalScreeningCount == 5
        assert result[1].remainingScreeningCount == 5
        assert len(result[1].postureAnalyses) == 0
        # Verify third booking
        assert result[2].totalScreeningCount == 3
        assert result[2].remainingScreeningCount == 0
        assert len(result[2].postureAnalyses) == 3
    
    async def test_get_user_bookings_with_screening_counts_no_screening_service(self, mock_db):
        """Test getting bookings for services without screening counts."""
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.totalScreeningCount = 0
        booking.usedScreeningCount = 0
        booking.remainingScreeningCount = 0
        booking.createdAt = datetime(2024, 12, 25, 10, 0, 0)
        booking.service = MagicMock(name="Regular Service")
        booking.payment = MagicMock(status="COMPLETED")
        booking.postureAnalyses = []
        
        mock_db.booking.find_many = AsyncMock(return_value=[booking])
        
        result = await BookingService.get_user_bookings_with_screening_counts("user-1")
        
        assert len(result) == 1
        assert result[0].totalScreeningCount == 0
        assert result[0].usedScreeningCount == 0
        assert result[0].remainingScreeningCount == 0
        assert len(result[0].postureAnalyses) == 0


@pytest.mark.asyncio
class TestGetBookingScreeningInfo:
    """Tests for get_booking_screening_info method."""
    
    async def test_get_booking_screening_info_success(self, mock_db):
        """Test getting detailed screening info for a booking."""
        # Mock booking with screening counts
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.totalScreeningCount = 10
        booking.usedScreeningCount = 3
        booking.remainingScreeningCount = 7
        booking.status = "CONFIRMED"
        
        # Mock service
        service = MagicMock()
        service.id = "service-1"
        service.name = "AI Assessment Package"
        booking.service = service
        
        # Mock posture analyses
        analysis1 = MagicMock()
        analysis1.id = "analysis-1"
        analysis1.analysisDate = datetime(2024, 12, 20, 10, 0, 0)
        analysis1.status = "completed"
        
        analysis2 = MagicMock()
        analysis2.id = "analysis-2"
        analysis2.analysisDate = datetime(2024, 12, 22, 10, 0, 0)
        analysis2.status = "completed"
        
        analysis3 = MagicMock()
        analysis3.id = "analysis-3"
        analysis3.analysisDate = datetime(2024, 12, 24, 10, 0, 0)
        analysis3.status = "completed"
        
        booking.postureAnalyses = [analysis3, analysis2, analysis1]  # Sorted desc
        
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        result = await BookingService.get_booking_screening_info("booking-1", "user-1")
        
        assert result["bookingId"] == "booking-1"
        assert result["serviceName"] == "AI Assessment Package"
        assert result["totalScreeningCount"] == 10
        assert result["usedScreeningCount"] == 3
        assert result["remainingScreeningCount"] == 7
        assert len(result["assessments"]) == 3
        assert result["bookingStatus"] == "CONFIRMED"
        
        # Verify database call
        mock_db.booking.find_first.assert_called_once_with(
            where={"id": "booking-1", "userId": "user-1"},
            include={
                "service": True,
                "postureAnalyses": {
                    "select": {
                        "id": True,
                        "analysisDate": True,
                        "status": True
                    },
                    "order": {"analysisDate": "desc"}
                }
            }
        )
    
    async def test_get_booking_screening_info_not_found(self, mock_db):
        """Test getting screening info when booking doesn't exist."""
        mock_db.booking.find_first = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Booking not found"):
            await BookingService.get_booking_screening_info("booking-999", "user-1")
    
    async def test_get_booking_screening_info_wrong_user(self, mock_db):
        """Test getting screening info with wrong user ID."""
        mock_db.booking.find_first = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Booking not found"):
            await BookingService.get_booking_screening_info("booking-1", "wrong-user")
        
        mock_db.booking.find_first.assert_called_once_with(
            where={"id": "booking-1", "userId": "wrong-user"},
            include={
                "service": True,
                "postureAnalyses": {
                    "select": {
                        "id": True,
                        "analysisDate": True,
                        "status": True
                    },
                    "order": {"analysisDate": "desc"}
                }
            }
        )
    
    async def test_get_booking_screening_info_no_assessments(self, mock_db):
        """Test getting screening info for booking with no assessments."""
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.totalScreeningCount = 5
        booking.usedScreeningCount = 0
        booking.remainingScreeningCount = 5
        booking.status = "CONFIRMED"
        booking.service = MagicMock(name="Basic Plan")
        booking.postureAnalyses = []
        
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        result = await BookingService.get_booking_screening_info("booking-1", "user-1")
        
        assert result["totalScreeningCount"] == 5
        assert result["usedScreeningCount"] == 0
        assert result["remainingScreeningCount"] == 5
        assert len(result["assessments"]) == 0
    
    async def test_get_booking_screening_info_all_counts_used(self, mock_db):
        """Test getting screening info when all counts are used."""
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        booking.totalScreeningCount = 3
        booking.usedScreeningCount = 3
        booking.remainingScreeningCount = 0
        booking.status = "COMPLETED"
        booking.service = MagicMock(name="Starter Plan")
        booking.postureAnalyses = [MagicMock(id=f"analysis-{i}") for i in range(3)]
        
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        result = await BookingService.get_booking_screening_info("booking-1", "user-1")
        
        assert result["totalScreeningCount"] == 3
        assert result["usedScreeningCount"] == 3
        assert result["remainingScreeningCount"] == 0
        assert len(result["assessments"]) == 3


@pytest.mark.asyncio
class TestGetBookingAssessments:
    """Tests for get_booking_assessments method."""
    
    async def test_get_booking_assessments_success(self, mock_db):
        """Test getting all assessments for a booking."""
        # Mock booking
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        # Mock posture analyses
        analysis1 = MagicMock()
        analysis1.id = "analysis-1"
        analysis1.bookingId = "booking-1"
        analysis1.analysisDate = datetime(2024, 12, 20, 10, 0, 0)
        analysis1.fhdPixels = 45.2
        analysis1.cervicalAngle = 35.5
        analysis1.status = "completed"
        
        analysis2 = MagicMock()
        analysis2.id = "analysis-2"
        analysis2.bookingId = "booking-1"
        analysis2.analysisDate = datetime(2024, 12, 22, 10, 0, 0)
        analysis2.fhdPixels = 42.8
        analysis2.cervicalAngle = 36.2
        analysis2.status = "completed"
        
        analysis3 = MagicMock()
        analysis3.id = "analysis-3"
        analysis3.bookingId = "booking-1"
        analysis3.analysisDate = datetime(2024, 12, 24, 10, 0, 0)
        analysis3.fhdPixels = 40.5
        analysis3.cervicalAngle = 37.0
        analysis3.status = "completed"
        
        # Sorted by date desc
        mock_db.postureanalysis.find_many = AsyncMock(return_value=[analysis3, analysis2, analysis1])
        
        result = await BookingService.get_booking_assessments("booking-1", "user-1")
        
        assert len(result) == 3
        assert result[0].id == "analysis-3"
        assert result[0].analysisDate == datetime(2024, 12, 24, 10, 0, 0)
        assert result[1].id == "analysis-2"
        assert result[2].id == "analysis-1"
        
        # Verify database calls
        mock_db.booking.find_first.assert_called_once_with(
            where={"id": "booking-1", "userId": "user-1"}
        )
        mock_db.postureanalysis.find_many.assert_called_once_with(
            where={"bookingId": "booking-1"},
            order={"analysisDate": "desc"}
        )
    
    async def test_get_booking_assessments_booking_not_found(self, mock_db):
        """Test getting assessments when booking doesn't exist."""
        mock_db.booking.find_first = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Booking not found"):
            await BookingService.get_booking_assessments("booking-999", "user-1")
        
        mock_db.booking.find_first.assert_called_once_with(
            where={"id": "booking-999", "userId": "user-1"}
        )
    
    async def test_get_booking_assessments_wrong_user(self, mock_db):
        """Test getting assessments with wrong user ID."""
        mock_db.booking.find_first = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Booking not found"):
            await BookingService.get_booking_assessments("booking-1", "wrong-user")
    
    async def test_get_booking_assessments_empty(self, mock_db):
        """Test getting assessments when booking has no assessments."""
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        mock_db.postureanalysis.find_many = AsyncMock(return_value=[])
        
        result = await BookingService.get_booking_assessments("booking-1", "user-1")
        
        assert result == []
    
    async def test_get_booking_assessments_single(self, mock_db):
        """Test getting assessments with single assessment."""
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        analysis = MagicMock()
        analysis.id = "analysis-1"
        analysis.bookingId = "booking-1"
        analysis.analysisDate = datetime(2024, 12, 20, 10, 0, 0)
        analysis.status = "completed"
        
        mock_db.postureanalysis.find_many = AsyncMock(return_value=[analysis])
        
        result = await BookingService.get_booking_assessments("booking-1", "user-1")
        
        assert len(result) == 1
        assert result[0].id == "analysis-1"
    
    async def test_get_booking_assessments_verifies_ownership(self, mock_db):
        """Test that method verifies booking ownership before returning assessments."""
        # First call: verify ownership (should succeed)
        booking = MagicMock()
        booking.id = "booking-1"
        booking.userId = "user-1"
        mock_db.booking.find_first = AsyncMock(return_value=booking)
        
        analysis = MagicMock()
        analysis.id = "analysis-1"
        mock_db.postureanalysis.find_many = AsyncMock(return_value=[analysis])
        
        result = await BookingService.get_booking_assessments("booking-1", "user-1")
        assert len(result) == 1
        
        # Second call: wrong user (should fail)
        mock_db.booking.find_first = AsyncMock(return_value=None)
        
        with pytest.raises(BadRequestException, match="Booking not found"):
            await BookingService.get_booking_assessments("booking-1", "wrong-user")
        
        # Verify postureanalysis.find_many was only called once (for successful case)
        assert mock_db.postureanalysis.find_many.call_count == 1
