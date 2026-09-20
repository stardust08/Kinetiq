"""
Posture Analysis schemas for request/response validation.

This module contains Pydantic models for posture analysis endpoints including
analysis session management, frame processing, and results retrieval.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime


# =========================
# Request Schemas
# =========================

class StartAnalysisRequest(BaseModel):
    """Request to start a new posture analysis session."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "bookingId": "booking-uuid-123"
            }
        }
    )
    
    bookingId: str = Field(
        ...,
        description="Booking ID to use for this analysis. Must have remaining screening counts."
    )


class ProcessFrameRequest(BaseModel):
    """Request to process a single video frame."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sessionId": "session-uuid-456",
                "frameData": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "frameNumber": 1,
                "poseType": "front"
            }
        }
    )
    
    sessionId: str = Field(
        ...,
        description="Analysis session ID returned from start-analysis endpoint"
    )
    frameData: str = Field(
        ...,
        description="Base64 encoded image data (JPEG or PNG format)",
        min_length=1
    )
    frameNumber: int = Field(
        ...,
        description="Frame sequence number (1-240 for 8 second capture across 4 poses at 30 FPS)",
        ge=1,
        le=500
    )
    poseType: Optional[str] = Field(
        "front",
        description="Type of pose being captured: 'front', 'leftside', 'rightside', or 'back'",
        pattern="^(front|leftside|rightside|back)$"
    )


class FinalizeAnalysisRequest(BaseModel):
    """Request to finalize and save analysis results."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sessionId": "session-uuid-456",
                "bookingId": "booking-uuid-123",
                "landmarksData": {
                    "poses": {
                        "front": {
                            "samples": [],
                            "frameCount": 60,
                            "captureDate": "2024-01-01T12:00:00Z"
                        },
                        "leftside": {
                            "samples": [],
                            "frameCount": 60,
                            "captureDate": "2024-01-01T12:02:00Z"
                        },
                        "rightside": {
                            "samples": [],
                            "frameCount": 60,
                            "captureDate": "2024-01-01T12:03:00Z"
                        },
                        "back": {
                            "samples": [],
                            "frameCount": 60,
                            "captureDate": "2024-01-01T12:04:00Z"
                        }
                    },
                    "totalFrames": 240,
                    "capturedPoses": "front,leftside,rightside,back"
                }
            }
        }
    )
    
    sessionId: str = Field(
        ...,
        description="Analysis session ID"
    )
    bookingId: str = Field(
        ...,
        description="Booking ID associated with this analysis"
    )
    landmarksData: Dict[str, Any] = Field(
        ...,
        description="Collected landmarks data from all processed frames, organized by pose type"
    )


class CancelAnalysisRequest(BaseModel):
    """Request to cancel analysis session without deducting screening count."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sessionId": "session-uuid-456"
            }
        }
    )
    
    sessionId: str = Field(
        ...,
        description="Analysis session ID to cancel"
    )


# =========================
# Response Schemas
# =========================

class ScreeningCountInfo(BaseModel):
    """Screening count information for a booking."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "totalCount": 10,
                "usedCount": 3,
                "remainingCount": 7
            }
        }
    )
    
    totalCount: int = Field(..., description="Total allocated screening count")
    usedCount: int = Field(..., description="Used screening count")
    remainingCount: int = Field(..., description="Remaining screening count")


class StartAnalysisResponse(BaseModel):
    """Response when starting analysis session."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sessionId": "session-uuid-456",
                "bookingId": "booking-uuid-123",
                "remainingCount": 7,
                "expiresAt": "2024-01-01T12:15:00Z"
            }
        }
    )
    
    sessionId: str = Field(..., description="Unique session ID for this analysis")
    bookingId: str = Field(..., description="Associated booking ID")
    remainingCount: int = Field(..., description="Remaining screening count after this analysis")
    expiresAt: datetime = Field(..., description="Session expiration time (15 minutes from start)")


class ProcessFrameResponse(BaseModel):
    """Response after processing a video frame."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "landmarks": {
                    "pose": {
                        "0": [100, 200, 0.5, 0.95],
                        "11": [150, 300, 0.3, 0.98]
                    }
                },
                "visibility": 0.95,
                "progress": 0.02,
                "message": "Frame processed successfully"
            }
        }
    )
    
    landmarks: Optional[Dict[str, Any]] = Field(
        None,
        description="Extracted pose landmarks (pose, face, hands)"
    )
    visibility: float = Field(
        ...,
        description="Average landmark visibility score (0.0 to 1.0)",
        ge=0.0,
        le=1.0
    )
    progress: float = Field(
        ...,
        description="Analysis progress (0.0 to 1.0)",
        ge=0.0,
        le=1.0
    )
    message: Optional[str] = Field(
        None,
        description="Status message or warning"
    )


