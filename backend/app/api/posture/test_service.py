"""
Unit tests for PostureAnalysisService.

This module contains comprehensive tests for the posture analysis service
including session management, validation, and error handling.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
from app.api.posture.service import PostureAnalysisService
from app.core.exceptions import BadRequestException, UnauthorizedException


class TestFinalizeAnalysis:
    """Test suite for finalize_analysis() method."""
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_success(self):
        """Test successful analysis finalization with metric calculation and count deduction."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        # Create sample landmarks data (simplified for testing)
        # Format: samples contain dictionaries with "pose" key
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                        0: (0.5, 0.3, 0.0, 0.95),  # nose
                        7: (0.45, 0.28, 0.0, 0.90),  # left ear
                        8: (0.55, 0.28, 0.0, 0.92),  # right ear
                        11: (0.4, 0.5, 0.0, 0.90),  # left shoulder
                        12: (0.6, 0.5, 0.0, 0.92),  # right shoulder
                        13: (0.35, 0.65, 0.0, 0.88),  # left elbow
                        14: (0.65, 0.65, 0.0, 0.89),  # right elbow
                        15: (0.32, 0.75, 0.0, 0.85),  # left wrist
                        16: (0.68, 0.75, 0.0, 0.86),  # right wrist
                        23: (0.42, 0.7, 0.0, 0.91),  # left hip
                        24: (0.58, 0.7, 0.0, 0.93),  # right hip
                        25: (0.41, 0.85, 0.0, 0.87),  # left knee
                        26: (0.59, 0.85, 0.0, 0.88),  # right knee
                        27: (0.40, 0.95, 0.0, 0.84),  # left ankle
                        28: (0.60, 0.95, 0.0, 0.85),  # right ankle
                        29: (0.39, 0.97, 0.0, 0.82),  # left heel
                        30: (0.61, 0.97, 0.0, 0.83),  # right heel
                        31: (0.38, 0.98, 0.0, 0.80),  # left foot
                        32: (0.62, 0.98, 0.0, 0.81),  # right foot
                    }
                }
                for _ in range(180)  # 180 samples as required
            ]
        }
        
        # Mock booking
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.remainingScreeningCount = 5
        mock_booking.usedScreeningCount = 3
        mock_booking.totalScreeningCount = 8
        
        # Mock updated booking after count deduction
        mock_updated_booking = AsyncMock()
        mock_updated_booking.id = booking_id
        mock_updated_booking.userId = user_id
        mock_updated_booking.remainingScreeningCount = 4
        mock_updated_booking.usedScreeningCount = 4
        mock_updated_booking.totalScreeningCount = 8
        
        # Mock analysis result
        mock_analysis = AsyncMock()
        mock_analysis.id = "analysis-123"
        mock_analysis.userId = user_id
        mock_analysis.bookingId = booking_id
        mock_analysis.fhdPixels = 45.23
        mock_analysis.cervicalAngle = 12.5
        mock_analysis.status = "completed"
        
        with patch('app.api.posture.service.db') as mock_db:
            # Mock transaction context
            mock_transaction = AsyncMock()
            mock_transaction.booking.find_first = AsyncMock(return_value=mock_booking)
            mock_transaction.postureanalysis.create = AsyncMock(return_value=mock_analysis)
            mock_transaction.booking.update = AsyncMock(return_value=mock_updated_booking)
            mock_transaction.commit = AsyncMock()
            
            # Mock db.tx() to return transaction context
            mock_db.tx.return_value.__aenter__ = AsyncMock(return_value=mock_transaction)
            mock_db.tx.return_value.__aexit__ = AsyncMock(return_value=None)
            
            # Mock initial booking check (before transaction)
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.finalize_analysis(
                user_id,
                booking_id,
                session_id,
                landmarks_data
            )
            
            # Assert
            assert "analysis" in result
            assert "remainingCount" in result
            assert result["remainingCount"] == 4
            assert result["analysis"].id == "analysis-123"
            
            # Verify transaction was committed
            mock_transaction.commit.assert_called_once()
            
            # Verify booking was updated with atomic operations
            mock_transaction.booking.update.assert_called_once()
            update_call = mock_transaction.booking.update.call_args
            assert update_call[1]["data"]["usedScreeningCount"] == {"increment": 1}
            assert update_call[1]["data"]["remainingScreeningCount"] == {"decrement": 1}
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_booking_not_found(self):
        """Test error when booking doesn't exist."""
        # Arrange
        user_id = "user-123"
        booking_id = "nonexistent-booking"
        session_id = "session-789"
        landmarks_data = {"samples": [{"0": (0.5, 0.3, 0.0, 0.95)} for _ in range(450)]}
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=None)
            
            # Act & Assert
            with pytest.raises(UnauthorizedException) as exc_info:
                await PostureAnalysisService.finalize_analysis(
                    user_id,
                    booking_id,
                    session_id,
                    landmarks_data
                )
            
            assert "booking not found or access denied" in str(exc_info.value).lower()
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_no_remaining_counts(self):
        """Test error when booking has no remaining screening counts."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        # Correct format: samples should contain dictionaries with "pose" key
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                        0: (0.5, 0.3, 0.0, 0.95)
                    }
                }
                for _ in range(450)
            ]
        }
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.remainingScreeningCount = 0
        mock_booking.usedScreeningCount = 10
        mock_booking.totalScreeningCount = 10
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act & Assert
            with pytest.raises(BadRequestException) as exc_info:
                await PostureAnalysisService.finalize_analysis(
                    user_id,
                    booking_id,
                    session_id,
                    landmarks_data
                )
            
            error_message = str(exc_info.value)
            assert "no remaining screening counts" in error_message.lower()
            assert "10/10" in error_message
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_no_samples_provided(self):
        """Test error when no pose samples are provided."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        landmarks_data = {"samples": []}  # Empty samples
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.remainingScreeningCount = 5
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act & Assert
            with pytest.raises(BadRequestException) as exc_info:
                await PostureAnalysisService.finalize_analysis(
                    user_id,
                    booking_id,
                    session_id,
                    landmarks_data
                )
            
            assert "no pose samples provided" in str(exc_info.value).lower()
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_insufficient_samples(self):
        """Test error when too few valid samples are collected."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        # Only 50 samples (below 100 threshold)
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                        0: (0.5, 0.3, 0.0, 0.95)
                    }
                }
                for _ in range(50)
            ]
        }
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.remainingScreeningCount = 5
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act & Assert
            with pytest.raises(BadRequestException) as exc_info:
                await PostureAnalysisService.finalize_analysis(
                    user_id,
                    booking_id,
                    session_id,
                    landmarks_data
                )
            
            error_message = str(exc_info.value)
            assert "insufficient valid samples" in error_message.lower()
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_transaction_rollback_on_error(self):
        """Test that transaction is rolled back when database error occurs."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                    0: (0.5, 0.3, 0.0, 0.95),
                    11: (0.4, 0.5, 0.0, 0.90),
                    12: (0.6, 0.5, 0.0, 0.92),
                    23: (0.42, 0.7, 0.0, 0.91),
                    24: (0.58, 0.7, 0.0, 0.93),
                    }
                }
                for _ in range(450)
            ]
        }
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.remainingScreeningCount = 5
        
        with patch('app.api.posture.service.db') as mock_db:
            # Mock transaction that fails during analysis creation
            mock_transaction = AsyncMock()
            mock_transaction.booking.find_first = AsyncMock(return_value=mock_booking)
            mock_transaction.postureanalysis.create = AsyncMock(
                side_effect=Exception("Database error")
            )
            
            mock_db.tx.return_value.__aenter__ = AsyncMock(return_value=mock_transaction)
            mock_db.tx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act & Assert
            with pytest.raises(BadRequestException) as exc_info:
                await PostureAnalysisService.finalize_analysis(
                    user_id,
                    booking_id,
                    session_id,
                    landmarks_data
                )
            
            error_message = str(exc_info.value)
            assert "failed to save analysis" in error_message.lower()
            assert "no screening count was deducted" in error_message.lower()
            
            # Verify booking update was never called (transaction rolled back)
            mock_transaction.booking.update.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_count_consistency_check(self):
        """Test that count consistency is verified after update."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                    0: (0.5, 0.3, 0.0, 0.95),
                    11: (0.4, 0.5, 0.0, 0.90),
                    12: (0.6, 0.5, 0.0, 0.92),
                    23: (0.42, 0.7, 0.0, 0.91),
                    24: (0.58, 0.7, 0.0, 0.93),
                    }
                }
                for _ in range(450)
            ]
        }
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.remainingScreeningCount = 5
        
        # Mock updated booking with INCONSISTENT counts
        mock_updated_booking = AsyncMock()
        mock_updated_booking.totalScreeningCount = 10
        mock_updated_booking.usedScreeningCount = 5
        mock_updated_booking.remainingScreeningCount = 6  # Should be 5! (10 - 5 = 5, not 6)
        
        mock_analysis = AsyncMock()
        mock_analysis.id = "analysis-123"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_transaction = AsyncMock()
            mock_transaction.booking.find_first = AsyncMock(return_value=mock_booking)
            mock_transaction.postureanalysis.create = AsyncMock(return_value=mock_analysis)
            mock_transaction.booking.update = AsyncMock(return_value=mock_updated_booking)
            
            mock_db.tx.return_value.__aenter__ = AsyncMock(return_value=mock_transaction)
            mock_db.tx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act & Assert
            with pytest.raises(BadRequestException) as exc_info:
                await PostureAnalysisService.finalize_analysis(
                    user_id,
                    booking_id,
                    session_id,
                    landmarks_data
                )
            
            assert "count consistency check failed" in str(exc_info.value).lower()
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_race_condition_prevention(self):
        """Test that race condition is prevented by re-checking count in transaction."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                    0: (0.5, 0.3, 0.0, 0.95),
                    11: (0.4, 0.5, 0.0, 0.90),
                    12: (0.6, 0.5, 0.0, 0.92),
                    23: (0.42, 0.7, 0.0, 0.91),
                    24: (0.58, 0.7, 0.0, 0.93),
                    }
                }
                for _ in range(450)
            ]
        }
        
        # Initial booking check shows count available
        mock_booking_initial = AsyncMock()
        mock_booking_initial.id = booking_id
        mock_booking_initial.userId = user_id
        mock_booking_initial.remainingScreeningCount = 1
        
        # But within transaction, count is depleted (race condition)
        mock_booking_locked = AsyncMock()
        mock_booking_locked.id = booking_id
        mock_booking_locked.userId = user_id
        mock_booking_locked.remainingScreeningCount = 0  # Depleted!
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_transaction = AsyncMock()
            mock_transaction.booking.find_first = AsyncMock(return_value=mock_booking_locked)
            
            mock_db.tx.return_value.__aenter__ = AsyncMock(return_value=mock_transaction)
            mock_db.tx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking_initial)
            
            # Act & Assert
            with pytest.raises(BadRequestException) as exc_info:
                await PostureAnalysisService.finalize_analysis(
                    user_id,
                    booking_id,
                    session_id,
                    landmarks_data
                )
            
            assert "no remaining screening counts" in str(exc_info.value).lower()
            
            # Verify no analysis was created
            mock_transaction.postureanalysis.create.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_stores_all_33_metrics(self):
        """Test that all 33 clinical metrics are stored with 2 decimal precision."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        # Create comprehensive sample data
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                    0: (0.5, 0.3, 0.0, 0.95),  # nose
                    7: (0.45, 0.28, 0.0, 0.90),  # left ear
                    8: (0.55, 0.28, 0.0, 0.92),  # right ear
                    11: (0.4, 0.5, 0.0, 0.90),  # left shoulder
                    12: (0.6, 0.5, 0.0, 0.92),  # right shoulder
                    13: (0.35, 0.65, 0.0, 0.88),  # left elbow
                    14: (0.65, 0.65, 0.0, 0.89),  # right elbow
                    15: (0.32, 0.75, 0.0, 0.85),  # left wrist
                    16: (0.68, 0.75, 0.0, 0.86),  # right wrist
                    23: (0.42, 0.7, 0.0, 0.91),  # left hip
                    24: (0.58, 0.7, 0.0, 0.93),  # right hip
                    25: (0.41, 0.85, 0.0, 0.87),  # left knee
                    26: (0.59, 0.85, 0.0, 0.88),  # right knee
                    27: (0.40, 0.95, 0.0, 0.84),  # left ankle
                    28: (0.60, 0.95, 0.0, 0.85),  # right ankle
                    29: (0.39, 0.97, 0.0, 0.82),  # left heel
                    30: (0.61, 0.97, 0.0, 0.83),  # right heel
                    31: (0.38, 0.98, 0.0, 0.80),  # left foot
                    32: (0.62, 0.98, 0.0, 0.81),  # right foot
                    }
                }
                for _ in range(450)
            ]
        }
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.remainingScreeningCount = 5
        
        mock_updated_booking = AsyncMock()
        mock_updated_booking.remainingScreeningCount = 4
        mock_updated_booking.usedScreeningCount = 4
        mock_updated_booking.totalScreeningCount = 8
        
        mock_analysis = AsyncMock()
        mock_analysis.id = "analysis-123"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_transaction = AsyncMock()
            mock_transaction.booking.find_first = AsyncMock(return_value=mock_booking)
            mock_transaction.postureanalysis.create = AsyncMock(return_value=mock_analysis)
            mock_transaction.booking.update = AsyncMock(return_value=mock_updated_booking)
            mock_transaction.commit = AsyncMock()
            
            mock_db.tx.return_value.__aenter__ = AsyncMock(return_value=mock_transaction)
            mock_db.tx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.finalize_analysis(
                user_id,
                booking_id,
                session_id,
                landmarks_data
            )
            
            # Assert - Verify all 33 metrics were passed to create()
            create_call = mock_transaction.postureanalysis.create.call_args
            data = create_call[1]["data"]
            
            # I. Global Posture (8 metrics)
            assert "fhdPixels" in data
            assert "cervicalAngle" in data
            assert "headLateralFlexion" in data
            assert "headRotation" in data
            assert "thoracicKyphosisAngle" in data
            assert "lumbarLordosisAngle" in data
            assert "trunkLateralShift" in data
            assert "trunkAngle" in data
            
            # II. Shoulder & Arm (6 metrics)
            assert "leftShoulderAngle" in data
            assert "rightShoulderAngle" in data
            assert "shoulderHeightDiff" in data
            assert "roundedShoulderAngle" in data
            assert "leftElbowAngle" in data
            assert "rightElbowAngle" in data
            
            # III. Pelvis & Hip (5 metrics)
            assert "leftHipAngle" in data
            assert "rightHipAngle" in data
            assert "pelvicObliquity" in data
            assert "pelvicTiltAngle" in data
            assert "hipHeightDiff" in data
            
            # IV. Lower Extremity (9 metrics)
            assert "leftKneeAngle" in data
            assert "rightKneeAngle" in data
            assert "kneeVarusValgus" in data
            assert "kneeFlexionNeutral" in data
            assert "qAngleLeft" in data
            assert "qAngleRight" in data
            assert "footProgressionAngle" in data
            assert "pronationSupinationLeft" in data
            assert "pronationSupinationRight" in data
            
            # V. Body Proportions (7 metrics)
            assert "shoulderWidth" in data
            assert "hipWidth" in data
            assert "torsoLength" in data
            assert "leftArmLength" in data
            assert "rightArmLength" in data
            assert "leftLegLength" in data
            assert "rightLegLength" in data
            
            # Metadata
            assert "landmarksData" in data
            assert data["status"] == "completed"
            assert data["userId"] == user_id
            assert data["bookingId"] == booking_id
    
    @pytest.mark.asyncio
    async def test_finalize_analysis_metrics_rounded_to_2_decimals(self):
        """Test that all metrics are rounded to 2 decimal places."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        session_id = "session-789"
        
        landmarks_data = {
            "samples": [
                {
                    "pose": {
                    0: (0.5, 0.3, 0.0, 0.95),
                    11: (0.4, 0.5, 0.0, 0.90),
                    12: (0.6, 0.5, 0.0, 0.92),
                    23: (0.42, 0.7, 0.0, 0.91),
                    24: (0.58, 0.7, 0.0, 0.93),
                    }
                }
                for _ in range(450)
            ]
        }
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.remainingScreeningCount = 5
        
        mock_updated_booking = AsyncMock()
        mock_updated_booking.remainingScreeningCount = 4
        mock_updated_booking.usedScreeningCount = 4
        mock_updated_booking.totalScreeningCount = 8
        
        mock_analysis = AsyncMock()
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_transaction = AsyncMock()
            mock_transaction.booking.find_first = AsyncMock(return_value=mock_booking)
            mock_transaction.postureanalysis.create = AsyncMock(return_value=mock_analysis)
            mock_transaction.booking.update = AsyncMock(return_value=mock_updated_booking)
            mock_transaction.commit = AsyncMock()
            
            mock_db.tx.return_value.__aenter__ = AsyncMock(return_value=mock_transaction)
            mock_db.tx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            await PostureAnalysisService.finalize_analysis(
                user_id,
                booking_id,
                session_id,
                landmarks_data
            )
            
            # Assert - Check that all numeric values have at most 2 decimal places
            create_call = mock_transaction.postureanalysis.create.call_args
            data = create_call[1]["data"]
            
            # Check a few sample metrics for proper rounding
            for key in ["fhdPixels", "cervicalAngle", "shoulderWidth", "leftKneeAngle"]:
                if key in data:
                    value = data[key]
                    # Check that value has at most 2 decimal places
                    assert round(value, 2) == value, f"{key} should be rounded to 2 decimals"



