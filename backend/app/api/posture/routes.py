"""
Posture analysis routes for the API.

This module provides FastAPI endpoints for clinical posture analysis,
including starting analysis sessions, processing video frames, finalizing
analyses with screening count deduction, and viewing assessment history.
All endpoints require authentication.

Implements requirements from clinical-posture-analysis-migration spec:
- US-4: Perform clinical posture analysis using webcam
- US-6: View posture analysis results immediately after completion
- US-7: View past posture analyses organized by booking
- SR-7: Rate limit analysis requests (max 10 per day per user)
"""

from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_active_user
from app.api.posture.schemas import (
    StartAnalysisRequest,
    ProcessFrameRequest,
    FinalizeAnalysisRequest,
    CancelAnalysisRequest
)

# Create posture router with /posture prefix
posture_router = APIRouter(prefix="/posture", tags=["posture"])


@posture_router.post("/start-analysis", response_model=dict)
async def start_analysis(
    request: StartAnalysisRequest,
    user = Depends(get_current_active_user)
):
    """
    Initialize a new posture analysis session.
    
    This endpoint validates that the user has a booking with remaining
    screening counts and creates a new analysis session. The session
    expires after 15 minutes if not completed.
    
    Args:
        request: StartAnalysisRequest containing bookingId
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - data: Session information including sessionId, bookingId,
                   remainingCount, and expiresAt
            
    Raises:
        UnauthorizedException: If booking not found or access denied (401)
        BadRequestException: If no remaining screening counts or invalid booking status (400)
        
    Example:
        POST /api/posture/start-analysis
        Body: {"bookingId": "booking-123"}
        
        Response:
        {
            "data": {
                "sessionId": "session-456",
                "bookingId": "booking-123",
                "remainingCount": 5,
                "expiresAt": "2024-01-15T10:15:00Z"
            }
        }
        
    Note:
        Implements requirements:
        - US-3: Select booking before starting assessment
        - AC-3.1: User must select active booking before starting
        - AC-3.2: Only show bookings with remaining counts > 0
        - AC-3.4: Prevent assessment start if no valid bookings
    """
    from app.api.posture.service import PostureAnalysisService
    
    # Call service to start analysis
    result = await PostureAnalysisService.start_analysis(
        user_id=user.id,
        booking_id=request.bookingId
    )
    
    return {"data": result}


# The /process-frame endpoint lived here. It accepted a base64 JPEG per frame and ran
# MediaPipe server-side. Nothing has called it since pose estimation moved into the
# browser: the client now extracts landmarks locally and posts the numbers once, to
# /finalize-analysis. Keeping it meant keeping a public endpoint that base64-decoded
# and image-decoded untrusted input, plus the server-side MediaPipe and OpenCV
# dependencies it needed, for a code path the product does not use.
@posture_router.post("/finalize-analysis", response_model=dict)
async def finalize_analysis(
    request: FinalizeAnalysisRequest,
    user = Depends(get_current_active_user)
):
    """
    Complete analysis, calculate metrics, save results, and deduct screening count.
    
    This endpoint performs the critical operation of finalizing the posture
    analysis. It calculates all 33 clinical metrics from collected landmarks,
    saves the PostureAnalysis record, and atomically deducts one screening
    count from the booking. All operations are performed in a database
    transaction to ensure consistency.
    
    Args:
        request: FinalizeAnalysisRequest containing sessionId, bookingId, and landmarksData
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - data: Complete PostureAnalysis object with all 33 metrics,
                   landmarks data, and remaining screening count
            
    Raises:
        UnauthorizedException: If booking not found or access denied (401)
        BadRequestException: If no remaining counts, invalid landmarks, or calculation fails (400)
        
    Example:
        POST /api/posture/finalize-analysis
        Body: {
            "sessionId": "session-456",
            "bookingId": "booking-123",
            "landmarksData": {...}
        }
        
        Response:
        {
            "data": {
                "analysis": {
                    "id": "analysis-789",
                    "userId": "user-123",
                    "bookingId": "booking-123",
                    "analysisDate": "2024-01-15T10:00:00Z",
                    "metrics": {
                        "fhdPixels": 45.2,
                        "cervicalAngle": 38.5,
                        ...
                    },
                    "landmarksData": {...},
                    "status": "completed"
                },
                "remainingCount": 4
            }
        }
        
    Note:
        Implements requirements:
        - AC-4.2: System calculates all 33 clinical metrics accurately
        - AC-4.3: System stores analysis data linked to booking
        - AC-4.6: System deducts 1 screening count upon completion
        - AC-4.7: System updates remaining count display immediately
        - SR-8: Atomic count deduction (prevent race conditions)
        - DR-3: Link each analysis to specific booking
    """
    from app.api.posture.service import PostureAnalysisService
    
    # Call service to finalize analysis
    # This performs atomic transaction: calculate metrics + save analysis + deduct count
    result = await PostureAnalysisService.finalize_analysis(
        user_id=user.id,
        booking_id=request.bookingId,
        session_id=request.sessionId,
        landmarks_data=request.landmarksData
    )
    
    return {"data": result}


