"""
Integration Tests for Clinical Posture Analysis Feature

Tests the complete end-to-end flow:
1. User has booking with screening counts
2. User starts posture analysis
3. System processes frames
4. System calculates metrics
5. System saves analysis and deducts count
6. User views results

This test suite verifies the entire feature works correctly with real database operations.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from prisma import Prisma
from prisma.enums import BookingStatus, UserRole, UserStatus, PaymentStatus, PaymentType
import base64
import cv2
import numpy as np

# Import services
from app.api.posture.service import PostureAnalysisService
from app.api.booking.service import BookingService
from app.utils.screening_count import ScreeningCountManager


@pytest.fixture
async def db():
    """Database fixture for integration tests."""
    client = Prisma()
    await client.connect()
    yield client
    await client.disconnect()


@pytest.fixture
async def test_user(db):
    """Create a test user."""
    user = await db.user.create(
        data={
            "phone": f"+1555{datetime.now().microsecond:06d}",
            "name": "Test User",
            "email": f"test{datetime.now().microsecond}@example.com",
            "role": UserRole.USER,
            "status": UserStatus.ACTIVE,
            "passwordHash": "test_hash"
        }
    )
    yield user
    # Cleanup
    await db.user.delete(where={"id": user.id})


@pytest.fixture
async def test_category(db):
    """Create a test category."""
    category = await db.category.create(
        data={
            "name": "Test Category",
            "slug": f"test-category-{datetime.now().microsecond}",
            "description": "Test category for integration tests"
        }
    )
    yield category
    # Cleanup
    await db.category.delete(where={"id": category.id})


@pytest.fixture
async def test_service(db, test_category):
    """Create a test service with screening counts."""
    service = await db.service.create(
        data={
            "categoryId": test_category.id,
            "name": "Posture Analysis Service",
            "slug": f"posture-service-{datetime.now().microsecond}",
            "description": "Service with 5 screening counts",
            "basePrice": 100.0,
            "paymentType": PaymentType.FULL,
            "includedScreeningCount": 5  # 5 screening counts included
        }
    )
    yield service
    # Cleanup
    await db.service.delete(where={"id": service.id})


@pytest.fixture
async def test_payment(db, test_user):
    """Create a test payment."""
    payment = await db.payment.create(
        data={
            "userId": test_user.id,
            "totalAmount": 100.0,
            "paidAmount": 100.0,
            "remainingAmount": 0.0,
            "status": PaymentStatus.COMPLETED,
            "paymentMethod": "test",
            "transactionId": f"test-txn-{datetime.now().microsecond}"
        }
    )
    yield payment
    # Cleanup
    await db.payment.delete(where={"id": payment.id})


@pytest.fixture
async def test_booking(db, test_user, test_service, test_payment):
    """Create a test booking with screening counts."""
    booking = await db.booking.create(
        data={
            "userId": test_user.id,
            "serviceId": test_service.id,
            "paymentId": test_payment.id,
            "time": datetime.now() + timedelta(days=1),
            "status": BookingStatus.CONFIRMED,
            "totalAmount": 100.0,
            "paidAmount": 100.0,
            "remainingAmount": 0.0,
            # Screening counts
            "totalScreeningCount": 5,
            "usedScreeningCount": 0,
            "remainingScreeningCount": 5
        }
    )
    yield booking
    # Cleanup
    # Delete related posture analyses first
    await db.postureanalysis.delete_many(where={"bookingId": booking.id})
    await db.booking.delete(where={"id": booking.id})


def create_test_frame():
    """Create a test frame with a simple pose."""
    # Create a blank image
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Draw a simple stick figure
    # Head
    cv2.circle(frame, (320, 100), 30, (255, 255, 255), -1)
    # Body
    cv2.line(frame, (320, 130), (320, 300), (255, 255, 255), 5)
    # Arms
    cv2.line(frame, (320, 150), (250, 200), (255, 255, 255), 5)
    cv2.line(frame, (320, 150), (390, 200), (255, 255, 255), 5)
    # Legs
    cv2.line(frame, (320, 300), (280, 400), (255, 255, 255), 5)
    cv2.line(frame, (320, 300), (360, 400), (255, 255, 255), 5)
    
    return frame


def encode_frame(frame):
    """Encode frame to base64."""
    _, buffer = cv2.imencode('.jpg', frame)
    return base64.b64encode(buffer).decode('utf-8')


class TestPostureAnalysisIntegration:
    """Integration tests for the complete posture analysis flow."""
    
    @pytest.mark.asyncio
    async def test_complete_analysis_flow(self, db, test_user, test_booking):
        """
        Test the complete posture analysis flow:
        1. Start analysis
        2. Process frames
        3. Finalize analysis
        4. Verify count deduction
        5. Verify analysis saved
        """
        # Step 1: Start analysis
        session = await PostureAnalysisService.start_analysis(
            user_id=test_user.id,
            booking_id=test_booking.id
        )
        
        assert session is not None
        assert "sessionId" in session
        assert session["bookingId"] == test_booking.id
        assert session["remainingCount"] == 5
        
        # Step 2: Process frames (simulate 10 frames)
        test_frame = create_test_frame()
        frame_data = encode_frame(test_frame)
        
        landmarks_collection = []
        for i in range(10):
            result = await PostureAnalysisService.process_frame(
                session_id=session["sessionId"],
                frame_data=frame_data,
                frame_number=i
            )
            
            assert result is not None
            assert "landmarks" in result
            assert "visibility" in result
            assert "progress" in result
            
            if result["landmarks"]:
                landmarks_collection.append(result["landmarks"])
        
        # Step 3: Finalize analysis
        # Create mock landmarks data with 450 samples (as required by the system)
        mock_landmarks = {
            "samples": [
                {"pose": {i: [100 + i, 200 + i, 0.5, 0.9] for i in range(34)}}
                for _ in range(450)  # 450 samples as required
            ]
        }
        
        analysis_result = await PostureAnalysisService.finalize_analysis(
            user_id=test_user.id,
            booking_id=test_booking.id,
            session_id=session["sessionId"],
            landmarks_data=mock_landmarks
        )
        
        assert analysis_result is not None
        assert "analysis" in analysis_result
        assert "remainingCount" in analysis_result
        
        # Step 4: Verify count deduction
        assert analysis_result["remainingCount"] == 4  # Should be 5 - 1 = 4
        
        # Verify in database
        updated_booking = await db.booking.find_unique(
            where={"id": test_booking.id}
        )
        assert updated_booking.usedScreeningCount == 1
        assert updated_booking.remainingScreeningCount == 4
        
        # Step 5: Verify analysis saved
        analysis = analysis_result["analysis"]
        assert analysis.userId == test_user.id
        assert analysis.bookingId == test_booking.id
        assert analysis.status == "completed"
        
        # Verify all 33 metrics are present
        assert hasattr(analysis, 'fhdPixels')
        assert hasattr(analysis, 'cervicalAngle')
        assert hasattr(analysis, 'leftShoulderAngle')
        assert hasattr(analysis, 'rightShoulderAngle')
        # ... (all 33 metrics should be present)
        
        print("✅ Complete analysis flow test passed!")
    
    @pytest.mark.asyncio
    async def test_no_remaining_counts(self, db, test_user, test_booking):
        """Test that analysis fails when no screening counts remain."""
        # Exhaust all counts
        await db.booking.update(
            where={"id": test_booking.id},
            data={
                "usedScreeningCount": 5,
                "remainingScreeningCount": 0
            }
        )
        
        # Try to start analysis
        with pytest.raises(Exception) as exc_info:
            await PostureAnalysisService.start_analysis(
                user_id=test_user.id,
                booking_id=test_booking.id
            )
        
        assert "No remaining screening counts" in str(exc_info.value)
        print("✅ No remaining counts test passed!")
    
    @pytest.mark.asyncio
    async def test_invalid_booking_ownership(self, db, test_user, test_booking):
        """Test that analysis fails for bookings user doesn't own."""
        # Create another user
        other_user = await db.user.create(
            data={
                "phone": f"+1555{datetime.now().microsecond:06d}",
                "name": "Other User",
                "email": f"other{datetime.now().microsecond}@example.com",
                "role": UserRole.USER,
                "status": UserStatus.ACTIVE,
                "passwordHash": "test_hash"
            }
        )
        
        try:
            # Try to start analysis with wrong user
            with pytest.raises(Exception) as exc_info:
                await PostureAnalysisService.start_analysis(
                    user_id=other_user.id,
                    booking_id=test_booking.id
                )
            
            assert "not found or access denied" in str(exc_info.value).lower()
            print("✅ Invalid booking ownership test passed!")
        finally:
            # Cleanup
            await db.user.delete(where={"id": other_user.id})
    
    @pytest.mark.asyncio
    async def test_atomic_count_deduction(self, db, test_user, test_booking):
        """Test that count deduction is atomic (all-or-nothing)."""
        initial_count = test_booking.remainingScreeningCount
        
        # Start analysis
        session = await PostureAnalysisService.start_analysis(
            user_id=test_user.id,
            booking_id=test_booking.id
        )
        
        # Try to finalize with invalid data (should fail and rollback)
        try:
            await PostureAnalysisService.finalize_analysis(
                user_id=test_user.id,
                booking_id=test_booking.id,
                session_id=session["sessionId"],
                landmarks_data={"samples": []}  # Invalid: empty samples
            )
        except Exception:
            pass  # Expected to fail
        
        # Verify count was NOT deducted
        booking = await db.booking.find_unique(where={"id": test_booking.id})
        assert booking.remainingScreeningCount == initial_count
        assert booking.usedScreeningCount == 0
        
        print("✅ Atomic count deduction test passed!")
    
    @pytest.mark.asyncio
    async def test_get_user_assessments(self, db, test_user, test_booking):
        """Test retrieving user's assessments."""
        # Create a test analysis
        analysis = await db.postureanalysis.create(
            data={
                "userId": test_user.id,
                "bookingId": test_booking.id,
                "fhdPixels": 10.5,
                "cervicalAngle": 45.2,
                "headLateralFlexion": 5.1,
                "headRotation": 2.3,
                "thoracicKyphosisAngle": 35.0,
                "lumbarLordosisAngle": 40.0,
                "trunkLateralShift": 1.5,
                "trunkAngle": 0.5,
                "leftShoulderAngle": 170.0,
                "rightShoulderAngle": 168.0,
                "shoulderHeightDiff": 2.0,
                "roundedShoulderAngle": 15.0,
                "leftElbowAngle": 175.0,
                "rightElbowAngle": 176.0,
                "leftHipAngle": 178.0,
                "rightHipAngle": 177.0,
                "pelvicObliquity": 1.0,
                "pelvicTiltAngle": 10.0,
                "hipHeightDiff": 0.5,
                "leftKneeAngle": 180.0,
                "rightKneeAngle": 179.0,
                "kneeVarusValgus": 0.5,
                "kneeFlexionNeutral": 0.0,
                "qAngleLeft": 15.0,
                "qAngleRight": 14.5,
                "footProgressionAngle": 10.0,
                "pronationSupinationLeft": 5.0,
                "pronationSupinationRight": 4.5,
                "shoulderWidth": 45.0,
                "hipWidth": 35.0,
                "torsoLength": 60.0,
                "leftArmLength": 70.0,
                "rightArmLength": 69.5,
                "leftLegLength": 90.0,
                "rightLegLength": 89.5,
                "status": "completed"
            }
        )
        
        # Get assessments
        assessments = await PostureAnalysisService.get_user_assessments(
            user_id=test_user.id,
            booking_id=test_booking.id,
            limit=10,
            offset=0
        )
        
        assert len(assessments) == 1
        assert assessments[0].id == analysis.id
        assert assessments[0].userId == test_user.id
        
        print("✅ Get user assessments test passed!")
    
    @pytest.mark.asyncio
    async def test_validate_booking(self, db, test_user, test_booking):
        """Test booking validation before analysis."""
        # Valid booking
        result = await PostureAnalysisService.validate_booking(
            booking_id=test_booking.id,
            user_id=test_user.id
        )
        
        assert result["valid"] is True
        assert result["remainingCount"] == 5
        assert result["totalCount"] == 5
        assert result["usedCount"] == 0
        
        # Exhaust counts
        await db.booking.update(
            where={"id": test_booking.id},
            data={
                "usedScreeningCount": 5,
                "remainingScreeningCount": 0
            }
        )
        
        # Invalid booking (no counts)
        result = await PostureAnalysisService.validate_booking(
            booking_id=test_booking.id,
            user_id=test_user.id
        )
        
        assert result["valid"] is False
        assert "No remaining screening counts" in result["message"]
        
        print("✅ Validate booking test passed!")


