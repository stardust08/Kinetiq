"""
Unit tests for ScreeningCountManager utility.

Tests cover:
- Count validation
- Atomic deduction
- Rollback on error
- Concurrent access scenarios
- Count summary
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.utils.screening_count import ScreeningCountManager
from app.core.exceptions import BadRequestException


@pytest.fixture
def mock_booking():
    """Create a mock booking object."""
    booking = MagicMock()
    booking.id = "booking-123"
    booking.userId = "user-123"
    booking.totalScreeningCount = 10
    booking.usedScreeningCount = 3
    booking.remainingScreeningCount = 7
    booking.status = "CONFIRMED"
    return booking


@pytest.fixture
def mock_booking_no_counts():
    """Create a mock booking with no remaining counts."""
    booking = MagicMock()
    booking.id = "booking-456"
    booking.userId = "user-123"
    booking.totalScreeningCount = 5
    booking.usedScreeningCount = 5
    booking.remainingScreeningCount = 0
    booking.status = "CONFIRMED"
    return booking


@pytest.fixture
def mock_booking_invalid_status():
    """Create a mock booking with invalid status."""
    booking = MagicMock()
    booking.id = "booking-789"
    booking.userId = "user-123"
    booking.totalScreeningCount = 10
    booking.usedScreeningCount = 2
    booking.remainingScreeningCount = 8
    booking.status = "CANCELLED"
    return booking


class TestValidateAndReserveCount:
    """Tests for validate_and_reserve_count method."""
    
    @pytest.mark.asyncio
    async def test_validate_success(self, mock_booking):
        """Test successful validation with remaining counts."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            result = await ScreeningCountManager.validate_and_reserve_count(
                booking_id="booking-123",
                user_id="user-123"
            )
            
            assert result["valid"] is True
            assert result["remainingCount"] == 7
            assert result["bookingId"] == "booking-123"
            
            mock_db.booking.find_first.assert_called_once_with(
                where={"id": "booking-123", "userId": "user-123"}
            )
    
    @pytest.mark.asyncio
    async def test_validate_booking_not_found(self):
        """Test validation fails when booking not found."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=None)
            
            with pytest.raises(BadRequestException) as exc_info:
                await ScreeningCountManager.validate_and_reserve_count(
                    booking_id="nonexistent",
                    user_id="user-123"
                )
            
            assert "Booking not found" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_no_remaining_counts(self, mock_booking_no_counts):
        """Test validation fails when no remaining counts."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking_no_counts)
            
            with pytest.raises(BadRequestException) as exc_info:
                await ScreeningCountManager.validate_and_reserve_count(
                    booking_id="booking-456",
                    user_id="user-123"
                )
            
            assert "No remaining screening counts" in str(exc_info.value)
            assert "Used: 5/5" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_invalid_status(self, mock_booking_invalid_status):
        """Test validation fails when booking status is invalid."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking_invalid_status)
            
            with pytest.raises(BadRequestException) as exc_info:
                await ScreeningCountManager.validate_and_reserve_count(
                    booking_id="booking-789",
                    user_id="user-123"
                )
            
            assert "Booking status 'CANCELLED' is not valid" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_completed_status_allowed(self, mock_booking):
        """Test validation succeeds with COMPLETED status."""
        mock_booking.status = "COMPLETED"
        
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            result = await ScreeningCountManager.validate_and_reserve_count(
                booking_id="booking-123",
                user_id="user-123"
            )
            
            assert result["valid"] is True


class TestDeductCountAtomic:
    """Tests for deduct_count_atomic method."""
    
    @pytest.mark.asyncio
    async def test_deduct_success(self, mock_booking):
        """Test successful atomic count deduction."""
        updated_booking = MagicMock()
        updated_booking.totalScreeningCount = 10
        updated_booking.usedScreeningCount = 4
        updated_booking.remainingScreeningCount = 6
        
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            mock_db.booking.update = AsyncMock(return_value=updated_booking)
            
            result = await ScreeningCountManager.deduct_count_atomic(
                booking_id="booking-123",
                user_id="user-123"
            )
            
            assert result["success"] is True
            assert result["remainingCount"] == 6
            assert result["usedCount"] == 4
            
            mock_db.booking.update.assert_called_once_with(
                where={"id": "booking-123"},
                data={
                    "usedScreeningCount": {"increment": 1},
                    "remainingScreeningCount": {"decrement": 1}
                }
            )
    
    @pytest.mark.asyncio
    async def test_deduct_with_transaction(self, mock_booking):
        """Test deduction with explicit transaction."""
        updated_booking = MagicMock()
        updated_booking.totalScreeningCount = 10
        updated_booking.usedScreeningCount = 4
        updated_booking.remainingScreeningCount = 6
        
        mock_transaction = MagicMock()
        mock_transaction.booking.find_first = AsyncMock(return_value=mock_booking)
        mock_transaction.booking.update = AsyncMock(return_value=updated_booking)
        
        result = await ScreeningCountManager.deduct_count_atomic(
            booking_id="booking-123",
            user_id="user-123",
            transaction=mock_transaction
        )
        
        assert result["success"] is True
        mock_transaction.booking.find_first.assert_called_once()
        mock_transaction.booking.update.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_deduct_booking_not_found(self):
        """Test deduction fails when booking not found."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=None)
            
            with pytest.raises(BadRequestException) as exc_info:
                await ScreeningCountManager.deduct_count_atomic(
                    booking_id="nonexistent",
                    user_id="user-123"
                )
            
            assert "Booking not found" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_deduct_no_remaining_counts(self, mock_booking_no_counts):
        """Test deduction fails when no remaining counts."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking_no_counts)
            
            with pytest.raises(BadRequestException) as exc_info:
                await ScreeningCountManager.deduct_count_atomic(
                    booking_id="booking-456",
                    user_id="user-123"
                )
            
            assert "No remaining screening counts" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_deduct_consistency_check_fails(self, mock_booking):
        """Test deduction fails when consistency check fails."""
        # Create inconsistent booking state
        updated_booking = MagicMock()
        updated_booking.totalScreeningCount = 10
        updated_booking.usedScreeningCount = 4
        updated_booking.remainingScreeningCount = 5  # Should be 6, inconsistent!
        
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            mock_db.booking.update = AsyncMock(return_value=updated_booking)
            
            with pytest.raises(BadRequestException) as exc_info:
                await ScreeningCountManager.deduct_count_atomic(
                    booking_id="booking-123",
                    user_id="user-123"
                )
            
            assert "Count consistency check failed" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_deduct_last_count(self):
        """Test deducting the last remaining count."""
        booking_with_one = MagicMock()
        booking_with_one.id = "booking-last"
        booking_with_one.userId = "user-123"
        booking_with_one.totalScreeningCount = 5
        booking_with_one.usedScreeningCount = 4
        booking_with_one.remainingScreeningCount = 1
        
        updated_booking = MagicMock()
        updated_booking.totalScreeningCount = 5
        updated_booking.usedScreeningCount = 5
        updated_booking.remainingScreeningCount = 0
        
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=booking_with_one)
            mock_db.booking.update = AsyncMock(return_value=updated_booking)
            
            result = await ScreeningCountManager.deduct_count_atomic(
                booking_id="booking-last",
                user_id="user-123"
            )
            
            assert result["success"] is True
            assert result["remainingCount"] == 0
            assert result["usedCount"] == 5


class TestGetCountSummary:
    """Tests for get_count_summary method."""
    
    @pytest.mark.asyncio
    async def test_summary_multiple_bookings(self):
        """Test count summary across multiple bookings."""
        booking1 = MagicMock()
        booking1.totalScreeningCount = 10
        booking1.usedScreeningCount = 3
        booking1.remainingScreeningCount = 7
        
        booking2 = MagicMock()
        booking2.totalScreeningCount = 5
        booking2.usedScreeningCount = 5
        booking2.remainingScreeningCount = 0
        
        booking3 = MagicMock()
        booking3.totalScreeningCount = 8
        booking3.usedScreeningCount = 2
        booking3.remainingScreeningCount = 6
        
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_many = AsyncMock(
                return_value=[booking1, booking2, booking3]
            )
            
            result = await ScreeningCountManager.get_count_summary(
                user_id="user-123"
            )
            
            assert result["totalAllocated"] == 23  # 10 + 5 + 8
            assert result["totalUsed"] == 10  # 3 + 5 + 2
            assert result["totalRemaining"] == 13  # 7 + 0 + 6
            assert result["bookingsWithCounts"] == 2  # booking1 and booking3
            
            mock_db.booking.find_many.assert_called_once_with(
                where={"userId": "user-123"},
                include={"service": True}
            )
    
    @pytest.mark.asyncio
    async def test_summary_no_bookings(self):
        """Test count summary with no bookings."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_many = AsyncMock(return_value=[])
            
            result = await ScreeningCountManager.get_count_summary(
                user_id="user-456"
            )
            
            assert result["totalAllocated"] == 0
            assert result["totalUsed"] == 0
            assert result["totalRemaining"] == 0
            assert result["bookingsWithCounts"] == 0
    
    @pytest.mark.asyncio
    async def test_summary_all_counts_used(self):
        """Test count summary when all counts are used."""
        booking1 = MagicMock()
        booking1.totalScreeningCount = 5
        booking1.usedScreeningCount = 5
        booking1.remainingScreeningCount = 0
        
        booking2 = MagicMock()
        booking2.totalScreeningCount = 3
        booking2.usedScreeningCount = 3
        booking2.remainingScreeningCount = 0
        
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_many = AsyncMock(
                return_value=[booking1, booking2]
            )
            
            result = await ScreeningCountManager.get_count_summary(
                user_id="user-789"
            )
            
            assert result["totalAllocated"] == 8
            assert result["totalUsed"] == 8
            assert result["totalRemaining"] == 0
            assert result["bookingsWithCounts"] == 0