@posture_router.post("/cancel-analysis", response_model=dict)
async def cancel_analysis(
    request: CancelAnalysisRequest,
    user = Depends(get_current_active_user)
):
    """
    Cancel analysis session without deducting screening count.
    
    This endpoint allows users to cancel an in-progress analysis without
    consuming a screening count. The session is invalidated and no data
    is saved to the database.
    
    Args:
        request: CancelAnalysisRequest containing sessionId
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - message: Success confirmation
            
    Example:
        POST /api/posture/cancel-analysis
        Body: {"sessionId": "session-456"}
        
        Response:
        {
            "message": "Analysis cancelled successfully. No screening count was deducted."
        }
        
    Note:
        Implements requirements:
        - AC-5.5: System allows user to cancel and retry without count deduction
        - AC-9.4: If analysis fails, count is NOT deducted
    """
    from app.api.posture.service import PostureAnalysisService
    
    # Call service to cancel analysis
    result = await PostureAnalysisService.cancel_analysis(
        session_id=request.sessionId
    )
    
    return result


@posture_router.get("/my-assessments", response_model=dict)
async def get_my_assessments(
    bookingId: str = None,
    limit: int = 10,
    offset: int = 0,
    user = Depends(get_current_active_user)
):
    """
    Get all posture assessments for the authenticated user.
    
    This endpoint retrieves all posture analyses for the current user,
    with optional filtering by booking and pagination support. Results
    include booking and service information for context.
    
    Args:
        bookingId: Optional booking ID to filter assessments
        limit: Number of results per page (default: 10, max: 100)
        offset: Number of results to skip (default: 0)
        user: Current authenticated user (from dependency)
        
    Query Parameters:
        bookingId (optional): Filter assessments by specific booking
        limit (optional): Number of results per page (default: 10)
        offset (optional): Number of results to skip (default: 0)
        
    Returns:
        dict containing:
            - data: List of PostureAnalysis objects with booking details
            
    Raises:
        BadRequestException: If limit exceeds 100 or offset is negative (400)
            
    Example:
        GET /api/posture/my-assessments?bookingId=booking-123&limit=10&offset=0
        
        Response:
        {
            "data": [
                {
                    "id": "analysis-789",
                    "userId": "user-123",
                    "bookingId": "booking-123",
                    "analysisDate": "2024-01-15T10:00:00Z",
                    "metrics": {...},
                    "status": "completed",
                    "booking": {
                        "id": "booking-123",
                        "service": {
                            "name": "AI Assessment"
                        }
                    }
                }
            ]
        }
        
    Note:
        Implements requirements:
        - US-7: View past posture analyses organized by booking
        - AC-7.1: User can access assessment history from booking details
        - AC-7.2: Each booking shows list of completed assessments with dates
        - AC-7.6: User can filter/sort assessments by date
        - US-8: See overall assessment history across all bookings
        - AC-8.2: System displays assessments from all bookings chronologically
    """
    from app.api.posture.service import PostureAnalysisService
    from app.core.exceptions import BadRequestException
    
    # Validate query parameters
    if limit < 0 or limit > 100:
        raise BadRequestException("Limit must be between 0 and 100")
    
    if offset < 0:
        raise BadRequestException("Offset must be non-negative")
    
    # Call service to get assessments
    assessments = await PostureAnalysisService.get_user_assessments(
        user_id=user.id,
        booking_id=bookingId,
        limit=limit,
        offset=offset
    )
    
    return {"data": assessments}