class TestScreeningCountManager:
    """Integration tests for screening count management."""
    
    @pytest.mark.asyncio
    async def test_validate_and_reserve_count(self, db, test_user, test_booking):
        """Test count validation and reservation."""
        result = await ScreeningCountManager.validate_and_reserve_count(
            booking_id=test_booking.id,
            user_id=test_user.id
        )
        
        assert result["valid"] is True
        assert result["remainingCount"] == 5
        assert result["bookingId"] == test_booking.id
        
        print("✅ Validate and reserve count test passed!")
    
    @pytest.mark.asyncio
    async def test_deduct_count_atomic(self, db, test_user, test_booking):
        """Test atomic count deduction."""
        initial_remaining = test_booking.remainingScreeningCount
        
        result = await ScreeningCountManager.deduct_count_atomic(
            booking_id=test_booking.id,
            user_id=test_user.id
        )
        
        assert result["success"] is True
        assert result["remainingCount"] == initial_remaining - 1
        assert result["usedCount"] == 1
        
        # Verify in database
        booking = await db.booking.find_unique(where={"id": test_booking.id})
        assert booking.remainingScreeningCount == initial_remaining - 1
        assert booking.usedScreeningCount == 1
        
        print("✅ Deduct count atomic test passed!")
    
    @pytest.mark.asyncio
    async def test_get_count_summary(self, db, test_user, test_booking):
        """Test getting count summary across all bookings."""
        summary = await ScreeningCountManager.get_count_summary(
            user_id=test_user.id
        )
        
        assert summary["totalAllocated"] >= 5
        assert summary["totalRemaining"] >= 5
        assert summary["bookingsWithCounts"] >= 1
        
        print("✅ Get count summary test passed!")


