"""
Unit tests for PaymentService.

Tests the payment service layer business logic including:
- Initiating payments with mock payment gateway
- Payment verification
- Remaining payment processing
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.api.payment.service import PaymentService
from app.core.exceptions import NotFoundException


@pytest.fixture
def mock_db(monkeypatch):
    """Mock database client."""
    mock = MagicMock()
    monkeypatch.setattr("app.api.payment.service.db", mock)
    return mock


@pytest.fixture
def sample_payment_pending():
    """Sample payment record in PENDING status."""
    payment = MagicMock()
    payment.id = "payment-1"
    payment.userId = "user-1"
    payment.totalAmount = 399.0
    payment.paidAmount = 399.0
    payment.remainingAmount = 0.0
    payment.status = "PENDING"
    payment.transactionId = None
    return payment


@pytest.fixture
def sample_payment_partial():
    """Sample payment record with partial payment."""
    payment = MagicMock()
    payment.id = "payment-2"
    payment.userId = "user-2"
    payment.totalAmount = 500.0
    payment.paidAmount = 200.0
    payment.remainingAmount = 300.0
    payment.status = "PENDING"
    payment.transactionId = None
    return payment


@pytest.mark.asyncio
class TestInitiatePayment:
    """Tests for initiate_payment method."""
    
    async def test_initiate_payment_success(self, mock_db, sample_payment_pending):
        """Test successful payment initiation."""
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_pending)
        
        result = await PaymentService.initiate_payment("payment-1")
        
        # Verify result structure
        assert "paymentId" in result
        assert "amount" in result
        assert "transactionId" in result
        assert "gatewayUrl" in result
        
        # Verify values
        assert result["paymentId"] == "payment-1"
        assert result["amount"] == 399.0
        assert result["gatewayUrl"] == "https://mock-gateway.com/pay"
        
        # Verify transaction ID format
        assert result["transactionId"].startswith("TXN_")
        assert len(result["transactionId"]) == 16  # TXN_ + 12 hex chars
        
        # Verify database call
        mock_db.payment.find_unique.assert_called_once_with(where={"id": "payment-1"})
    
    async def test_initiate_payment_partial(self, mock_db, sample_payment_partial):
        """Test payment initiation with partial payment amount."""
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_partial)
        
        result = await PaymentService.initiate_payment("payment-2")
        
        # Verify amount is the paidAmount (advance payment)
        assert result["paymentId"] == "payment-2"
        assert result["amount"] == 200.0
        assert result["transactionId"].startswith("TXN_")
        assert result["gatewayUrl"] == "https://mock-gateway.com/pay"
    
    async def test_initiate_payment_not_found(self, mock_db):
        """Test payment initiation when payment record doesn't exist."""
        mock_db.payment.find_unique = AsyncMock(return_value=None)
        
        with pytest.raises(NotFoundException, match="Payment with id payment-999 not found"):
            await PaymentService.initiate_payment("payment-999")
        
        mock_db.payment.find_unique.assert_called_once_with(where={"id": "payment-999"})
    
    async def test_initiate_payment_unique_transaction_ids(self, mock_db, sample_payment_pending):
        """Test that multiple payment initiations generate unique transaction IDs."""
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_pending)
        
        # Initiate payment multiple times
        result1 = await PaymentService.initiate_payment("payment-1")
        result2 = await PaymentService.initiate_payment("payment-1")
        result3 = await PaymentService.initiate_payment("payment-1")
        
        # Verify all transaction IDs are unique
        transaction_ids = {
            result1["transactionId"],
            result2["transactionId"],
            result3["transactionId"]
        }
        assert len(transaction_ids) == 3
        
        # Verify all have correct format
        for txn_id in transaction_ids:
            assert txn_id.startswith("TXN_")
            assert len(txn_id) == 16
    
    async def test_initiate_payment_zero_amount(self, mock_db):
        """Test payment initiation with zero amount."""
        payment = MagicMock()
        payment.id = "payment-3"
        payment.userId = "user-3"
        payment.totalAmount = 0.0
        payment.paidAmount = 0.0
        payment.remainingAmount = 0.0
        payment.status = "PENDING"
        
        mock_db.payment.find_unique = AsyncMock(return_value=payment)
        
        result = await PaymentService.initiate_payment("payment-3")
        
        # Should still work with zero amount
        assert result["paymentId"] == "payment-3"
        assert result["amount"] == 0.0
        assert result["transactionId"].startswith("TXN_")