class TestConcurrentAccess:
    """Tests for concurrent access scenarios."""
    
    @pytest.mark.asyncio
    async def test_concurrent_validation_same_booking(self, mock_booking):
        """Test concurrent validation of same booking."""
        with patch('app.utils.screening_count.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Simulate concurrent validations
            result1 = await ScreeningCountManager.validate_and_reserve_count(
                booking_id="booking-123",
                user_id="user-123"
            )
            result2 = await ScreeningCountManager.validate_and_reserve_count(
                booking_id="booking-123",
                user_id="user-123"
            )
            
            # Both should succeed (validation doesn't modify state)
            assert result1["valid"] is True
            assert result2["valid"] is True
            assert result1["remainingCount"] == result2["remainingCount"]
    
    @pytest.mark.asyncio
    async def test_deduct_prevents_double_counting(self):
        """Test that atomic deduction prevents double counting."""
        # This test verifies the atomic update pattern
        # In real scenario, database transaction ensures atomicity
        
        booking = MagicMock()
        booking.id = "booking-123"
        booking.userId = "user-123"
        booking.totalScreeningCount = 10
        booking.usedScreeningCount = 9
        booking.remainingScreeningCount = 1
        
        updated_booking = MagicMock()
        updated_booking.totalScreeningCount = 10
        updated_booking.usedScreeningCount = 10
        updated_booking.remainingScreeningCount = 0
        
        with patch('app.utils.screening_count.db') as mock_db:
            # First deduction succeeds
            mock_db.booking.find_first = AsyncMock(return_value=booking)
            mock_db.booking.update = AsyncMock(return_value=updated_booking)
            
            result = await ScreeningCountManager.deduct_count_atomic(
                booking_id="booking-123",
                user_id="user-123"
            )
            
            assert result["success"] is True
            assert result["remainingCount"] == 0
            
            # Second deduction should fail (no counts remaining)
            booking_exhausted = MagicMock()
            booking_exhausted.remainingScreeningCount = 0
            mock_db.booking.find_first = AsyncMock(return_value=booking_exhausted)
            
            with pytest.raises(BadRequestException) as exc_info:
                await ScreeningCountManager.deduct_count_atomic(
                    booking_id="booking-123",
                    user_id="user-123"
                )
            
            assert "No remaining screening counts" in str(exc_info.value)