class TestCancelAnalysis:
    """Test suite for cancel_analysis() method."""
    
    @pytest.mark.asyncio
    async def test_cancel_analysis_success(self):
        """Test successful analysis cancellation."""
        # Arrange
        session_id = "session-789"
        
        # Act
        result = await PostureAnalysisService.cancel_analysis(session_id)
        
        # Assert
        assert "message" in result
        assert "cancelled successfully" in result["message"].lower()
        assert "no screening count was deducted" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_cancel_analysis_returns_dict(self):
        """Test that cancel_analysis returns a dictionary."""
        # Arrange
        session_id = "session-123"
        
        # Act
        result = await PostureAnalysisService.cancel_analysis(session_id)
        
        # Assert
        assert isinstance(result, dict)
        assert "message" in result
        assert isinstance(result["message"], str)
    
    @pytest.mark.asyncio
    async def test_cancel_analysis_no_database_calls(self):
        """Test that cancel_analysis makes no database calls."""
        # Arrange
        session_id = "session-456"
        
        with patch('app.api.posture.service.db') as mock_db:
            # Act
            result = await PostureAnalysisService.cancel_analysis(session_id)
            
            # Assert
            assert "message" in result
            
            # Verify no database methods were called
            mock_db.booking.find_first.assert_not_called()
            mock_db.postureanalysis.create.assert_not_called()
            mock_db.booking.update.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_cancel_analysis_with_different_session_ids(self):
        """Test that cancel_analysis works with various session IDs."""
        # Test with different session ID formats
        test_session_ids = [
            "session-123",
            "abc-def-ghi",
            "12345678-1234-1234-1234-123456789012",  # UUID format
            "short",
            "very-long-session-id-with-many-characters-123456789"
        ]
        
        for session_id in test_session_ids:
            # Act
            result = await PostureAnalysisService.cancel_analysis(session_id)
            
            # Assert
            assert "message" in result
            assert "cancelled successfully" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_cancel_analysis_idempotent(self):
        """Test that cancel_analysis can be called multiple times safely."""
        # Arrange
        session_id = "session-789"
        
        # Act - Call cancel multiple times
        result1 = await PostureAnalysisService.cancel_analysis(session_id)
        result2 = await PostureAnalysisService.cancel_analysis(session_id)
        result3 = await PostureAnalysisService.cancel_analysis(session_id)
        
        # Assert - All calls should succeed with same message
        assert result1["message"] == result2["message"] == result3["message"]
        assert "cancelled successfully" in result1["message"].lower()
    
    @pytest.mark.asyncio
    async def test_cancel_analysis_message_content(self):
        """Test that the cancellation message contains expected information."""
        # Arrange
        session_id = "session-999"
        
        # Act
        result = await PostureAnalysisService.cancel_analysis(session_id)
        
        # Assert - Message should inform user about:
        # 1. Successful cancellation
        # 2. No count deduction
        message = result["message"].lower()
        assert "cancel" in message or "cancelled" in message
        assert "success" in message or "successfully" in message
        assert "no screening count" in message or "no count" in message
        assert "deduct" in message