class PostureMetrics(BaseModel):
    """
    Clinical posture metrics.

    Every field is Optional. A metric that could not be measured - because the required
    capture view was missing, too few frames were usable, or the quantity is not
    observable with these landmarks - is reported as null. It is NOT coerced to 0.0,
    which would be indistinguishable from a genuine zero measurement.

    Per-metric status, confidence and citation live in PostureAnalysisResponse.metricsJson.
    """
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "fhdPixels": 45.2,
                "cervicalAngle": 42.5,
                "headLateralFlexion": 2.3,
                "headRotation": 1.5,
                "thoracicKyphosisAngle": 38.0,
                "lumbarLordosisAngle": 42.0,
                "trunkLateralShift": 3.2,
                "trunkAngle": 1.8,
                "leftShoulderAngle": 85.0,
                "rightShoulderAngle": 87.0,
                "shoulderHeightDiff": 2.5,
                "roundedShoulderAngle": 12.0,
                "leftElbowAngle": 175.0,
                "rightElbowAngle": 176.0,
                "leftHipAngle": 178.0,
                "rightHipAngle": 179.0,
                "pelvicObliquity": 1.5,
                "pelvicTiltAngle": 8.0,
                "hipHeightDiff": 1.2,
                "leftKneeAngle": 180.0,
                "rightKneeAngle": 181.0,
                "kneeVarusValgus": 2.0,
                "kneeFlexionNeutral": 1.0,
                "qAngleLeft": 15.0,
                "qAngleRight": 14.5,
                "footProgressionAngle": 8.0,
                "pronationSupinationLeft": 3.0,
                "pronationSupinationRight": 2.5,
                "shoulderWidth": 450.0,
                "hipWidth": 320.0,
                "torsoLength": 520.0,
                "leftArmLength": 680.0,
                "rightArmLength": 682.0,
                "leftLegLength": 920.0,
                "rightLegLength": 918.0
            }
        }
    )
    
    # I. Global Posture (8 metrics)
    fhdPixels: Optional[float] = Field(None, description="Forward Head Distance in pixels")
    cervicalAngle: Optional[float] = Field(None, description="Cervical spine angle (degrees)")
    headLateralFlexion: Optional[float] = Field(None, description="Head lateral flexion angle (degrees)")
    headRotation: Optional[float] = Field(None, description="Head rotation angle (degrees)")
    thoracicKyphosisAngle: Optional[float] = Field(None, description="Thoracic kyphosis angle (degrees)")
    lumbarLordosisAngle: Optional[float] = Field(None, description="Lumbar lordosis angle (degrees)")
    trunkLateralShift: Optional[float] = Field(None, description="Trunk lateral shift (pixels)")
    trunkAngle: Optional[float] = Field(None, description="Trunk angle from vertical (degrees)")
    
    # II. Shoulder & Arm (6 metrics)
    leftShoulderAngle: Optional[float] = Field(None, description="Left shoulder angle (degrees)")
    rightShoulderAngle: Optional[float] = Field(None, description="Right shoulder angle (degrees)")
    shoulderHeightDiff: Optional[float] = Field(None, description="Shoulder height difference (pixels)")
    roundedShoulderAngle: Optional[float] = Field(None, description="Rounded shoulder angle (degrees)")
    leftElbowAngle: Optional[float] = Field(None, description="Left elbow angle (degrees)")
    rightElbowAngle: Optional[float] = Field(None, description="Right elbow angle (degrees)")
    
    # III. Pelvis & Hip (5 metrics)
    leftHipAngle: Optional[float] = Field(None, description="Left hip angle (degrees)")
    rightHipAngle: Optional[float] = Field(None, description="Right hip angle (degrees)")
    pelvicObliquity: Optional[float] = Field(None, description="Pelvic obliquity angle (degrees)")
    pelvicTiltAngle: Optional[float] = Field(None, description="Pelvic tilt angle (degrees)")
    hipHeightDiff: Optional[float] = Field(None, description="Hip height difference (pixels)")
    
    # IV. Lower Extremity (9 metrics)
    leftKneeAngle: Optional[float] = Field(None, description="Left knee angle (degrees)")
    rightKneeAngle: Optional[float] = Field(None, description="Right knee angle (degrees)")
    kneeVarusValgus: Optional[float] = Field(None, description="Knee varus/valgus angle (degrees)")
    kneeFlexionNeutral: Optional[float] = Field(None, description="Knee flexion from neutral (degrees)")
    qAngleLeft: Optional[float] = Field(None, description="Left Q-angle (degrees)")
    qAngleRight: Optional[float] = Field(None, description="Right Q-angle (degrees)")
    footProgressionAngle: Optional[float] = Field(None, description="Foot progression angle (degrees)")
    pronationSupinationLeft: Optional[float] = Field(None, description="Left foot pronation/supination (degrees)")
    pronationSupinationRight: Optional[float] = Field(None, description="Right foot pronation/supination (degrees)")
    
    # V. Body Proportions (7 metrics)
    shoulderWidth: Optional[float] = Field(None, description="Shoulder width (pixels)")
    hipWidth: Optional[float] = Field(None, description="Hip width (pixels)")
    torsoLength: Optional[float] = Field(None, description="Torso length (pixels)")
    leftArmLength: Optional[float] = Field(None, description="Left arm length (pixels)")
    rightArmLength: Optional[float] = Field(None, description="Right arm length (pixels)")
    leftLegLength: Optional[float] = Field(None, description="Left leg length (pixels)")
    rightLegLength: Optional[float] = Field(None, description="Right leg length (pixels)")


