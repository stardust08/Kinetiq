"""
Unit tests for the screening count population script.

Tests cover:
- Booking selection logic
- Screening count calculation
- Edge case handling (null values, missing services)
- Consistency verification
- Error handling
"""
import pytest
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from scripts.populate_screening_counts import ScreeningCountPopulator


class TestScreeningCountCalculation:
    """Test screening count calculation logic."""
    
    def test_calculate_with_valid_service(self):
        """Test calculation with valid service and screening count."""
        # Create mock booking with service
        booking = MagicMock()
        booking.id = "booking-1"
        booking.service = MagicMock()
        booking.service.id = "service-1"
        booking.service.name = "Test Service"
        booking.service.includedScreeningCount = 5
        
        # Create populator
        db = AsyncMock()
        populator = ScreeningCountPopulator(db=db, dry_run=True)
        
        # Calculate counts
        total, used, remaining = populator.calculate_screening_counts(booking)
        
        # Verify
        assert total == 5
        assert used == 0
        assert remaining == 5
    
    def test_calculate_with_null_screening_count(self):
        """Test calculation when service has null screening count."""
        # Create mock booking with service but null screening count
        booking = MagicMock()
        booking.id = "booking-1"
        booking.service = MagicMock()
        booking.service.id = "service-1"
        booking.service.name = "Test Service"
        booking.service.includedScreeningCount = None
        
        # Create populator
        db = AsyncMock()
        populator = ScreeningCountPopulator(db=db, dry_run=True)
        
        # Calculate counts
        total, used, remaining = populator.calculate_screening_counts(booking)
        
        # Verify - should return zeros
        assert total == 0
        assert used == 0
        assert remaining == 0
        assert populator.stats["no_screening_count"] == 1
    
    def test_calculate_with_missing_service(self):
        """Test calculation when booking has no service."""
        # Create mock booking without service
        booking = MagicMock()
        booking.id = "booking-1"
        booking.service = None
        
        # Create populator
        db = AsyncMock()
        populator = ScreeningCountPopulator(db=db, dry_run=True)
        
        # Calculate counts
        total, used, remaining = populator.calculate_screening_counts(booking)
        
        # Verify - should return zeros
        assert total == 0
        assert used == 0
        assert remaining == 0
        assert populator.stats["no_service"] == 1
    
    def test_calculate_with_zero_screening_count(self):
        """Test calculation when service has zero screening count."""
        # Create mock booking with service having 0 screening count
        booking = MagicMock()
        booking.id = "booking-1"
        booking.service = MagicMock()
        booking.service.id = "service-1"
        booking.service.name = "Test Service"
        booking.service.includedScreeningCount = 0
        
        # Create populator
        db = AsyncMock()
        populator = ScreeningCountPopulator(db=db, dry_run=True)
        
        # Calculate counts
        total, used, remaining = populator.calculate_screening_counts(booking)
        
        # Verify
        assert total == 0
        assert used == 0
        assert remaining == 0


class TestBookingUpdate:
    """Test booking update logic."""
    
    @pytest.mark.asyncio
    async def test_update_booking_dry_run(self):
        """Test booking update in dry run mode."""
        # Create mock booking
        booking = MagicMock()
        booking.id = "booking-1"
        
        # Create populator in dry run mode
        db = AsyncMock()
        populator = ScreeningCountPopulator(db=db, dry_run=True)
        
        # Update booking
        success = await populator.update_booking_screening_counts(
            booking, total=5, used=0, remaining=5
        )
        
        # Verify - should succeed but not call database
        assert success is True
        db.booking.update.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_update_booking_live(self):
        """Test booking update in live mode."""
        # Create mock booking
        booking = MagicMock()
        booking.id = "booking-1"
        
        # Create populator in live mode
        db = AsyncMock()
        db.booking.update = AsyncMock(return_value=booking)
        populator = ScreeningCountPopulator(db=db, dry_run=False)
        
        # Update booking
        success = await populator.update_booking_screening_counts(
            booking, total=5, used=0, remaining=5
        )
        
        # Verify - should succeed and call database
        assert success is True
        db.booking.update.assert_called_once_with(
            where={"id": "booking-1"},
            data={
                "totalScreeningCount": 5,
                "usedScreeningCount": 0,
                "remainingScreeningCount": 5
            }
        )
    
    @pytest.mark.asyncio
    async def test_update_booking_error_handling(self):
        """Test error handling during booking update."""
        # Create mock booking
        booking = MagicMock()
        booking.id = "booking-1"
        
        # Create populator with database that raises error
        db = AsyncMock()
        db.booking.update = AsyncMock(side_effect=Exception("Database error"))
        populator = ScreeningCountPopulator(db=db, dry_run=False)
        
        # Update booking
        success = await populator.update_booking_screening_counts(
            booking, total=5, used=0, remaining=5
        )
        
        # Verify - should fail gracefully
        assert success is False
        assert populator.stats["errors"] == 1