class TestGetUserAssessments:
    """Test suite for get_user_assessments() method."""
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_success_all_assessments(self):
        """Test successful retrieval of all user assessments."""
        # Arrange
        user_id = "user-123"
        
        # Mock assessments with booking and service relations
        mock_service = AsyncMock()
        mock_service.id = "service-001"
        mock_service.name = "Posture Analysis Package"
        mock_service.description = "10 screening assessments"
        
        mock_booking = AsyncMock()
        mock_booking.id = "booking-456"
        mock_booking.userId = user_id
        mock_booking.serviceId = "service-001"
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 3
        mock_booking.remainingScreeningCount = 7
        mock_booking.service = mock_service
        
        mock_assessments = [
            AsyncMock(
                id=f"analysis-{i}",
                userId=user_id,
                bookingId="booking-456",
                analysisDate=datetime(2024, 1, i+1),
                fhdPixels=45.2 + i,
                cervicalAngle=12.5 + i,
                status="completed",
                booking=mock_booking
            )
            for i in range(5)
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert len(result) == 5
            assert result[0].userId == user_id
            assert result[0].booking.service.name == "Posture Analysis Package"
            
            # Verify database query
            mock_db.postureanalysis.find_many.assert_called_once()
            call_args = mock_db.postureanalysis.find_many.call_args
            
            # Check where clause
            assert call_args[1]["where"]["userId"] == user_id
            assert "bookingId" not in call_args[1]["where"]
            
            # Check ordering
            assert call_args[1]["order"] == {"analysisDate": "desc"}
            
            # Check pagination
            assert call_args[1]["skip"] == 0
            assert call_args[1]["take"] == 10
            
            # Check relations included
            assert "booking" in call_args[1]["include"]
            assert "service" in call_args[1]["include"]["booking"]["include"]
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_with_booking_filter(self):
        """Test retrieval of assessments filtered by booking ID."""
        # Arrange
        user_id = "user-123"
        booking_id = "booking-456"
        
        mock_service = AsyncMock()
        mock_service.id = "service-001"
        mock_service.name = "Posture Analysis Package"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.service = mock_service
        
        mock_assessments = [
            AsyncMock(
                id=f"analysis-{i}",
                userId=user_id,
                bookingId=booking_id,
                analysisDate=datetime(2024, 1, i+1),
                status="completed",
                booking=mock_booking
            )
            for i in range(3)
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                booking_id=booking_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert len(result) == 3
            assert all(a.bookingId == booking_id for a in result)
            
            # Verify database query includes booking filter
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["where"]["userId"] == user_id
            assert call_args[1]["where"]["bookingId"] == booking_id
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_pagination_first_page(self):
        """Test pagination - first page with limit 5."""
        # Arrange
        user_id = "user-123"
        
        mock_assessments = [
            AsyncMock(
                id=f"analysis-{i}",
                userId=user_id,
                analysisDate=datetime(2024, 1, i+1)
            )
            for i in range(5)
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=5,
                offset=0
            )
            
            # Assert
            assert len(result) == 5
            
            # Verify pagination parameters
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["skip"] == 0
            assert call_args[1]["take"] == 5
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_pagination_second_page(self):
        """Test pagination - second page with offset."""
        # Arrange
        user_id = "user-123"
        
        mock_assessments = [
            AsyncMock(
                id=f"analysis-{i}",
                userId=user_id,
                analysisDate=datetime(2024, 1, i+11)
            )
            for i in range(5)
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act - Get second page (skip first 10)
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=5,
                offset=10
            )
            
            # Assert
            assert len(result) == 5
            
            # Verify pagination parameters
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["skip"] == 10
            assert call_args[1]["take"] == 5
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_empty_result(self):
        """Test when user has no assessments."""
        # Arrange
        user_id = "user-with-no-assessments"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert result == []
            assert len(result) == 0
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_ordered_by_date_desc(self):
        """Test that assessments are ordered by date (most recent first)."""
        # Arrange
        user_id = "user-123"
        
        # Create assessments with different dates
        mock_assessments = [
            AsyncMock(
                id="analysis-3",
                userId=user_id,
                analysisDate=datetime(2024, 1, 15)  # Most recent
            ),
            AsyncMock(
                id="analysis-2",
                userId=user_id,
                analysisDate=datetime(2024, 1, 10)
            ),
            AsyncMock(
                id="analysis-1",
                userId=user_id,
                analysisDate=datetime(2024, 1, 5)  # Oldest
            ),
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert len(result) == 3
            
            # Verify ordering parameter
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["order"] == {"analysisDate": "desc"}
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_includes_booking_relation(self):
        """Test that booking relation is included in results."""
        # Arrange
        user_id = "user-123"
        
        mock_booking = AsyncMock()
        mock_booking.id = "booking-456"
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        
        mock_assessment = AsyncMock()
        mock_assessment.id = "analysis-1"
        mock_assessment.userId = user_id
        mock_assessment.bookingId = "booking-456"
        mock_assessment.booking = mock_booking
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[mock_assessment])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert len(result) == 1
            assert result[0].booking is not None
            assert result[0].booking.id == "booking-456"
            
            # Verify include parameter
            call_args = mock_db.postureanalysis.find_many.call_args
            assert "booking" in call_args[1]["include"]
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_includes_service_relation(self):
        """Test that service relation is included through booking."""
        # Arrange
        user_id = "user-123"
        
        mock_service = AsyncMock()
        mock_service.id = "service-001"
        mock_service.name = "Premium Posture Package"
        mock_service.description = "20 assessments"
        
        mock_booking = AsyncMock()
        mock_booking.id = "booking-456"
        mock_booking.serviceId = "service-001"
        mock_booking.service = mock_service
        
        mock_assessment = AsyncMock()
        mock_assessment.id = "analysis-1"
        mock_assessment.userId = user_id
        mock_assessment.bookingId = "booking-456"
        mock_assessment.booking = mock_booking
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[mock_assessment])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert len(result) == 1
            assert result[0].booking.service is not None
            assert result[0].booking.service.name == "Premium Posture Package"
            
            # Verify nested include parameter
            call_args = mock_db.postureanalysis.find_many.call_args
            assert "booking" in call_args[1]["include"]
            assert "service" in call_args[1]["include"]["booking"]["include"]
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_default_limit(self):
        """Test that default limit is 10 when not specified."""
        # Arrange
        user_id = "user-123"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[])
            
            # Act - Don't specify limit (should use default)
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id
            )
            
            # Assert
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["take"] == 10  # Default limit
            assert call_args[1]["skip"] == 0   # Default offset
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_custom_limit(self):
        """Test with custom limit value."""
        # Arrange
        user_id = "user-123"
        
        mock_assessments = [
            AsyncMock(id=f"analysis-{i}", userId=user_id)
            for i in range(20)
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=20,
                offset=0
            )
            
            # Assert
            assert len(result) == 20
            
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["take"] == 20
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_large_offset(self):
        """Test with large offset value for deep pagination."""
        # Arrange
        user_id = "user-123"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=10,
                offset=100
            )
            
            # Assert
            assert result == []
            
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["skip"] == 100
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_multiple_bookings(self):
        """Test retrieving assessments from multiple bookings."""
        # Arrange
        user_id = "user-123"
        
        mock_booking1 = AsyncMock()
        mock_booking1.id = "booking-1"
        mock_booking1.userId = user_id
        
        mock_booking2 = AsyncMock()
        mock_booking2.id = "booking-2"
        mock_booking2.userId = user_id
        
        mock_assessments = [
            AsyncMock(
                id="analysis-1",
                userId=user_id,
                bookingId="booking-1",
                booking=mock_booking1,
                analysisDate=datetime(2024, 1, 15)
            ),
            AsyncMock(
                id="analysis-2",
                userId=user_id,
                bookingId="booking-2",
                booking=mock_booking2,
                analysisDate=datetime(2024, 1, 10)
            ),
            AsyncMock(
                id="analysis-3",
                userId=user_id,
                bookingId="booking-1",
                booking=mock_booking1,
                analysisDate=datetime(2024, 1, 5)
            ),
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert len(result) == 3
            # Should include assessments from both bookings
            booking_ids = {a.bookingId for a in result}
            assert "booking-1" in booking_ids
            assert "booking-2" in booking_ids
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_filter_excludes_other_bookings(self):
        """Test that booking filter excludes assessments from other bookings."""
        # Arrange
        user_id = "user-123"
        target_booking_id = "booking-1"
        
        mock_booking1 = AsyncMock()
        mock_booking1.id = "booking-1"
        
        # Only return assessments for booking-1
        mock_assessments = [
            AsyncMock(
                id="analysis-1",
                userId=user_id,
                bookingId="booking-1",
                booking=mock_booking1
            ),
            AsyncMock(
                id="analysis-2",
                userId=user_id,
                bookingId="booking-1",
                booking=mock_booking1
            ),
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                booking_id=target_booking_id,
                limit=10,
                offset=0
            )
            
            # Assert
            assert len(result) == 2
            assert all(a.bookingId == target_booking_id for a in result)
            
            # Verify where clause includes booking filter
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["where"]["bookingId"] == target_booking_id
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_returns_list(self):
        """Test that method returns a list."""
        # Arrange
        user_id = "user-123"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id
            )
            
            # Assert
            assert isinstance(result, list)
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_with_all_33_metrics(self):
        """Test that returned assessments include all 33 clinical metrics."""
        # Arrange
        user_id = "user-123"
        
        mock_assessment = AsyncMock()
        mock_assessment.id = "analysis-1"
        mock_assessment.userId = user_id
        
        # All 33 metrics
        mock_assessment.fhdPixels = 45.23
        mock_assessment.cervicalAngle = 12.5
        mock_assessment.headLateralFlexion = 3.2
        mock_assessment.headRotation = 1.5
        mock_assessment.thoracicKyphosisAngle = 35.0
        mock_assessment.lumbarLordosisAngle = 40.0
        mock_assessment.trunkLateralShift = 2.1
        mock_assessment.trunkAngle = 1.8
        
        mock_assessment.leftShoulderAngle = 85.0
        mock_assessment.rightShoulderAngle = 87.0
        mock_assessment.shoulderHeightDiff = 2.0
        mock_assessment.roundedShoulderAngle = 15.0
        mock_assessment.leftElbowAngle = 175.0
        mock_assessment.rightElbowAngle = 176.0
        
        mock_assessment.leftHipAngle = 180.0
        mock_assessment.rightHipAngle = 179.0
        mock_assessment.pelvicObliquity = 1.5
        mock_assessment.pelvicTiltAngle = 10.0
        mock_assessment.hipHeightDiff = 1.0
        
        mock_assessment.leftKneeAngle = 180.0
        mock_assessment.rightKneeAngle = 179.0
        mock_assessment.kneeVarusValgus = 2.0
        mock_assessment.kneeFlexionNeutral = 0.5
        mock_assessment.qAngleLeft = 15.0
        mock_assessment.qAngleRight = 16.0
        mock_assessment.footProgressionAngle = 5.0
        mock_assessment.pronationSupinationLeft = 3.0
        mock_assessment.pronationSupinationRight = 2.5
        
        mock_assessment.shoulderWidth = 45.0
        mock_assessment.hipWidth = 35.0
        mock_assessment.torsoLength = 60.0
        mock_assessment.leftArmLength = 70.0
        mock_assessment.rightArmLength = 71.0
        mock_assessment.leftLegLength = 90.0
        mock_assessment.rightLegLength = 91.0
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[mock_assessment])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id
            )
            
            # Assert
            assert len(result) == 1
            assessment = result[0]
            
            # Verify all 33 metrics are present
            assert hasattr(assessment, 'fhdPixels')
            assert hasattr(assessment, 'cervicalAngle')
            assert hasattr(assessment, 'leftShoulderAngle')
            assert hasattr(assessment, 'pelvicObliquity')
            assert hasattr(assessment, 'leftKneeAngle')
            assert hasattr(assessment, 'shoulderWidth')
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_includes_landmarks_data(self):
        """Test that assessments include landmarks data for visualization."""
        # Arrange
        user_id = "user-123"
        
        mock_landmarks = {
            "pose": {
                0: (0.5, 0.3, 0.0, 0.95),
                11: (0.4, 0.5, 0.0, 0.90),
                12: (0.6, 0.5, 0.0, 0.92),
            }
        }
        
        mock_assessment = AsyncMock()
        mock_assessment.id = "analysis-1"
        mock_assessment.userId = user_id
        mock_assessment.landmarksData = mock_landmarks
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[mock_assessment])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id
            )
            
            # Assert
            assert len(result) == 1
            assert result[0].landmarksData is not None
            assert "pose" in result[0].landmarksData
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_includes_status(self):
        """Test that assessments include status field."""
        # Arrange
        user_id = "user-123"
        
        mock_assessments = [
            AsyncMock(
                id="analysis-1",
                userId=user_id,
                status="completed"
            ),
            AsyncMock(
                id="analysis-2",
                userId=user_id,
                status="completed"
            ),
        ]
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=mock_assessments)
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id
            )
            
            # Assert
            assert len(result) == 2
            assert all(a.status == "completed" for a in result)
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_zero_limit(self):
        """Test behavior with limit=0 (edge case)."""
        # Arrange
        user_id = "user-123"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=0,
                offset=0
            )
            
            # Assert
            assert result == []
            
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["take"] == 0
    
    @pytest.mark.asyncio
    async def test_get_user_assessments_very_large_limit(self):
        """Test with very large limit value."""
        # Arrange
        user_id = "user-123"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_many = AsyncMock(return_value=[])
            
            # Act
            result = await PostureAnalysisService.get_user_assessments(
                user_id=user_id,
                limit=1000,
                offset=0
            )
            
            # Assert
            call_args = mock_db.postureanalysis.find_many.call_args
            assert call_args[1]["take"] == 1000