class PostureAnalysisResponse(BaseModel):
    """Complete posture analysis response with all metrics."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "analysis-uuid-789",
                "userId": "user-uuid-123",
                "bookingId": "booking-uuid-456",
                "analysisDate": "2024-01-01T12:00:00Z",
                "metrics": {},
                "landmarksData": {},
                "status": "completed",
                "normalRanges": {},
                "deviations": {}
            }
        }
    )
    
    id: str = Field(..., description="Analysis ID")
    userId: str = Field(..., description="User ID")
    bookingId: str = Field(..., description="Associated booking ID")
    analysisDate: datetime = Field(..., description="Analysis completion date")
    metrics: PostureMetrics = Field(..., description="All 33 clinical metrics")
    landmarksData: Optional[Dict[str, Any]] = Field(
        None,
        description="Raw landmarks data for 3D visualization"
    )
    status: str = Field(
        ...,
        description="Analysis status (completed, failed, cancelled)"
    )
    normalRanges: Dict[str, Dict[str, float]] = Field(
        default_factory=dict,
        description="Legacy normal ranges. Superseded by the ranges carried per-metric "
                    "inside metricsJson, which the frontend renders from."
    )
    deviations: Dict[str, str] = Field(
        default_factory=dict,
        description="Legacy deviation summary. Superseded by per-metric status in metricsJson."
    )
    schemaVersion: int = Field(
        1,
        description="1 = computed with the superseded maths; 2 = current pipeline. "
                    "Values are not comparable across versions."
    )
    metricsJson: Optional[Dict[str, Any]] = Field(
        None,
        description="Per-metric value, unit, measurement status, frame-to-frame spread, "
                    "normal range and literature citation. The authoritative payload."
    )
    qualityFlags: Optional[Dict[str, Any]] = Field(
        None,
        description="Capture-quality warnings, e.g. an assumed aspect ratio or "
                    "metrics flagged low confidence."
    )


class ValidateBookingResponse(BaseModel):
    """Response for booking validation check."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "valid": True,
                "remainingCount": 7,
                "totalCount": 10,
                "usedCount": 3,
                "message": None
            }
        }
    )
    
    valid: bool = Field(
        ...,
        description="Whether booking is valid for analysis"
    )
    remainingCount: int = Field(
        ...,
        description="Remaining screening count"
    )
    totalCount: int = Field(
        ...,
        description="Total screening count"
    )
    usedCount: int = Field(
        ...,
        description="Used screening count"
    )
    message: Optional[str] = Field(
        None,
        description="Validation message (error or warning)"
    )


class CancelAnalysisResponse(BaseModel):
    """Response for cancelled analysis."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "message": "Analysis cancelled successfully",
                "sessionId": "session-uuid-456"
            }
        }
    )
    
    message: str = Field(..., description="Success message")
    sessionId: str = Field(..., description="Cancelled session ID")


class AssessmentListResponse(BaseModel):
    """Response wrapper for assessment list."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "data": [],
                "total": 0,
                "limit": 10,
                "offset": 0
            }
        }
    )
    
    data: List[PostureAnalysisResponse] = Field(
        ...,
        description="List of posture analyses"
    )
    total: int = Field(..., description="Total number of assessments")
    limit: int = Field(..., description="Page size limit")
    offset: int = Field(..., description="Page offset")