@pytest.fixture
def sample_booking():
    """Sample booking record."""
    booking = MagicMock()
    booking.id = "booking-1"
    booking.userId = "user-1"
    booking.serviceId = "service-1"
    booking.paymentId = "payment-1"
    booking.status = "PENDING"
    return booking


@pytest.mark.asyncio
class TestVerifyPayment:
    """Tests for verify_payment method."""
    
    async def test_verify_payment_success_full_payment(self, mock_db, sample_payment_pending, sample_booking):
        """Test successful payment verification for full payment."""
        # Setup payment with bookings
        sample_payment_pending.bookings = [sample_booking]
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_pending)
        mock_db.payment.update = AsyncMock()
        mock_db.booking.update = AsyncMock()
        mock_db.cart.update = AsyncMock()

        result = await PaymentService.verify_payment("payment-1", "TXN_ABC123", "success")

        # Verify result
        assert result["success"] is True
        assert result["message"] == "Payment verified"

        # Verify payment was updated to COMPLETED (remainingAmount is 0)
        mock_db.payment.update.assert_called_once()
        payment_update_call = mock_db.payment.update.call_args
        assert payment_update_call[1]["where"] == {"id": "payment-1"}
        assert payment_update_call[1]["data"]["status"] == "COMPLETED"
        assert payment_update_call[1]["data"]["transactionId"] == "TXN_ABC123"
        assert payment_update_call[1]["data"]["completedAt"] is not None

        # Verify booking was updated to CONFIRMED
        mock_db.booking.update.assert_called_once_with(
            where={"id": "booking-1"},
            data={"status": "CONFIRMED"}
        )

        # Verify cart was cleared
        mock_db.cart.update.assert_called_once_with(
            where={"userId": "user-1"},
            data={"items": [], "cartValue": 0}
        )

    async def test_verify_payment_success_partial_payment(self, mock_db, sample_payment_partial, sample_booking):
        """Test successful payment verification for partial payment."""
        # Setup payment with bookings
        sample_payment_partial.bookings = [sample_booking]
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_partial)
        mock_db.payment.update = AsyncMock()
        mock_db.booking.update = AsyncMock()
        mock_db.cart.update = AsyncMock()

        result = await PaymentService.verify_payment("payment-2", "TXN_XYZ789", "success")

        # Verify result
        assert result["success"] is True
        assert result["message"] == "Payment verified"

        # Verify payment was updated to PARTIAL (remainingAmount > 0)
        payment_update_call = mock_db.payment.update.call_args
        assert payment_update_call[1]["where"] == {"id": "payment-2"}
        assert payment_update_call[1]["data"]["status"] == "PARTIAL"
        assert payment_update_call[1]["data"]["transactionId"] == "TXN_XYZ789"
        assert payment_update_call[1]["data"]["completedAt"] is None  # Not completed yet

        # Verify booking was updated to CONFIRMED
        mock_db.booking.update.assert_called_once()

        # Verify cart was cleared
        mock_db.cart.update.assert_called_once()

    async def test_verify_payment_multiple_bookings(self, mock_db, sample_payment_pending):
        """Test payment verification with multiple bookings."""
        # Create multiple bookings
        booking1 = MagicMock()
        booking1.id = "booking-1"
        booking2 = MagicMock()
        booking2.id = "booking-2"
        booking3 = MagicMock()
        booking3.id = "booking-3"

        sample_payment_pending.bookings = [booking1, booking2, booking3]
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_pending)
        mock_db.payment.update = AsyncMock()
        mock_db.booking.update = AsyncMock()
        mock_db.cart.update = AsyncMock()

        result = await PaymentService.verify_payment("payment-1", "TXN_MULTI", "success")

        # Verify result
        assert result["success"] is True

        # Verify all bookings were updated
        assert mock_db.booking.update.call_count == 3
        booking_update_calls = mock_db.booking.update.call_args_list
        assert booking_update_calls[0][1]["where"] == {"id": "booking-1"}
        assert booking_update_calls[1][1]["where"] == {"id": "booking-2"}
        assert booking_update_calls[2][1]["where"] == {"id": "booking-3"}
        for call in booking_update_calls:
            assert call[1]["data"]["status"] == "CONFIRMED"

    async def test_verify_payment_failed(self, mock_db, sample_payment_pending, sample_booking):
        """Test payment verification when payment fails."""
        sample_payment_pending.bookings = [sample_booking]
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_pending)
        mock_db.payment.update = AsyncMock()
        mock_db.booking.update = AsyncMock()
        mock_db.cart.update = AsyncMock()

        result = await PaymentService.verify_payment("payment-1", "TXN_FAILED", "failed")

        # Verify result
        assert result["success"] is False
        assert result["message"] == "Payment failed"

        # Verify payment was updated to FAILED
        mock_db.payment.update.assert_called_once_with(
            where={"id": "payment-1"},
            data={"status": "FAILED"}
        )

        # Verify bookings were NOT updated
        mock_db.booking.update.assert_not_called()

        # Verify cart was NOT cleared
        mock_db.cart.update.assert_not_called()

    async def test_verify_payment_not_found(self, mock_db):
        """Test payment verification when payment record doesn't exist."""
        mock_db.payment.find_unique = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Payment with id payment-999 not found"):
            await PaymentService.verify_payment("payment-999", "TXN_TEST", "success")

        mock_db.payment.find_unique.assert_called_once_with(
            where={"id": "payment-999"},
            include={"bookings": True}
        )

    async def test_verify_payment_no_bookings(self, mock_db, sample_payment_pending):
        """Test payment verification when payment has no bookings."""
        sample_payment_pending.bookings = []
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_pending)
        mock_db.payment.update = AsyncMock()
        mock_db.booking.update = AsyncMock()
        mock_db.cart.update = AsyncMock()

        result = await PaymentService.verify_payment("payment-1", "TXN_NOBOOKING", "success")

        # Verify result
        assert result["success"] is True

        # Verify payment was updated
        mock_db.payment.update.assert_called_once()

        # Verify no booking updates (since there are no bookings)
        mock_db.booking.update.assert_not_called()

        # Verify cart was still cleared
        mock_db.cart.update.assert_called_once()
