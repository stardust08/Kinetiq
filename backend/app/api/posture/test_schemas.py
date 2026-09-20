"""
Unit tests for posture analysis schemas.

Tests Pydantic model validation, field constraints, and serialization.
"""

import pytest
from datetime import datetime, timedelta
from pydantic import ValidationError
from app.api.posture.schemas import (
    StartAnalysisRequest,
    ProcessFrameRequest,
    FinalizeAnalysisRequest,
    CancelAnalysisRequest,
    StartAnalysisResponse,
    ProcessFrameResponse,
    PostureMetrics,
    PostureAnalysisResponse,
    ValidateBookingResponse,
    CancelAnalysisResponse,
    ScreeningCountInfo,
    AssessmentListResponse
)


class TestRequestSchemas:
    """Test request schema validation."""
    
    def test_start_analysis_request_valid(self):
        """Test valid StartAnalysisRequest."""
        data = {"bookingId": "booking-123"}
        request = StartAnalysisRequest(**data)
        assert request.bookingId == "booking-123"
    
    def test_start_analysis_request_missing_booking_id(self):
        """Test StartAnalysisRequest with missing bookingId."""
        with pytest.raises(ValidationError) as exc_info:
            StartAnalysisRequest()
        assert "bookingId" in str(exc_info.value)
    
    def test_process_frame_request_valid(self):
        """Test valid ProcessFrameRequest."""
        data = {
            "sessionId": "session-456",
            "frameData": "base64encodeddata",
            "frameNumber": 1
        }
        request = ProcessFrameRequest(**data)
        assert request.sessionId == "session-456"
        assert request.frameData == "base64encodeddata"
        assert request.frameNumber == 1
    
    def test_process_frame_request_invalid_frame_number(self):
        """Test ProcessFrameRequest with invalid frame number."""
        # Frame number too low
        with pytest.raises(ValidationError):
            ProcessFrameRequest(
                sessionId="session-456",
                frameData="data",
                frameNumber=0
            )
        
        # Frame number too high
        with pytest.raises(ValidationError):
            ProcessFrameRequest(
                sessionId="session-456",
                frameData="data",
                frameNumber=501
            )
    
    def test_process_frame_request_empty_frame_data(self):
        """Test ProcessFrameRequest with empty frame data."""
        with pytest.raises(ValidationError):
            ProcessFrameRequest(
                sessionId="session-456",
                frameData="",
                frameNumber=1
            )
    
    def test_finalize_analysis_request_valid(self):
        """Test valid FinalizeAnalysisRequest."""
        data = {
            "sessionId": "session-456",
            "bookingId": "booking-123",
            "landmarksData": {
                "samples": [],
                "totalFrames": 150
            }
        }
        request = FinalizeAnalysisRequest(**data)
        assert request.sessionId == "session-456"
        assert request.bookingId == "booking-123"
        assert "samples" in request.landmarksData
    
    def test_finalize_analysis_request_missing_fields(self):
        """Test FinalizeAnalysisRequest with missing required fields."""
        with pytest.raises(ValidationError):
            FinalizeAnalysisRequest(sessionId="session-456")
    
    def test_cancel_analysis_request_valid(self):
        """Test valid CancelAnalysisRequest."""
        data = {"sessionId": "session-456"}
        request = CancelAnalysisRequest(**data)
        assert request.sessionId == "session-456"


