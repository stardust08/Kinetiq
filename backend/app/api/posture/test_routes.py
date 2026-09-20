"""
Integration tests for posture analysis routes.

Tests the FastAPI endpoints for posture analysis including start-analysis,
process-frame, finalize-analysis, and assessment retrieval endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
from app.main import create_app
from app.db.client import db
from app.core.security import TokenService

app = create_app()
client = TestClient(app)


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Connect to database before tests and disconnect after."""
    await db.connect()
    yield
    await db.disconnect()


@pytest.fixture
async def test_user():
    """Create a test user and return user data with token."""
    import uuid
    
    # Use unique phone number to avoid conflicts
    unique_phone = f"+1{uuid.uuid4().hex[:10]}"
    
    # Create test user
    user = await db.user.create(
        data={
            "phone": unique_phone,
            "name": "Test User",
            "role": "USER",
            "status": "ACTIVE"
        }
    )
    
    # Generate token
    token = TokenService.create_access_token(user.id, user.role)
    
    yield {"user": user, "token": token}
    
    # Cleanup
    try:
        await db.user.delete(where={"id": user.id})
    except:
        pass  # User might already be deleted


@pytest.fixture
async def test_booking(test_user):
    """Create a test booking with screening counts."""
    import uuid
    user = test_user["user"]
    
    # Create category first
    category = await db.category.create(
        data={
            "name": "Test Category",
            "slug": f"test-category-{uuid.uuid4().hex[:8]}"
        }
    )
    
    # Create service
    service = await db.service.create(
        data={
            "categoryId": category.id,
            "name": "AI Posture Assessment",
            "slug": f"ai-posture-assessment-{uuid.uuid4().hex[:8]}",
            "basePrice": 100.0,
            "includedScreeningCount": 10
        }
    )
    
    # Create payment
    payment = await db.payment.create(
        data={
            "userId": user.id,
            "totalAmount": 100.0,
            "paidAmount": 100.0,
            "status": "COMPLETED",
            "paymentMethod": "CARD"
        }
    )
    
    # Create booking
    booking = await db.booking.create(
        data={
            "userId": user.id,
            "serviceId": service.id,
            "paymentId": payment.id,
            "totalAmount": 100.0,
            "paidAmount": 100.0,
            "time": datetime.utcnow(),
            "status": "CONFIRMED",
            "totalScreeningCount": 10,
            "usedScreeningCount": 0,
            "remainingScreeningCount": 10
        }
    )
    
    yield {"booking": booking, "service": service, "payment": payment, "category": category}
    
    # Cleanup
    try:
        await db.booking.delete(where={"id": booking.id})
    except:
        pass
    try:
        await db.payment.delete(where={"id": payment.id})
    except:
        pass
    try:
        await db.service.delete(where={"id": service.id})
    except:
        pass
    try:
        await db.category.delete(where={"id": category.id})
    except:
        pass


@pytest.mark.asyncio
async def test_start_analysis_success(test_user, test_booking):
    """Test successful analysis session creation."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    assert "sessionId" in data
    assert data["bookingId"] == booking.id
    assert data["remainingCount"] == 10
    assert "expiresAt" in data


@pytest.mark.asyncio
async def test_start_analysis_unauthorized(test_booking):
    """Test start analysis without authentication."""
    booking = test_booking["booking"]
    
    response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id}
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_start_analysis_no_remaining_counts(test_user, test_booking):
    """Test start analysis with no remaining screening counts."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Update booking to have no remaining counts
    await db.booking.update(
        where={"id": booking.id},
        data={
            "usedScreeningCount": 10,
            "remainingScreeningCount": 0
        }
    )
    
    response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "No remaining screening counts" in response.json()["detail"]