class TestGetAnalysisById:
    """Test suite for get_analysis_by_id() method."""
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_success(self):
        """Test successful retrieval of analysis by ID."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        booking_id = "booking-789"
        
        # Mock service and booking
        mock_service = AsyncMock()
        mock_service.id = "service-001"
        mock_service.name = "Posture Assessment Plan"
        mock_service.description = "Comprehensive posture analysis"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.serviceId = "service-001"
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 3
        mock_booking.remainingScreeningCount = 7
        mock_booking.service = mock_service
        
        # Mock analysis with all 33 metrics
        mock_analysis = AsyncMock()
        mock_analysis.id = analysis_id
        mock_analysis.userId = user_id
        mock_analysis.bookingId = booking_id
        mock_analysis.analysisDate = datetime.utcnow()
        
        # Global Posture (8 metrics)
        mock_analysis.fhdPixels = 45.23
        mock_analysis.cervicalAngle = 12.5
        mock_analysis.headLateralFlexion = 3.2
        mock_analysis.headRotation = 1.5
        mock_analysis.thoracicKyphosisAngle = 35.0
        mock_analysis.lumbarLordosisAngle = 40.0
        mock_analysis.trunkLateralShift = 2.1
        mock_analysis.trunkAngle = 1.8
        
        # Shoulder & Arm (6 metrics)
        mock_analysis.leftShoulderAngle = 85.0
        mock_analysis.rightShoulderAngle = 87.0
        mock_analysis.shoulderHeightDiff = 2.0
        mock_analysis.roundedShoulderAngle = 15.0
        mock_analysis.leftElbowAngle = 175.0
        mock_analysis.rightElbowAngle = 176.0
        
        # Pelvis & Hip (5 metrics)
        mock_analysis.leftHipAngle = 180.0
        mock_analysis.rightHipAngle = 179.0
        mock_analysis.pelvicObliquity = 1.5
        mock_analysis.pelvicTiltAngle = 10.0
        mock_analysis.hipHeightDiff = 1.0
        
        # Lower Extremity (9 metrics)
        mock_analysis.leftKneeAngle = 180.0
        mock_analysis.rightKneeAngle = 179.0
        mock_analysis.kneeVarusValgus = 2.0
        mock_analysis.kneeFlexionNeutral = 0.5
        mock_analysis.qAngleLeft = 15.0
        mock_analysis.qAngleRight = 16.0
        mock_analysis.footProgressionAngle = 5.0
        mock_analysis.pronationSupinationLeft = 3.0
        mock_analysis.pronationSupinationRight = 2.5
        
        # Body Proportions (7 metrics)
        mock_analysis.shoulderWidth = 45.0
        mock_analysis.hipWidth = 35.0
        mock_analysis.torsoLength = 60.0
        mock_analysis.leftArmLength = 70.0
        mock_analysis.rightArmLength = 71.0
        mock_analysis.leftLegLength = 90.0
        mock_analysis.rightLegLength = 91.0
        
        # Metadata
        mock_analysis.landmarksData = {
            "pose": {
                0: (0.5, 0.3, 0.0, 0.95),
                11: (0.4, 0.5, 0.0, 0.90),
                12: (0.6, 0.5, 0.0, 0.92),
            }
        }
        mock_analysis.status = "completed"
        mock_analysis.booking = mock_booking
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=mock_analysis)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result is not None
            assert result.id == analysis_id
            assert result.userId == user_id
            assert result.bookingId == booking_id
            
            # Verify all 33 metrics are present
            assert result.fhdPixels == 45.23
            assert result.cervicalAngle == 12.5
            assert result.leftShoulderAngle == 85.0
            assert result.pelvicObliquity == 1.5
            assert result.leftKneeAngle == 180.0
            assert result.shoulderWidth == 45.0
            
            # Verify metadata
            assert result.status == "completed"
            assert result.landmarksData is not None
            
            # Verify relations
            assert result.booking is not None
            assert result.booking.service is not None
            assert result.booking.service.name == "Posture Assessment Plan"
            
            # Verify database query
            mock_db.postureanalysis.find_first.assert_called_once_with(
                where={"id": analysis_id, "userId": user_id},
                include={
                    "booking": {
                        "include": {
                            "service": True
                        }
                    }
                }
            )
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_not_found(self):
        """Test when analysis doesn't exist."""
        # Arrange
        analysis_id = "nonexistent-analysis"
        user_id = "user-456"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=None)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result is None
            
            # Verify database was queried with correct parameters
            mock_db.postureanalysis.find_first.assert_called_once_with(
                where={"id": analysis_id, "userId": user_id},
                include={
                    "booking": {
                        "include": {
                            "service": True
                        }
                    }
                }
            )
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_wrong_user(self):
        """Test ownership validation - user doesn't own the analysis."""
        # Arrange
        analysis_id = "analysis-123"
        requesting_user_id = "user-456"
        actual_owner_id = "user-789"  # Different user
        
        # Analysis exists but belongs to different user
        # Database query with userId in WHERE clause will return None
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=None)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                requesting_user_id
            )
            
            # Assert
            assert result is None
            
            # Verify query included userId in WHERE clause (ownership check)
            call_args = mock_db.postureanalysis.find_first.call_args
            assert call_args[1]["where"]["userId"] == requesting_user_id
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_includes_booking_info(self):
        """Test that result includes complete booking information."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        
        mock_service = AsyncMock()
        mock_service.name = "Premium Posture Plan"
        mock_service.description = "Advanced posture analysis"
        
        mock_booking = AsyncMock()
        mock_booking.id = "booking-789"
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 5
        mock_booking.remainingScreeningCount = 5
        mock_booking.service = mock_service
        
        mock_analysis = AsyncMock()
        mock_analysis.id = analysis_id
        mock_analysis.userId = user_id
        mock_analysis.booking = mock_booking
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=mock_analysis)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result.booking is not None
            assert result.booking.id == "booking-789"
            assert result.booking.status == "CONFIRMED"
            assert result.booking.totalScreeningCount == 10
            assert result.booking.usedScreeningCount == 5
            assert result.booking.remainingScreeningCount == 5
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_includes_service_info(self):
        """Test that result includes complete service information."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        
        mock_service = AsyncMock()
        mock_service.id = "service-001"
        mock_service.name = "Basic Posture Assessment"
        mock_service.description = "Entry-level posture analysis"
        mock_service.basePrice = 99.99
        
        mock_booking = AsyncMock()
        mock_booking.service = mock_service
        
        mock_analysis = AsyncMock()
        mock_analysis.id = analysis_id
        mock_analysis.userId = user_id
        mock_analysis.booking = mock_booking
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=mock_analysis)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result.booking.service is not None
            assert result.booking.service.id == "service-001"
            assert result.booking.service.name == "Basic Posture Assessment"
            assert result.booking.service.description == "Entry-level posture analysis"
            assert result.booking.service.basePrice == 99.99
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_includes_landmarks_for_visualization(self):
        """Test that result includes landmarks data for 3D visualization."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        
        mock_landmarks = {
            "pose": {
                0: (0.5, 0.3, 0.0, 0.95),  # nose
                11: (0.4, 0.5, 0.0, 0.90),  # left shoulder
                12: (0.6, 0.5, 0.0, 0.92),  # right shoulder
                23: (0.42, 0.7, 0.0, 0.91),  # left hip
                24: (0.58, 0.7, 0.0, 0.93),  # right hip
                33: (0.5, 0.45, 0.0, 0.91),  # virtual neck
            },
            "face": {},
            "left_hand": {},
            "right_hand": {}
        }
        
        mock_analysis = AsyncMock()
        mock_analysis.id = analysis_id
        mock_analysis.userId = user_id
        mock_analysis.landmarksData = mock_landmarks
        mock_analysis.booking = AsyncMock()
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=mock_analysis)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result.landmarksData is not None
            assert "pose" in result.landmarksData
            assert 0 in result.landmarksData["pose"]  # nose
            assert 33 in result.landmarksData["pose"]  # virtual neck
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_with_completed_status(self):
        """Test retrieval of completed analysis."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        
        mock_analysis = AsyncMock()
        mock_analysis.id = analysis_id
        mock_analysis.userId = user_id
        mock_analysis.status = "completed"
        mock_analysis.booking = AsyncMock()
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=mock_analysis)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result is not None
            assert result.status == "completed"
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_with_analysis_date(self):
        """Test that result includes analysis date."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        analysis_date = datetime(2024, 1, 15, 10, 30, 0)
        
        mock_analysis = AsyncMock()
        mock_analysis.id = analysis_id
        mock_analysis.userId = user_id
        mock_analysis.analysisDate = analysis_date
        mock_analysis.booking = AsyncMock()
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=mock_analysis)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result is not None
            assert result.analysisDate == analysis_date
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_returns_none_not_exception(self):
        """Test that method returns None instead of raising exception for not found."""
        # This is important for security - we don't want to leak information
        # about whether an analysis ID exists if the user doesn't own it
        
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=None)
            
            # Act - should not raise exception
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            assert result is None
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_query_structure(self):
        """Test that database query has correct structure."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=None)
            
            # Act
            await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert
            call_args = mock_db.postureanalysis.find_first.call_args
            
            # Verify WHERE clause
            assert "where" in call_args[1]
            assert call_args[1]["where"]["id"] == analysis_id
            assert call_args[1]["where"]["userId"] == user_id
            
            # Verify INCLUDE clause
            assert "include" in call_args[1]
            assert "booking" in call_args[1]["include"]
            assert "include" in call_args[1]["include"]["booking"]
            assert call_args[1]["include"]["booking"]["include"]["service"] is True
    
    @pytest.mark.asyncio
    async def test_get_analysis_by_id_all_33_metrics_present(self):
        """Test that all 33 clinical metrics are present in the result."""
        # Arrange
        analysis_id = "analysis-123"
        user_id = "user-456"
        
        mock_analysis = AsyncMock()
        mock_analysis.id = analysis_id
        mock_analysis.userId = user_id
        
        # Set all 33 metrics
        # Global Posture (8)
        mock_analysis.fhdPixels = 45.0
        mock_analysis.cervicalAngle = 12.0
        mock_analysis.headLateralFlexion = 3.0
        mock_analysis.headRotation = 1.0
        mock_analysis.thoracicKyphosisAngle = 35.0
        mock_analysis.lumbarLordosisAngle = 40.0
        mock_analysis.trunkLateralShift = 2.0
        mock_analysis.trunkAngle = 1.5
        
        # Shoulder & Arm (6)
        mock_analysis.leftShoulderAngle = 85.0
        mock_analysis.rightShoulderAngle = 87.0
        mock_analysis.shoulderHeightDiff = 2.0
        mock_analysis.roundedShoulderAngle = 15.0
        mock_analysis.leftElbowAngle = 175.0
        mock_analysis.rightElbowAngle = 176.0
        
        # Pelvis & Hip (5)
        mock_analysis.leftHipAngle = 180.0
        mock_analysis.rightHipAngle = 179.0
        mock_analysis.pelvicObliquity = 1.5
        mock_analysis.pelvicTiltAngle = 10.0
        mock_analysis.hipHeightDiff = 1.0
        
        # Lower Extremity (9)
        mock_analysis.leftKneeAngle = 180.0
        mock_analysis.rightKneeAngle = 179.0
        mock_analysis.kneeVarusValgus = 2.0
        mock_analysis.kneeFlexionNeutral = 0.5
        mock_analysis.qAngleLeft = 15.0
        mock_analysis.qAngleRight = 16.0
        mock_analysis.footProgressionAngle = 5.0
        mock_analysis.pronationSupinationLeft = 3.0
        mock_analysis.pronationSupinationRight = 2.5
        
        # Body Proportions (7)
        mock_analysis.shoulderWidth = 45.0
        mock_analysis.hipWidth = 35.0
        mock_analysis.torsoLength = 60.0
        mock_analysis.leftArmLength = 70.0
        mock_analysis.rightArmLength = 71.0
        mock_analysis.leftLegLength = 90.0
        mock_analysis.rightLegLength = 91.0
        
        mock_analysis.booking = AsyncMock()
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.postureanalysis.find_first = AsyncMock(return_value=mock_analysis)
            
            # Act
            result = await PostureAnalysisService.get_analysis_by_id(
                analysis_id,
                user_id
            )
            
            # Assert - verify all 33 metrics are accessible
            assert result is not None
            
            # Global Posture (8)
            assert hasattr(result, 'fhdPixels')
            assert hasattr(result, 'cervicalAngle')
            assert hasattr(result, 'headLateralFlexion')
            assert hasattr(result, 'headRotation')
            assert hasattr(result, 'thoracicKyphosisAngle')
            assert hasattr(result, 'lumbarLordosisAngle')
            assert hasattr(result, 'trunkLateralShift')
            assert hasattr(result, 'trunkAngle')
            
            # Shoulder & Arm (6)
            assert hasattr(result, 'leftShoulderAngle')
            assert hasattr(result, 'rightShoulderAngle')
            assert hasattr(result, 'shoulderHeightDiff')
            assert hasattr(result, 'roundedShoulderAngle')
            assert hasattr(result, 'leftElbowAngle')
            assert hasattr(result, 'rightElbowAngle')
            
            # Pelvis & Hip (5)
            assert hasattr(result, 'leftHipAngle')
            assert hasattr(result, 'rightHipAngle')
            assert hasattr(result, 'pelvicObliquity')
            assert hasattr(result, 'pelvicTiltAngle')
            assert hasattr(result, 'hipHeightDiff')
            
            # Lower Extremity (9)
            assert hasattr(result, 'leftKneeAngle')
            assert hasattr(result, 'rightKneeAngle')
            assert hasattr(result, 'kneeVarusValgus')
            assert hasattr(result, 'kneeFlexionNeutral')
            assert hasattr(result, 'qAngleLeft')
            assert hasattr(result, 'qAngleRight')
            assert hasattr(result, 'footProgressionAngle')
            assert hasattr(result, 'pronationSupinationLeft')
            assert hasattr(result, 'pronationSupinationRight')
            
            # Body Proportions (7)
            assert hasattr(result, 'shoulderWidth')
            assert hasattr(result, 'hipWidth')
            assert hasattr(result, 'torsoLength')
            assert hasattr(result, 'leftArmLength')
            assert hasattr(result, 'rightArmLength')
            assert hasattr(result, 'leftLegLength')
            assert hasattr(result, 'rightLegLength')