@pytest.mark.asyncio
class TestPayRemainingAmount:
    """Tests for pay_remaining_amount method."""

    async def test_pay_remaining_amount_success(self, mock_db, sample_payment_partial):
        """Test successful remaining payment processing."""
        # Setup booking with remaining amount
        booking = MagicMock()
        booking.id = "booking-1"
        booking.totalAmount = 500.0
        booking.paidAmount = 200.0
        booking.remainingAmount = 300.0

        sample_payment_partial.bookings = [booking]
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_partial)

        # Mock updated payment
        updated_payment = MagicMock()
        updated_payment.id = "payment-2"
        updated_payment.userId = "user-2"
        updated_payment.totalAmount = 500.0
        updated_payment.paidAmount = 500.0
        updated_payment.remainingAmount = 0.0
        updated_payment.status = "COMPLETED"
        updated_payment.transactionId = "TXN_REMAINING"

        mock_db.payment.update = AsyncMock(return_value=updated_payment)
        mock_db.booking.update = AsyncMock()

        result = await PaymentService.pay_remaining_amount("payment-2", "TXN_REMAINING")

        # Verify result
        assert result["success"] is True
        assert result["message"] == "Remaining payment completed"
        assert result["payment"] == updated_payment

        # Verify payment was updated correctly
        payment_update_call = mock_db.payment.update.call_args
        assert payment_update_call[1]["where"] == {"id": "payment-2"}
        assert payment_update_call[1]["data"]["paidAmount"] == 500.0
        assert payment_update_call[1]["data"]["remainingAmount"] == 0
        assert payment_update_call[1]["data"]["status"] == "COMPLETED"
        assert payment_update_call[1]["data"]["transactionId"] == "TXN_REMAINING"
        assert payment_update_call[1]["data"]["completedAt"] is not None

        # Verify booking was updated
        mock_db.booking.update.assert_called_once_with(
            where={"id": "booking-1"},
            data={
                "paidAmount": 500.0,
                "remainingAmount": 0
            }
        )

    async def test_pay_remaining_amount_multiple_bookings(self, mock_db):
        """Test remaining payment with multiple bookings."""
        # Create payment with multiple bookings
        payment = MagicMock()
        payment.id = "payment-3"
        payment.userId = "user-3"
        payment.totalAmount = 1000.0
        payment.paidAmount = 400.0
        payment.remainingAmount = 600.0
        payment.status = "PARTIAL"

        booking1 = MagicMock()
        booking1.id = "booking-1"
        booking1.totalAmount = 500.0
        booking1.paidAmount = 200.0
        booking1.remainingAmount = 300.0

        booking2 = MagicMock()
        booking2.id = "booking-2"
        booking2.totalAmount = 500.0
        booking2.paidAmount = 200.0
        booking2.remainingAmount = 300.0

        payment.bookings = [booking1, booking2]
        mock_db.payment.find_unique = AsyncMock(return_value=payment)

        updated_payment = MagicMock()
        updated_payment.id = "payment-3"
        updated_payment.totalAmount = 1000.0
        updated_payment.paidAmount = 1000.0
        updated_payment.remainingAmount = 0.0
        updated_payment.status = "COMPLETED"

        mock_db.payment.update = AsyncMock(return_value=updated_payment)
        mock_db.booking.update = AsyncMock()

        result = await PaymentService.pay_remaining_amount("payment-3", "TXN_MULTI_REMAIN")

        # Verify result
        assert result["success"] is True
        assert result["payment"].paidAmount == 1000.0
        assert result["payment"].remainingAmount == 0.0

        # Verify both bookings were updated
        assert mock_db.booking.update.call_count == 2
        booking_update_calls = mock_db.booking.update.call_args_list
        assert booking_update_calls[0][1]["where"] == {"id": "booking-1"}
        assert booking_update_calls[0][1]["data"]["paidAmount"] == 500.0
        assert booking_update_calls[0][1]["data"]["remainingAmount"] == 0
        assert booking_update_calls[1][1]["where"] == {"id": "booking-2"}
        assert booking_update_calls[1][1]["data"]["paidAmount"] == 500.0
        assert booking_update_calls[1][1]["data"]["remainingAmount"] == 0

    async def test_pay_remaining_amount_not_found(self, mock_db):
        """Test remaining payment when payment record doesn't exist."""
        mock_db.payment.find_unique = AsyncMock(return_value=None)

        with pytest.raises(NotFoundException, match="Payment with id payment-999 not found"):
            await PaymentService.pay_remaining_amount("payment-999", "TXN_TEST")

        mock_db.payment.find_unique.assert_called_once_with(
            where={"id": "payment-999"},
            include={"bookings": True}
        )

    async def test_pay_remaining_amount_no_remaining(self, mock_db, sample_payment_pending):
        """Test remaining payment when there's no remaining amount."""
        from app.core.exceptions import BadRequestException

        sample_payment_pending.bookings = []
        mock_db.payment.find_unique = AsyncMock(return_value=sample_payment_pending)

        with pytest.raises(BadRequestException, match="No remaining amount to pay for this payment"):
            await PaymentService.pay_remaining_amount("payment-1", "TXN_TEST")

        # Verify payment was fetched but not updated
        mock_db.payment.find_unique.assert_called_once()

    async def test_pay_remaining_amount_already_completed(self, mock_db):
        """Test remaining payment when payment is already completed."""
        from app.core.exceptions import BadRequestException

        payment = MagicMock()
        payment.id = "payment-4"
        payment.userId = "user-4"
        payment.totalAmount = 500.0
        payment.paidAmount = 500.0
        payment.remainingAmount = 0.0
        payment.status = "COMPLETED"
        payment.bookings = []

        mock_db.payment.find_unique = AsyncMock(return_value=payment)

        with pytest.raises(BadRequestException, match="No remaining amount to pay for this payment"):
            await PaymentService.pay_remaining_amount("payment-4", "TXN_TEST")

    async def test_pay_remaining_amount_negative_remaining(self, mock_db):
        """Test remaining payment with negative remaining amount (edge case)."""
        from app.core.exceptions import BadRequestException

        payment = MagicMock()
        payment.id = "payment-5"
        payment.userId = "user-5"
        payment.totalAmount = 500.0
        payment.paidAmount = 600.0
        payment.remainingAmount = -100.0
        payment.status = "PARTIAL"
        payment.bookings = []

        mock_db.payment.find_unique = AsyncMock(return_value=payment)

        with pytest.raises(BadRequestException, match="No remaining amount to pay for this payment"):
            await PaymentService.pay_remaining_amount("payment-5", "TXN_TEST")