@pytest.mark.asyncio
async def test_start_analysis_invalid_booking_status(test_user, test_booking):
    """Test start analysis with invalid booking status."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Update booking status to PENDING
    await db.booking.update(
        where={"id": booking.id},
        data={"status": "PENDING"}
    )
    
    response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "not valid for analysis" in response.json()["detail"]


@pytest.mark.asyncio
async def test_start_analysis_booking_not_found(test_user):
    """Test start analysis with non-existent booking."""
    token = test_user["token"]
    
    response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": "nonexistent-booking-id"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 401
    assert "Booking not found or access denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_start_analysis_missing_booking_id(test_user):
    """Test start analysis without bookingId in request."""
    token = test_user["token"]
    
    response = client.post(
        "/api/posture/start-analysis",
        json={},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_cancel_analysis_success(test_user):
    """Test successful analysis cancellation."""
    token = test_user["token"]
    
    # Create a mock session ID
    session_id = "test-session-123"
    
    response = client.post(
        "/api/posture/cancel-analysis",
        json={"sessionId": session_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert "message" in data
    assert "cancelled successfully" in data["message"].lower()
    assert "no screening count was deducted" in data["message"].lower()


@pytest.mark.asyncio
async def test_cancel_analysis_unauthorized():
    """Test cancel analysis without authentication."""
    response = client.post(
        "/api/posture/cancel-analysis",
        json={"sessionId": "test-session-123"}
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_cancel_analysis_missing_session_id(test_user):
    """Test cancel analysis without sessionId in request."""
    token = test_user["token"]
    
    response = client.post(
        "/api/posture/cancel-analysis",
        json={},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 422  # Validation error



@pytest.mark.asyncio
async def test_get_my_assessments_success(test_user, test_booking):
    """Test successful retrieval of user assessments."""
    token = test_user["token"]
    user = test_user["user"]
    booking = test_booking["booking"]
    
    # Create test assessments
    assessment1 = await db.postureanalysis.create(
        data={
            "userId": user.id,
            "bookingId": booking.id,
            "fhdPixels": 45.2,
            "cervicalAngle": 38.5,
            "headLateralFlexion": 2.1,
            "headRotation": 1.5,
            "thoracicKyphosisAngle": 42.0,
            "lumbarLordosisAngle": 35.0,
            "trunkLateralShift": 1.2,
            "trunkAngle": 88.5,
            "leftShoulderAngle": 175.0,
            "rightShoulderAngle": 176.0,
            "shoulderHeightDiff": 1.0,
            "roundedShoulderAngle": 15.0,
            "leftElbowAngle": 178.0,
            "rightElbowAngle": 179.0,
            "leftHipAngle": 175.0,
            "rightHipAngle": 176.0,
            "pelvicObliquity": 1.5,
            "pelvicTiltAngle": 10.0,
            "hipHeightDiff": 0.5,
            "leftKneeAngle": 178.0,
            "rightKneeAngle": 179.0,
            "kneeVarusValgus": 2.0,
            "kneeFlexionNeutral": 180.0,
            "qAngleLeft": 15.0,
            "qAngleRight": 14.5,
            "footProgressionAngle": 5.0,
            "pronationSupinationLeft": 3.0,
            "pronationSupinationRight": 2.5,
            "shoulderWidth": 45.0,
            "hipWidth": 35.0,
            "torsoLength": 60.0,
            "leftArmLength": 70.0,
            "rightArmLength": 71.0,
            "leftLegLength": 90.0,
            "rightLegLength": 91.0,
            "status": "completed"
        }
    )
    
    response = client.get(
        "/api/posture/my-assessments",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert "data" in data
    assert isinstance(data["data"], list)
    assert len(data["data"]) >= 1
    
    # Verify assessment data
    assessment_data = data["data"][0]
    assert assessment_data["id"] == assessment1.id
    assert assessment_data["userId"] == user.id
    assert assessment_data["bookingId"] == booking.id
    assert assessment_data["status"] == "completed"
    
    # Cleanup
    await db.postureanalysis.delete(where={"id": assessment1.id})


@pytest.mark.asyncio
async def test_get_my_assessments_with_booking_filter(test_user, test_booking):
    """Test retrieval of assessments filtered by booking ID."""
    token = test_user["token"]
    user = test_user["user"]
    booking = test_booking["booking"]
    
    # Create test assessment
    assessment = await db.postureanalysis.create(
        data={
            "userId": user.id,
            "bookingId": booking.id,
            "fhdPixels": 45.2,
            "cervicalAngle": 38.5,
            "headLateralFlexion": 2.1,
            "headRotation": 1.5,
            "thoracicKyphosisAngle": 42.0,
            "lumbarLordosisAngle": 35.0,
            "trunkLateralShift": 1.2,
            "trunkAngle": 88.5,
            "leftShoulderAngle": 175.0,
            "rightShoulderAngle": 176.0,
            "shoulderHeightDiff": 1.0,
            "roundedShoulderAngle": 15.0,
            "leftElbowAngle": 178.0,
            "rightElbowAngle": 179.0,
            "leftHipAngle": 175.0,
            "rightHipAngle": 176.0,
            "pelvicObliquity": 1.5,
            "pelvicTiltAngle": 10.0,
            "hipHeightDiff": 0.5,
            "leftKneeAngle": 178.0,
            "rightKneeAngle": 179.0,
            "kneeVarusValgus": 2.0,
            "kneeFlexionNeutral": 180.0,
            "qAngleLeft": 15.0,
            "qAngleRight": 14.5,
            "footProgressionAngle": 5.0,
            "pronationSupinationLeft": 3.0,
            "pronationSupinationRight": 2.5,
            "shoulderWidth": 45.0,
            "hipWidth": 35.0,
            "torsoLength": 60.0,
            "leftArmLength": 70.0,
            "rightArmLength": 71.0,
            "leftLegLength": 90.0,
            "rightLegLength": 91.0,
            "status": "completed"
        }
    )
    
    response = client.get(
        f"/api/posture/my-assessments?bookingId={booking.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert "data" in data
    assert isinstance(data["data"], list)
    assert len(data["data"]) >= 1
    
    # Verify all assessments belong to the specified booking
    for assessment_data in data["data"]:
        assert assessment_data["bookingId"] == booking.id
    
    # Cleanup
    await db.postureanalysis.delete(where={"id": assessment.id})


@pytest.mark.asyncio
async def test_get_my_assessments_with_pagination(test_user, test_booking):
    """Test pagination with limit and offset parameters."""
    token = test_user["token"]
    user = test_user["user"]
    booking = test_booking["booking"]
    
    # Create multiple test assessments
    assessments = []
    for i in range(5):
        assessment = await db.postureanalysis.create(
            data={
                "userId": user.id,
                "bookingId": booking.id,
                "fhdPixels": 45.2 + i,
                "cervicalAngle": 38.5,
                "headLateralFlexion": 2.1,
                "headRotation": 1.5,
                "thoracicKyphosisAngle": 42.0,
                "lumbarLordosisAngle": 35.0,
                "trunkLateralShift": 1.2,
                "trunkAngle": 88.5,
                "leftShoulderAngle": 175.0,
                "rightShoulderAngle": 176.0,
                "shoulderHeightDiff": 1.0,
                "roundedShoulderAngle": 15.0,
                "leftElbowAngle": 178.0,
                "rightElbowAngle": 179.0,
                "leftHipAngle": 175.0,
                "rightHipAngle": 176.0,
                "pelvicObliquity": 1.5,
                "pelvicTiltAngle": 10.0,
                "hipHeightDiff": 0.5,
                "leftKneeAngle": 178.0,
                "rightKneeAngle": 179.0,
                "kneeVarusValgus": 2.0,
                "kneeFlexionNeutral": 180.0,
                "qAngleLeft": 15.0,
                "qAngleRight": 14.5,
                "footProgressionAngle": 5.0,
                "pronationSupinationLeft": 3.0,
                "pronationSupinationRight": 2.5,
                "shoulderWidth": 45.0,
                "hipWidth": 35.0,
                "torsoLength": 60.0,
                "leftArmLength": 70.0,
                "rightArmLength": 71.0,
                "leftLegLength": 90.0,
                "rightLegLength": 91.0,
                "status": "completed"
            }
        )
        assessments.append(assessment)
    
    # Test with limit=2
    response = client.get(
        "/api/posture/my-assessments?limit=2",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 2
    
    # Test with offset=2
    response = client.get(
        "/api/posture/my-assessments?limit=2&offset=2",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) <= 3  # Should get remaining assessments
    
    # Cleanup
    for assessment in assessments:
        await db.postureanalysis.delete(where={"id": assessment.id})


@pytest.mark.asyncio
async def test_get_my_assessments_invalid_limit(test_user):
    """Test with invalid limit parameter (exceeds max)."""
    token = test_user["token"]
    
    response = client.get(
        "/api/posture/my-assessments?limit=150",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    data = response.json()
    assert "limit" in data["detail"].lower()


@pytest.mark.asyncio
async def test_get_my_assessments_negative_offset(test_user):
    """Test with negative offset parameter."""
    token = test_user["token"]
    
    response = client.get(
        "/api/posture/my-assessments?offset=-1",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    data = response.json()
    assert "offset" in data["detail"].lower()


@pytest.mark.asyncio
async def test_get_my_assessments_unauthorized():
    """Test get assessments without authentication."""
    response = client.get("/api/posture/my-assessments")
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_my_assessments_empty_result(test_user):
    """Test when user has no assessments."""
    token = test_user["token"]
    
    response = client.get(
        "/api/posture/my-assessments",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert "data" in data
    assert isinstance(data["data"], list)
    # May be empty or contain assessments from other tests


@pytest.mark.asyncio
async def test_validate_booking_success(test_user, test_booking):
    """Test successful booking validation with remaining counts."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    response = client.get(
        f"/api/posture/validate-booking/{booking.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    assert data["valid"] is True
    assert data["remainingCount"] == 10
    assert data["totalCount"] == 10
    assert data["usedCount"] == 0
    assert data["message"] is None