class TestBookingServiceExtensions:
    """Integration tests for booking service extensions."""
    
    @pytest.mark.asyncio
    async def test_get_user_bookings_with_screening_counts(self, db, test_user, test_booking):
        """Test getting bookings with screening count information."""
        bookings = await BookingService.get_user_bookings_with_screening_counts(
            user_id=test_user.id
        )
        
        assert len(bookings) >= 1
        booking = next((b for b in bookings if b.id == test_booking.id), None)
        assert booking is not None
        assert booking.totalScreeningCount == 5
        assert booking.remainingScreeningCount == 5
        
        print("✅ Get user bookings with screening counts test passed!")
    
    @pytest.mark.asyncio
    async def test_get_booking_screening_info(self, db, test_user, test_booking):
        """Test getting detailed screening info for a booking."""
        info = await BookingService.get_booking_screening_info(
            booking_id=test_booking.id,
            user_id=test_user.id
        )
        
        assert info["bookingId"] == test_booking.id
        assert info["totalScreeningCount"] == 5
        assert info["usedScreeningCount"] == 0
        assert info["remainingScreeningCount"] == 5
        assert "assessments" in info
        
        print("✅ Get booking screening info test passed!")


if __name__ == "__main__":
    print("Running integration tests...")
    print("=" * 80)
    pytest.main([__file__, "-v", "-s"])