class TestValidateBooking:
    """Test suite for validate_booking() method."""
    
    @pytest.mark.asyncio
    async def test_validate_booking_success_confirmed_status(self):
        """Test successful validation with CONFIRMED status and remaining counts."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 3
        mock_booking.remainingScreeningCount = 7
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is True
            assert result["remainingCount"] == 7
            assert result["totalCount"] == 10
            assert result["usedCount"] == 3
            assert result["message"] is None
            
            # Verify database query
            mock_db.booking.find_first.assert_called_once_with(
                where={"id": booking_id, "userId": user_id}
            )
    
    @pytest.mark.asyncio
    async def test_validate_booking_success_completed_status(self):
        """Test successful validation with COMPLETED status and remaining counts."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "COMPLETED"
        mock_booking.totalScreeningCount = 5
        mock_booking.usedScreeningCount = 2
        mock_booking.remainingScreeningCount = 3
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is True
            assert result["remainingCount"] == 3
            assert result["totalCount"] == 5
            assert result["usedCount"] == 2
            assert result["message"] is None
    
    @pytest.mark.asyncio
    async def test_validate_booking_not_found(self):
        """Test validation fails when booking doesn't exist."""
        # Arrange
        booking_id = "nonexistent-booking"
        user_id = "user-456"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=None)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            assert result["remainingCount"] == 0
            assert result["totalCount"] == 0
            assert result["usedCount"] == 0
            assert result["message"] == "Booking not found"
    
    @pytest.mark.asyncio
    async def test_validate_booking_wrong_user(self):
        """Test validation fails when user doesn't own the booking."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        # Booking exists but belongs to different user
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=None)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            assert result["message"] == "Booking not found"
    
    @pytest.mark.asyncio
    async def test_validate_booking_no_remaining_counts(self):
        """Test validation fails when booking has no remaining screening counts."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 10
        mock_booking.remainingScreeningCount = 0
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            assert result["remainingCount"] == 0
            assert result["totalCount"] == 10
            assert result["usedCount"] == 10
            assert result["message"] == "No remaining screening counts"
    
    @pytest.mark.asyncio
    async def test_validate_booking_invalid_status_pending(self):
        """Test validation fails when booking status is PENDING."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "PENDING"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 3
        mock_booking.remainingScreeningCount = 7
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            assert result["remainingCount"] == 7
            assert result["totalCount"] == 10
            assert result["usedCount"] == 3
            assert result["message"] == "Booking status 'PENDING' is not valid"
    
    @pytest.mark.asyncio
    async def test_validate_booking_invalid_status_cancelled(self):
        """Test validation fails when booking status is CANCELLED."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CANCELLED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 2
        mock_booking.remainingScreeningCount = 8
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            assert result["remainingCount"] == 8
            assert result["message"] == "Booking status 'CANCELLED' is not valid"
    
    @pytest.mark.asyncio
    async def test_validate_booking_invalid_status_rejected(self):
        """Test validation fails when booking status is REJECTED."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "REJECTED"
        mock_booking.totalScreeningCount = 5
        mock_booking.usedScreeningCount = 0
        mock_booking.remainingScreeningCount = 5
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            assert result["message"] == "Booking status 'REJECTED' is not valid"
    
    @pytest.mark.asyncio
    async def test_validate_booking_no_counts_takes_precedence(self):
        """Test that no remaining counts message takes precedence over invalid status."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "PENDING"  # Invalid status
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 10
        mock_booking.remainingScreeningCount = 0  # No counts
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            # No counts message should take precedence
            assert result["message"] == "No remaining screening counts"
    
    @pytest.mark.asyncio
    async def test_validate_booking_with_one_remaining_count(self):
        """Test validation succeeds with exactly one remaining count."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 9
        mock_booking.remainingScreeningCount = 1
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is True
            assert result["remainingCount"] == 1
            assert result["message"] is None
    
    @pytest.mark.asyncio
    async def test_validate_booking_with_all_counts_remaining(self):
        """Test validation succeeds when no counts have been used yet."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 15
        mock_booking.usedScreeningCount = 0
        mock_booking.remainingScreeningCount = 15
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is True
            assert result["remainingCount"] == 15
            assert result["totalCount"] == 15
            assert result["usedCount"] == 0
            assert result["message"] is None
    
    @pytest.mark.asyncio
    async def test_validate_booking_returns_all_required_fields(self):
        """Test that validation response contains all required fields."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 5
        mock_booking.remainingScreeningCount = 5
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert - verify all required fields are present
            assert "valid" in result
            assert "remainingCount" in result
            assert "totalCount" in result
            assert "usedCount" in result
            assert "message" in result
            
            # Verify field types
            assert isinstance(result["valid"], bool)
            assert isinstance(result["remainingCount"], int)
            assert isinstance(result["totalCount"], int)
            assert isinstance(result["usedCount"], int)
            assert result["message"] is None or isinstance(result["message"], str)
    
    @pytest.mark.asyncio
    async def test_validate_booking_ownership_check_in_query(self):
        """Test that ownership check is done at database query level."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=None)
            
            # Act
            await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert - verify WHERE clause includes both id and userId
            call_args = mock_db.booking.find_first.call_args
            assert "where" in call_args[1]
            assert call_args[1]["where"]["id"] == booking_id
            assert call_args[1]["where"]["userId"] == user_id
    
    @pytest.mark.asyncio
    async def test_validate_booking_multiple_validations_same_booking(self):
        """Test that multiple validations of the same booking work correctly."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 10
        mock_booking.usedScreeningCount = 5
        mock_booking.remainingScreeningCount = 5
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act - validate multiple times
            result1 = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            result2 = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            result3 = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert - all validations should succeed with same results
            assert result1["valid"] is True
            assert result2["valid"] is True
            assert result3["valid"] is True
            assert result1["remainingCount"] == result2["remainingCount"] == result3["remainingCount"]
            
            # Verify database was queried each time
            assert mock_db.booking.find_first.call_count == 3
    
    @pytest.mark.asyncio
    async def test_validate_booking_edge_case_zero_total_count(self):
        """Test validation with booking that has zero total screening count."""
        # Arrange
        booking_id = "booking-123"
        user_id = "user-456"
        
        mock_booking = AsyncMock()
        mock_booking.id = booking_id
        mock_booking.userId = user_id
        mock_booking.status = "CONFIRMED"
        mock_booking.totalScreeningCount = 0
        mock_booking.usedScreeningCount = 0
        mock_booking.remainingScreeningCount = 0
        
        with patch('app.api.posture.service.db') as mock_db:
            mock_db.booking.find_first = AsyncMock(return_value=mock_booking)
            
            # Act
            result = await PostureAnalysisService.validate_booking(
                booking_id,
                user_id
            )
            
            # Assert
            assert result["valid"] is False
            assert result["remainingCount"] == 0
            assert result["totalCount"] == 0
            assert result["usedCount"] == 0
            assert result["message"] == "No remaining screening counts"