class TestResponseSchemas:
    """Test response schema validation and serialization."""
    
    def test_screening_count_info_valid(self):
        """Test valid ScreeningCountInfo."""
        data = {
            "totalCount": 10,
            "usedCount": 3,
            "remainingCount": 7
        }
        info = ScreeningCountInfo(**data)
        assert info.totalCount == 10
        assert info.usedCount == 3
        assert info.remainingCount == 7
    
    def test_start_analysis_response_valid(self):
        """Test valid StartAnalysisResponse."""
        expires_at = datetime.utcnow() + timedelta(minutes=15)
        data = {
            "sessionId": "session-456",
            "bookingId": "booking-123",
            "remainingCount": 7,
            "expiresAt": expires_at
        }
        response = StartAnalysisResponse(**data)
        assert response.sessionId == "session-456"
        assert response.remainingCount == 7
        assert response.expiresAt == expires_at
    
    def test_process_frame_response_valid(self):
        """Test valid ProcessFrameResponse."""
        data = {
            "landmarks": {"pose": {"0": [100, 200, 0.5, 0.95]}},
            "visibility": 0.95,
            "progress": 0.02,
            "message": "Frame processed"
        }
        response = ProcessFrameResponse(**data)
        assert response.visibility == 0.95
        assert response.progress == 0.02
        assert response.message == "Frame processed"
    
    def test_process_frame_response_visibility_range(self):
        """Test ProcessFrameResponse visibility must be 0.0-1.0."""
        # Valid range
        ProcessFrameResponse(visibility=0.0, progress=0.5)
        ProcessFrameResponse(visibility=1.0, progress=0.5)
        
        # Invalid range
        with pytest.raises(ValidationError):
            ProcessFrameResponse(visibility=-0.1, progress=0.5)
        
        with pytest.raises(ValidationError):
            ProcessFrameResponse(visibility=1.1, progress=0.5)
    
    def test_process_frame_response_progress_range(self):
        """Test ProcessFrameResponse progress must be 0.0-1.0."""
        # Valid range
        ProcessFrameResponse(visibility=0.9, progress=0.0)
        ProcessFrameResponse(visibility=0.9, progress=1.0)
        
        # Invalid range
        with pytest.raises(ValidationError):
            ProcessFrameResponse(visibility=0.9, progress=-0.1)
        
        with pytest.raises(ValidationError):
            ProcessFrameResponse(visibility=0.9, progress=1.1)
    
    def test_posture_metrics_all_fields(self):
        """Test PostureMetrics with all 33 fields."""
        data = {
            # Global Posture (8)
            "fhdPixels": 45.2,
            "cervicalAngle": 42.5,
            "headLateralFlexion": 2.3,
            "headRotation": 1.5,
            "thoracicKyphosisAngle": 38.0,
            "lumbarLordosisAngle": 42.0,
            "trunkLateralShift": 3.2,
            "trunkAngle": 1.8,
            # Shoulder & Arm (6)
            "leftShoulderAngle": 85.0,
            "rightShoulderAngle": 87.0,
            "shoulderHeightDiff": 2.5,
            "roundedShoulderAngle": 12.0,
            "leftElbowAngle": 175.0,
            "rightElbowAngle": 176.0,
            # Pelvis & Hip (5)
            "leftHipAngle": 178.0,
            "rightHipAngle": 179.0,
            "pelvicObliquity": 1.5,
            "pelvicTiltAngle": 8.0,
            "hipHeightDiff": 1.2,
            # Lower Extremity (9)
            "leftKneeAngle": 180.0,
            "rightKneeAngle": 181.0,
            "kneeVarusValgus": 2.0,
            "kneeFlexionNeutral": 1.0,
            "qAngleLeft": 15.0,
            "qAngleRight": 14.5,
            "footProgressionAngle": 8.0,
            "pronationSupinationLeft": 3.0,
            "pronationSupinationRight": 2.5,
            # Body Proportions (7)
            "shoulderWidth": 450.0,
            "hipWidth": 320.0,
            "torsoLength": 520.0,
            "leftArmLength": 680.0,
            "rightArmLength": 682.0,
            "leftLegLength": 920.0,
            "rightLegLength": 918.0
        }
        metrics = PostureMetrics(**data)
        assert metrics.fhdPixels == 45.2
        assert metrics.cervicalAngle == 42.5
        assert metrics.leftLegLength == 920.0
        assert metrics.rightLegLength == 918.0
    
    def test_posture_metrics_absent_fields_are_none_not_zero(self):
        """
        A partial metric set is VALID, and the absent metrics are None.

        This assertion used to be its opposite - that a missing field raises. Every
        field on PostureMetrics was made Optional on purpose: a metric that could not be
        measured, because the capture view was missing or too few frames were usable, is
        reported as null. Coercing it to 0.0 would make an unmeasurable metric
        indistinguishable from a genuine zero, and 0.0 is a plausible-looking reading
        for most of these - a clinician has no way to tell the two apart.

        So the requirement is now the reverse of what was written here, and the thing
        worth guarding is that the absent values come back as None.
        """
        metrics = PostureMetrics(fhdPixels=45.2)

        assert metrics.fhdPixels == 45.2
        for field in ("cervicalAngle", "trunkAngle", "pelvicObliquity", "leftKneeAngle"):
            assert getattr(metrics, field) is None, (
                f"{field} was not supplied and came back as "
                f"{getattr(metrics, field)!r} rather than None"
            )
    
    def test_posture_analysis_response_valid(self):
        """Test valid PostureAnalysisResponse."""
        metrics_data = {
            "fhdPixels": 45.2, "cervicalAngle": 42.5,
            "headLateralFlexion": 2.3, "headRotation": 1.5,
            "thoracicKyphosisAngle": 38.0, "lumbarLordosisAngle": 42.0,
            "trunkLateralShift": 3.2, "trunkAngle": 1.8,
            "leftShoulderAngle": 85.0, "rightShoulderAngle": 87.0,
            "shoulderHeightDiff": 2.5, "roundedShoulderAngle": 12.0,
            "leftElbowAngle": 175.0, "rightElbowAngle": 176.0,
            "leftHipAngle": 178.0, "rightHipAngle": 179.0,
            "pelvicObliquity": 1.5, "pelvicTiltAngle": 8.0,
            "hipHeightDiff": 1.2, "leftKneeAngle": 180.0,
            "rightKneeAngle": 181.0, "kneeVarusValgus": 2.0,
            "kneeFlexionNeutral": 1.0, "qAngleLeft": 15.0,
            "qAngleRight": 14.5, "footProgressionAngle": 8.0,
            "pronationSupinationLeft": 3.0, "pronationSupinationRight": 2.5,
            "shoulderWidth": 450.0, "hipWidth": 320.0,
            "torsoLength": 520.0, "leftArmLength": 680.0,
            "rightArmLength": 682.0, "leftLegLength": 920.0,
            "rightLegLength": 918.0
        }
        
        data = {
            "id": "analysis-789",
            "userId": "user-123",
            "bookingId": "booking-456",
            "analysisDate": datetime.utcnow(),
            "metrics": metrics_data,
            "landmarksData": {"samples": []},
            "status": "completed",
            "normalRanges": {},
            "deviations": {}
        }
        response = PostureAnalysisResponse(**data)
        assert response.id == "analysis-789"
        assert response.status == "completed"
        assert response.metrics.fhdPixels == 45.2
    
    def test_validate_booking_response_valid(self):
        """Test valid ValidateBookingResponse."""
        data = {
            "valid": True,
            "remainingCount": 7,
            "totalCount": 10,
            "usedCount": 3,
            "message": None
        }
        response = ValidateBookingResponse(**data)
        assert response.valid is True
        assert response.remainingCount == 7
    
    def test_validate_booking_response_invalid(self):
        """Test ValidateBookingResponse for invalid booking."""
        data = {
            "valid": False,
            "remainingCount": 0,
            "totalCount": 10,
            "usedCount": 10,
            "message": "No remaining screening counts"
        }
        response = ValidateBookingResponse(**data)
        assert response.valid is False
        assert response.message == "No remaining screening counts"
    
    def test_cancel_analysis_response_valid(self):
        """Test valid CancelAnalysisResponse."""
        data = {
            "message": "Analysis cancelled successfully",
            "sessionId": "session-456"
        }
        response = CancelAnalysisResponse(**data)
        assert response.message == "Analysis cancelled successfully"
        assert response.sessionId == "session-456"
    
    def test_assessment_list_response_valid(self):
        """Test valid AssessmentListResponse."""
        data = {
            "data": [],
            "total": 0,
            "limit": 10,
            "offset": 0
        }
        response = AssessmentListResponse(**data)
        assert response.total == 0
        assert response.limit == 10
        assert response.offset == 0


