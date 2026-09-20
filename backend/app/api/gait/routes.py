"""Gait analysis API routes."""

from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_active_user
from app.api.gait.schemas import StartGaitRequest, FinalizeGaitRequest, CancelGaitRequest

gait_router = APIRouter(prefix="/gait", tags=["gait"])


@gait_router.post("/start-analysis", response_model=dict)
async def start_gait_analysis(
    request: StartGaitRequest,
    user=Depends(get_current_active_user)
):
    from app.api.gait.service import GaitAnalysisService
    result = await GaitAnalysisService.start_analysis(
        user_id=user.id,
        booking_id=request.bookingId
    )
    return {"data": result}


@gait_router.post("/finalize-analysis", response_model=dict)
async def finalize_gait_analysis(
    request: FinalizeGaitRequest,
    user=Depends(get_current_active_user)
):
    from app.api.gait.service import GaitAnalysisService
    result = await GaitAnalysisService.finalize_analysis(
        user_id=user.id,
        booking_id=request.bookingId,
        session_id=request.sessionId,
        gait_data=request.gaitData
    )
    return {"data": result}


@gait_router.post("/cancel-analysis", response_model=dict)
async def cancel_gait_analysis(
    request: CancelGaitRequest,
    user=Depends(get_current_active_user)
):
    from app.api.gait.service import GaitAnalysisService
    result = await GaitAnalysisService.cancel_analysis(session_id=request.sessionId)
    return result


@gait_router.get("/my-analyses", response_model=dict)
async def get_my_gait_analyses(
    bookingId: str = None,
    limit: int = 10,
    offset: int = 0,
    user=Depends(get_current_active_user)
):
    from app.api.gait.service import GaitAnalysisService
    from app.core.exceptions import BadRequestException
    if limit < 0 or limit > 100:
        raise BadRequestException("Limit must be between 0 and 100")
    if offset < 0:
        raise BadRequestException("Offset must be non-negative")
    analyses = await GaitAnalysisService.get_user_analyses(
        user_id=user.id,
        booking_id=bookingId,
        limit=limit,
        offset=offset
    )
    return {"data": analyses}


@gait_router.get("/analysis/{id}", response_model=dict)
async def get_gait_analysis_by_id(id: str, user=Depends(get_current_active_user)):
    from app.api.gait.service import GaitAnalysisService
    from app.core.exceptions import NotFoundException
    analysis = await GaitAnalysisService.get_analysis_by_id(
        analysis_id=id,
        user_id=user.id
    )
    if not analysis:
        raise NotFoundException(f"Gait analysis '{id}' not found or access denied.")
    return {"data": analysis}


@gait_router.get("/validate-booking/{bookingId}", response_model=dict)
async def validate_booking_for_gait(bookingId: str, user=Depends(get_current_active_user)):
    from app.api.gait.service import GaitAnalysisService
    result = await GaitAnalysisService.validate_booking(
        booking_id=bookingId,
        user_id=user.id
    )
    return {"data": result}