@posture_router.get("/analysis/{id}", response_model=dict)
async def get_analysis_by_id(id: str, user = Depends(get_current_active_user)):
    """
    Get detailed information for a specific posture analysis.
    
    This endpoint retrieves complete details for a single posture analysis,
    including all 33 clinical metrics, landmarks data for 3D visualization,
    and associated booking information. The analysis must belong to the
    authenticated user.
    
    Args:
        id: Analysis ID
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - data: Complete PostureAnalysis object with all metrics and relations
            
    Raises:
        NotFoundException: If analysis not found or doesn't belong to user (404)
        
    Example:
        GET /api/posture/analysis/analysis-789
        
        Response:
        {
            "data": {
                "id": "analysis-789",
                "userId": "user-123",
                "bookingId": "booking-123",
                "analysisDate": "2024-01-15T10:00:00Z",
                "metrics": {
                    "fhdPixels": 45.2,
                    "cervicalAngle": 38.5,
                    ...all 33 metrics...
                },
                "landmarksData": {...},
                "status": "completed",
                "booking": {
                    "id": "booking-123",
                    "service": {
                        "name": "AI Assessment"
                    }
                },
                "normalRanges": {...},
                "deviations": {...}
            }
        }
        
    Note:
        Implements requirements:
        - US-6: View posture analysis results immediately after completion
        - AC-6.1: System displays all 33 clinical metrics in organized categories
        - AC-6.2: System shows 3D skeleton visualization
        - AC-6.3: System provides interpretation/ranges for each metric
        - AC-6.4: System shows which metrics are within normal ranges
        - US-7: View detailed results for any past assessment
        - AC-7.3: User can view detailed results for any past assessment
        - AC-7.5: System renders 3D skeleton visualization from stored landmarks
        - SR-3: Validate user owns analysis data before access
    """
    from app.api.posture.service import PostureAnalysisService
    from app.core.exceptions import NotFoundException
    
    # Call service to get analysis by ID with ownership validation
    analysis = await PostureAnalysisService.get_analysis_by_id(
        analysis_id=id,
        user_id=user.id
    )
    
    # Return 404 if analysis not found or user doesn't own it
    if not analysis:
        raise NotFoundException(
            f"Analysis with ID '{id}' not found or you don't have access to it."
        )
    
    return {"data": analysis}


@posture_router.get("/validate-booking/{bookingId}", response_model=dict)
async def validate_booking(bookingId: str, user = Depends(get_current_active_user)):
    """
    Validate if a booking can be used for posture analysis.
    
    This endpoint checks if a booking is valid for starting a new posture
    analysis. It verifies booking ownership, remaining screening counts,
    and booking status.
    
    Args:
        bookingId: Booking ID to validate
        user: Current authenticated user (from dependency)
        
    Returns:
        dict containing:
            - data: Validation result with count information and message
            
    Example:
        GET /api/posture/validate-booking/booking-123
        
        Response:
        {
            "data": {
                "valid": true,
                "remainingCount": 5,
                "totalCount": 10,
                "usedCount": 5,
                "message": null
            }
        }
        
        Or if invalid:
        {
            "data": {
                "valid": false,
                "remainingCount": 0,
                "totalCount": 10,
                "usedCount": 10,
                "message": "No remaining screening counts"
            }
        }
        
    Note:
        Implements requirements:
        - AC-3.2: System only shows bookings with remaining counts > 0
        - AC-3.3: System displays remaining count for selected booking
        - AC-3.4: System prevents assessment start if no valid bookings
        - AC-3.5: System shows clear message if all counts exhausted
        - SR-2: Validate user owns booking before allowing assessment
        - SR-4: Verify booking has remaining screening counts before starting
    """
    from app.api.posture.service import PostureAnalysisService
    
    # Call service to validate booking
    result = await PostureAnalysisService.validate_booking(
        booking_id=bookingId,
        user_id=user.id
    )
    
    return {"data": result}