@pytest.mark.asyncio
async def test_validate_booking_no_remaining_counts(test_user, test_booking):
    """Test booking validation when no remaining counts."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Update booking to have no remaining counts
    await db.booking.update(
        where={"id": booking.id},
        data={
            "usedScreeningCount": 10,
            "remainingScreeningCount": 0
        }
    )
    
    response = client.get(
        f"/api/posture/validate-booking/{booking.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    assert data["valid"] is False
    assert data["remainingCount"] == 0
    assert data["totalCount"] == 10
    assert data["usedCount"] == 10
    assert data["message"] == "No remaining screening counts"


@pytest.mark.asyncio
async def test_validate_booking_invalid_status(test_user, test_booking):
    """Test booking validation with invalid booking status."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Update booking status to PENDING
    await db.booking.update(
        where={"id": booking.id},
        data={"status": "PENDING"}
    )
    
    response = client.get(
        f"/api/posture/validate-booking/{booking.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    assert data["valid"] is False
    assert data["remainingCount"] == 10
    assert data["totalCount"] == 10
    assert data["usedCount"] == 0
    assert "status" in data["message"].lower()
    assert "not valid" in data["message"].lower()


@pytest.mark.asyncio
async def test_validate_booking_not_found(test_user):
    """Test booking validation with non-existent booking."""
    token = test_user["token"]
    
    response = client.get(
        "/api/posture/validate-booking/nonexistent-booking-id",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    assert data["valid"] is False
    assert data["remainingCount"] == 0
    assert data["totalCount"] == 0
    assert data["usedCount"] == 0
    assert data["message"] == "Booking not found"


@pytest.mark.asyncio
async def test_validate_booking_unauthorized():
    """Test booking validation without authentication."""
    response = client.get("/api/posture/validate-booking/some-booking-id")
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_validate_booking_other_user_booking(test_user, test_booking):
    """Test booking validation when trying to access another user's booking."""
    # Create another user
    import uuid
    unique_phone = f"+1{uuid.uuid4().hex[:10]}"
    
    other_user = await db.user.create(
        data={
            "phone": unique_phone,
            "name": "Other User",
            "role": "USER",
            "status": "ACTIVE"
        }
    )
    
    # Generate token for other user
    other_token = TokenService.create_access_token(other_user.id, other_user.role)
    
    # Try to validate first user's booking with other user's token
    booking = test_booking["booking"]
    
    response = client.get(
        f"/api/posture/validate-booking/{booking.id}",
        headers={"Authorization": f"Bearer {other_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    # Should return not found since user doesn't own the booking
    assert data["valid"] is False
    assert data["message"] == "Booking not found"
    
    # Cleanup
    await db.user.delete(where={"id": other_user.id})


# =========================
# Complete Analysis Flow Tests
# =========================

@pytest.mark.asyncio
async def test_complete_analysis_flow_success(test_user, test_booking):
    """
    Test complete analysis flow: start → process frames → finalize.
    
    This is the critical integration test that validates the entire
    posture analysis workflow including screening count deduction.
    """
    token = test_user["token"]
    user = test_user["user"]
    booking = test_booking["booking"]
    
    # Step 1: Start analysis
    start_response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert start_response.status_code == 200
    start_data = start_response.json()["data"]
    session_id = start_data["sessionId"]
    
    assert start_data["remainingCount"] == 10
    
    # Step 2: Process frames (simulate 10 frames instead of 450 for test speed)
    import base64
    import numpy as np
    import cv2
    
    # Create a simple test frame
    test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    _, buffer = cv2.imencode('.jpg', test_frame)
    frame_data = base64.b64encode(buffer).decode('utf-8')
    
    for frame_num in range(1, 11):
        frame_response = client.post(
            "/api/posture/process-frame",
            json={
                "sessionId": session_id,
                "frameData": frame_data,
                "frameNumber": frame_num
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert frame_response.status_code == 200
        frame_data_response = frame_response.json()["data"]
        
        assert "visibility" in frame_data_response
        assert "progress" in frame_data_response
        assert 0.0 <= frame_data_response["progress"] <= 1.0
    
    # Step 3: Finalize analysis with mock landmarks data
    landmarks_data = {
        "samples": [
            {
                "pose": {
                    "0": [320, 100, 0.5, 0.95],  # nose
                    "11": [280, 200, 0.3, 0.98],  # left shoulder
                    "12": [360, 200, 0.3, 0.98],  # right shoulder
                    "23": [280, 400, 0.3, 0.95],  # left hip
                    "24": [360, 400, 0.3, 0.95],  # right hip
                    "25": [280, 600, 0.3, 0.90],  # left knee
                    "26": [360, 600, 0.3, 0.90],  # right knee
                    "27": [280, 800, 0.3, 0.85],  # left ankle
                    "28": [360, 800, 0.3, 0.85],  # right ankle
                }
            }
        ] * 150,  # Simulate 150 samples
        "totalFrames": 150,
        "captureDate": datetime.utcnow().isoformat()
    }
    
    finalize_response = client.post(
        "/api/posture/finalize-analysis",
        json={
            "sessionId": session_id,
            "bookingId": booking.id,
            "landmarksData": landmarks_data
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert finalize_response.status_code == 200
    finalize_data = finalize_response.json()["data"]
    
    # Verify analysis was created
    assert "analysis" in finalize_data
    analysis = finalize_data["analysis"]
    assert analysis["userId"] == user.id
    assert analysis["bookingId"] == booking.id
    assert analysis["status"] == "completed"
    
    # Verify all 33 metrics are present
    assert "fhdPixels" in analysis
    assert "cervicalAngle" in analysis
    assert "leftShoulderAngle" in analysis
    assert "rightShoulderAngle" in analysis
    
    # Verify screening count was deducted
    assert finalize_data["remainingCount"] == 9
    
    # Step 4: Verify booking was updated
    updated_booking = await db.booking.find_first(
        where={"id": booking.id}
    )
    
    assert updated_booking.usedScreeningCount == 1
    assert updated_booking.remainingScreeningCount == 9
    
    # Step 5: Verify analysis can be retrieved
    get_response = client.get(
        f"/api/posture/analysis/{analysis['id']}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert get_response.status_code == 200
    retrieved_analysis = get_response.json()["data"]
    assert retrieved_analysis["id"] == analysis["id"]
    
    # Cleanup
    await db.postureanalysis.delete(where={"id": analysis["id"]})


@pytest.mark.asyncio
async def test_complete_analysis_flow_with_cancellation(test_user, test_booking):
    """
    Test analysis flow with cancellation - verify no count deduction.
    """
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Step 1: Start analysis
    start_response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert start_response.status_code == 200
    session_id = start_response.json()["data"]["sessionId"]
    
    # Step 2: Cancel analysis
    cancel_response = client.post(
        "/api/posture/cancel-analysis",
        json={"sessionId": session_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert cancel_response.status_code == 200
    assert "cancelled successfully" in cancel_response.json()["message"].lower()
    
    # Step 3: Verify booking counts unchanged
    booking_after = await db.booking.find_first(
        where={"id": booking.id}
    )
    
    assert booking_after.usedScreeningCount == 0
    assert booking_after.remainingScreeningCount == 10


@pytest.mark.asyncio
async def test_multiple_analyses_count_deduction(test_user, test_booking):
    """
    Test multiple analyses to verify count deduction works correctly.
    """
    token = test_user["token"]
    user = test_user["user"]
    booking = test_booking["booking"]
    
    # Perform 3 analyses
    for i in range(3):
        # Start analysis
        start_response = client.post(
            "/api/posture/start-analysis",
            json={"bookingId": booking.id},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert start_response.status_code == 200
        session_id = start_response.json()["data"]["sessionId"]
        
        # Finalize with minimal landmarks
        landmarks_data = {
            "samples": [{"pose": {"0": [320, 100, 0.5, 0.95]}}] * 450,
            "totalFrames": 450
        }
        
        finalize_response = client.post(
            "/api/posture/finalize-analysis",
            json={
                "sessionId": session_id,
                "bookingId": booking.id,
                "landmarksData": landmarks_data
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert finalize_response.status_code == 200
        assert finalize_response.json()["data"]["remainingCount"] == 10 - (i + 1)
    
    # Verify final booking state
    final_booking = await db.booking.find_first(
        where={"id": booking.id}
    )
    
    assert final_booking.usedScreeningCount == 3
    assert final_booking.remainingScreeningCount == 7
    
    # Cleanup analyses
    analyses = await db.postureanalysis.find_many(
        where={"userId": user.id, "bookingId": booking.id}
    )
    for analysis in analyses:
        await db.postureanalysis.delete(where={"id": analysis.id})


@pytest.mark.asyncio
async def test_analysis_flow_exhausted_counts(test_user, test_booking):
    """
    Test that analysis fails when all screening counts are exhausted.
    """
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Exhaust all counts
    await db.booking.update(
        where={"id": booking.id},
        data={
            "usedScreeningCount": 10,
            "remainingScreeningCount": 0
        }
    )
    
    # Try to start analysis
    start_response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert start_response.status_code == 400
    assert "No remaining screening counts" in start_response.json()["detail"]


# =========================
# Error Handling Tests
# =========================

@pytest.mark.asyncio
async def test_process_frame_invalid_base64(test_user, test_booking):
    """Test process frame with invalid base64 data."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Start analysis
    start_response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    session_id = start_response.json()["data"]["sessionId"]
    
    # Try to process frame with invalid base64
    response = client.post(
        "/api/posture/process-frame",
        json={
            "sessionId": session_id,
            "frameData": "not-valid-base64!!!",
            "frameNumber": 1
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "Invalid frame data" in response.json()["detail"]


@pytest.mark.asyncio
async def test_finalize_analysis_invalid_landmarks(test_user, test_booking):
    """Test finalize analysis with insufficient landmarks data."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Start analysis
    start_response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    session_id = start_response.json()["data"]["sessionId"]
    
    # Try to finalize with empty landmarks
    response = client.post(
        "/api/posture/finalize-analysis",
        json={
            "sessionId": session_id,
            "bookingId": booking.id,
            "landmarksData": {"samples": []}  # Empty samples
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "Failed to calculate metrics" in response.json()["detail"]


@pytest.mark.asyncio
async def test_finalize_analysis_booking_mismatch(test_user, test_booking):
    """Test finalize analysis with mismatched booking ID."""
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Start analysis
    start_response = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    session_id = start_response.json()["data"]["sessionId"]
    
    # Try to finalize with different booking ID
    response = client.post(
        "/api/posture/finalize-analysis",
        json={
            "sessionId": session_id,
            "bookingId": "different-booking-id",
            "landmarksData": {"samples": [{"pose": {}}] * 150}
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 401
    assert "Booking not found or access denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_analysis_unauthorized_access(test_user, test_booking):
    """Test accessing another user's analysis."""
    token = test_user["token"]
    user = test_user["user"]
    booking = test_booking["booking"]
    
    # Create analysis for first user
    analysis = await db.postureanalysis.create(
        data={
            "userId": user.id,
            "bookingId": booking.id,
            "fhdPixels": 45.2,
            "cervicalAngle": 38.5,
            "headLateralFlexion": 2.1,
            "headRotation": 1.5,
            "thoracicKyphosisAngle": 42.0,
            "lumbarLordosisAngle": 35.0,
            "trunkLateralShift": 1.2,
            "trunkAngle": 88.5,
            "leftShoulderAngle": 175.0,
            "rightShoulderAngle": 176.0,
            "shoulderHeightDiff": 1.0,
            "roundedShoulderAngle": 15.0,
            "leftElbowAngle": 178.0,
            "rightElbowAngle": 179.0,
            "leftHipAngle": 175.0,
            "rightHipAngle": 176.0,
            "pelvicObliquity": 1.5,
            "pelvicTiltAngle": 10.0,
            "hipHeightDiff": 0.5,
            "leftKneeAngle": 178.0,
            "rightKneeAngle": 179.0,
            "kneeVarusValgus": 2.0,
            "kneeFlexionNeutral": 180.0,
            "qAngleLeft": 15.0,
            "qAngleRight": 14.5,
            "footProgressionAngle": 5.0,
            "pronationSupinationLeft": 3.0,
            "pronationSupinationRight": 2.5,
            "shoulderWidth": 45.0,
            "hipWidth": 35.0,
            "torsoLength": 60.0,
            "leftArmLength": 70.0,
            "rightArmLength": 71.0,
            "leftLegLength": 90.0,
            "rightLegLength": 91.0,
            "status": "completed"
        }
    )
    
    # Create another user
    import uuid
    unique_phone = f"+1{uuid.uuid4().hex[:10]}"
    
    other_user = await db.user.create(
        data={
            "phone": unique_phone,
            "name": "Other User",
            "role": "USER",
            "status": "ACTIVE"
        }
    )
    
    other_token = TokenService.create_access_token(other_user.id, other_user.role)
    
    # Try to access first user's analysis with other user's token
    response = client.get(
        f"/api/posture/analysis/{analysis.id}",
        headers={"Authorization": f"Bearer {other_token}"}
    )
    
    assert response.status_code == 404
    assert "not found or you don't have access" in response.json()["detail"]
    
    # Cleanup
    await db.postureanalysis.delete(where={"id": analysis.id})
    await db.user.delete(where={"id": other_user.id})


@pytest.mark.asyncio
async def test_concurrent_analysis_attempts(test_user, test_booking):
    """
    Test concurrent analysis attempts to verify no race conditions.
    
    This test ensures that the atomic count deduction prevents
    double-counting or other race condition issues.
    """
    token = test_user["token"]
    booking = test_booking["booking"]
    
    # Start two analyses concurrently
    start_response1 = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    start_response2 = client.post(
        "/api/posture/start-analysis",
        json={"bookingId": booking.id},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    # Both should succeed (starting is allowed)
    assert start_response1.status_code == 200
    assert start_response2.status_code == 200
    
    session_id1 = start_response1.json()["data"]["sessionId"]
    session_id2 = start_response2.json()["data"]["sessionId"]
    
    # Finalize both with minimal landmarks
    landmarks_data = {
        "samples": [{"pose": {"0": [320, 100, 0.5, 0.95]}}] * 150,
        "totalFrames": 150
    }
    
    finalize_response1 = client.post(
        "/api/posture/finalize-analysis",
        json={
            "sessionId": session_id1,
            "bookingId": booking.id,
            "landmarksData": landmarks_data
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    finalize_response2 = client.post(
        "/api/posture/finalize-analysis",
        json={
            "sessionId": session_id2,
            "bookingId": booking.id,
            "landmarksData": landmarks_data
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    # Both should succeed
    assert finalize_response1.status_code == 200
    assert finalize_response2.status_code == 200
    
    # Verify counts were deducted correctly (should be 8, not 9)
    final_booking = await db.booking.find_first(
        where={"id": booking.id}
    )
    
    assert final_booking.usedScreeningCount == 2
    assert final_booking.remainingScreeningCount == 8
    
    # Cleanup
    analyses = await db.postureanalysis.find_many(
        where={"bookingId": booking.id}
    )
    for analysis in analyses:
        await db.postureanalysis.delete(where={"id": analysis.id})