class TestConsistencyVerification:
    """Test consistency verification logic."""
    
    @pytest.mark.asyncio
    async def test_verify_consistent_bookings(self):
        """Test verification with consistent bookings."""
        # Create mock bookings with consistent counts
        bookings = [
            MagicMock(
                id="booking-1",
                totalScreeningCount=5,
                usedScreeningCount=2,
                remainingScreeningCount=3
            ),
            MagicMock(
                id="booking-2",
                totalScreeningCount=10,
                usedScreeningCount=0,
                remainingScreeningCount=10
            )
        ]
        
        # Create populator
        db = AsyncMock()
        db.booking.find_many = AsyncMock(return_value=bookings)
        populator = ScreeningCountPopulator(db=db, dry_run=False)
        
        # Verify consistency
        is_consistent = await populator.verify_consistency()
        
        # Should pass
        assert is_consistent is True
    
    @pytest.mark.asyncio
    async def test_verify_inconsistent_bookings(self):
        """Test verification with inconsistent bookings."""
        # Create mock bookings with inconsistent counts
        bookings = [
            MagicMock(
                id="booking-1",
                totalScreeningCount=5,
                usedScreeningCount=2,
                remainingScreeningCount=2  # Should be 3
            ),
            MagicMock(
                id="booking-2",
                totalScreeningCount=10,
                usedScreeningCount=5,
                remainingScreeningCount=10  # Should be 5
            )
        ]
        
        # Create populator
        db = AsyncMock()
        db.booking.find_many = AsyncMock(return_value=bookings)
        populator = ScreeningCountPopulator(db=db, dry_run=False)
        
        # Verify consistency
        is_consistent = await populator.verify_consistency()
        
        # Should fail
        assert is_consistent is False


class TestPopulationFlow:
    """Test complete population flow."""
    
    @pytest.mark.asyncio
    async def test_populate_no_bookings(self):
        """Test population when no bookings need update."""
        # Create populator with no bookings
        db = AsyncMock()
        db.booking.find_many = AsyncMock(return_value=[])
        populator = ScreeningCountPopulator(db=db, dry_run=False)
        
        # Run population
        success = await populator.populate()
        
        # Should succeed with no updates
        assert success is True
        assert populator.stats["total_bookings"] == 0
        assert populator.stats["updated"] == 0
    
    @pytest.mark.asyncio
    async def test_populate_with_bookings(self):
        """Test population with bookings needing update."""
        # Create mock bookings
        bookings = [
            MagicMock(
                id="booking-1",
                service=MagicMock(
                    id="service-1",
                    name="Service 1",
                    includedScreeningCount=5
                )
            ),
            MagicMock(
                id="booking-2",
                service=MagicMock(
                    id="service-2",
                    name="Service 2",
                    includedScreeningCount=10
                )
            )
        ]
        
        # Create populator
        db = AsyncMock()
        db.booking.find_many = AsyncMock(return_value=bookings)
        db.booking.update = AsyncMock()
        populator = ScreeningCountPopulator(db=db, dry_run=False)
        
        # Run population
        success = await populator.populate()
        
        # Should succeed and update both bookings
        assert success is True
        assert populator.stats["total_bookings"] == 2
        assert populator.stats["updated"] == 2
        assert db.booking.update.call_count == 2
    
    @pytest.mark.asyncio
    async def test_populate_with_mixed_scenarios(self):
        """Test population with various edge cases."""
        # Create mock bookings with different scenarios
        bookings = [
            # Valid booking with screening count
            MagicMock(
                id="booking-1",
                service=MagicMock(
                    id="service-1",
                    name="Service 1",
                    includedScreeningCount=5
                )
            ),
            # Booking with null screening count
            MagicMock(
                id="booking-2",
                service=MagicMock(
                    id="service-2",
                    name="Service 2",
                    includedScreeningCount=None
                )
            ),
            # Booking with no service
            MagicMock(
                id="booking-3",
                service=None
            )
        ]
        
        # Create populator
        db = AsyncMock()
        db.booking.find_many = AsyncMock(return_value=bookings)
        db.booking.update = AsyncMock()
        populator = ScreeningCountPopulator(db=db, dry_run=False)
        
        # Run population
        success = await populator.populate()
        
        # Should succeed and handle all scenarios
        assert success is True
        assert populator.stats["total_bookings"] == 3
        assert populator.stats["updated"] == 3
        assert populator.stats["no_screening_count"] == 1
        assert populator.stats["no_service"] == 1


class TestStatistics:
    """Test statistics tracking."""
    
    def test_initial_stats(self):
        """Test initial statistics are zero."""
        db = AsyncMock()
        populator = ScreeningCountPopulator(db=db)
        
        assert populator.stats["total_bookings"] == 0
        assert populator.stats["already_populated"] == 0
        assert populator.stats["updated"] == 0
        assert populator.stats["no_service"] == 0
        assert populator.stats["no_screening_count"] == 0
        assert populator.stats["errors"] == 0
    
    def test_stats_increment(self):
        """Test statistics increment correctly."""
        db = AsyncMock()
        populator = ScreeningCountPopulator(db=db)
        
        # Simulate various scenarios
        booking_no_service = MagicMock(id="b1", service=None)
        populator.calculate_screening_counts(booking_no_service)
        
        booking_no_count = MagicMock(
            id="b2",
            service=MagicMock(includedScreeningCount=None)
        )
        populator.calculate_screening_counts(booking_no_count)
        
        # Verify stats
        assert populator.stats["no_service"] == 1
        assert populator.stats["no_screening_count"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