class TestSchemaSerialization:
    """Test schema serialization to JSON."""
    
    def test_start_analysis_request_serialization(self):
        """Test StartAnalysisRequest serialization."""
        request = StartAnalysisRequest(bookingId="booking-123")
        json_data = request.model_dump()
        assert json_data["bookingId"] == "booking-123"
    
    def test_posture_metrics_serialization(self):
        """Test PostureMetrics serialization."""
        data = {
            "fhdPixels": 45.2, "cervicalAngle": 42.5,
            "headLateralFlexion": 2.3, "headRotation": 1.5,
            "thoracicKyphosisAngle": 38.0, "lumbarLordosisAngle": 42.0,
            "trunkLateralShift": 3.2, "trunkAngle": 1.8,
            "leftShoulderAngle": 85.0, "rightShoulderAngle": 87.0,
            "shoulderHeightDiff": 2.5, "roundedShoulderAngle": 12.0,
            "leftElbowAngle": 175.0, "rightElbowAngle": 176.0,
            "leftHipAngle": 178.0, "rightHipAngle": 179.0,
            "pelvicObliquity": 1.5, "pelvicTiltAngle": 8.0,
            "hipHeightDiff": 1.2, "leftKneeAngle": 180.0,
            "rightKneeAngle": 181.0, "kneeVarusValgus": 2.0,
            "kneeFlexionNeutral": 1.0, "qAngleLeft": 15.0,
            "qAngleRight": 14.5, "footProgressionAngle": 8.0,
            "pronationSupinationLeft": 3.0, "pronationSupinationRight": 2.5,
            "shoulderWidth": 450.0, "hipWidth": 320.0,
            "torsoLength": 520.0, "leftArmLength": 680.0,
            "rightArmLength": 682.0, "leftLegLength": 920.0,
            "rightLegLength": 918.0
        }
        metrics = PostureMetrics(**data)
        json_data = metrics.model_dump()
        
        # Verify all 33 metric fields are present and correct
        assert json_data["fhdPixels"] == 45.2
        assert json_data["cervicalAngle"] == 42.5
        assert json_data["leftLegLength"] == 920.0
        assert json_data["rightLegLength"] == 918.0
        
        # Verify key fields from each category
        assert "thoracicKyphosisAngle" in json_data
        assert "leftShoulderAngle" in json_data
        assert "pelvicObliquity" in json_data
        assert "qAngleLeft" in json_data
        assert "shoulderWidth" in json_data
    
    def test_datetime_serialization(self):
        """Test datetime field serialization."""
        now = datetime.utcnow()
        response = StartAnalysisResponse(
            sessionId="session-456",
            bookingId="booking-123",
            remainingCount=7,
            expiresAt=now
        )
        json_data = response.model_dump()
        assert "expiresAt" in json_data
        # Datetime should be serialized
        assert json_data["expiresAt"] == now


class TestSchemaExamples:
    """Test that schema examples are valid."""
    
    def test_start_analysis_request_example(self):
        """Test StartAnalysisRequest example is valid."""
        example = StartAnalysisRequest.model_config["json_schema_extra"]["example"]
        request = StartAnalysisRequest(**example)
        assert request.bookingId == example["bookingId"]
    
    def test_process_frame_request_example(self):
        """Test ProcessFrameRequest example is valid."""
        example = ProcessFrameRequest.model_config["json_schema_extra"]["example"]
        request = ProcessFrameRequest(**example)
        assert request.sessionId == example["sessionId"]
    
    def test_finalize_analysis_request_example(self):
        """Test FinalizeAnalysisRequest example is valid."""
        example = FinalizeAnalysisRequest.model_config["json_schema_extra"]["example"]
        request = FinalizeAnalysisRequest(**example)
        assert request.sessionId == example["sessionId"]
    
    def test_cancel_analysis_request_example(self):
        """Test CancelAnalysisRequest example is valid."""
        example = CancelAnalysisRequest.model_config["json_schema_extra"]["example"]
        request = CancelAnalysisRequest(**example)
        assert request.sessionId == example["sessionId"]
