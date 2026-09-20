"""Range-of-motion API routes."""

from fastapi import APIRouter, Depends

from app.api.rom.schemas import CancelROMRequest, FinalizeROMRequest, StartROMRequest
from app.core.dependencies import get_current_active_user

rom_router = APIRouter(prefix="/rom", tags=["rom"])


@rom_router.post("/start-analysis", response_model=dict)
async def start_rom_analysis(request: StartROMRequest, user=Depends(get_current_active_user)):
    from app.api.rom.service import ROMAnalysisService

    return {"data": await ROMAnalysisService.start_analysis(user.id, request.bookingId)}


@rom_router.post("/finalize-analysis", response_model=dict)
async def finalize_rom_analysis(
    request: FinalizeROMRequest, user=Depends(get_current_active_user)
):
    from app.api.rom.service import ROMAnalysisService

    return {
        "data": await ROMAnalysisService.finalize_analysis(
            user_id=user.id,
            booking_id=request.bookingId,
            session_id=request.sessionId,
            rom_data=request.romData,
        )
    }


@rom_router.post("/cancel-analysis", response_model=dict)
async def cancel_rom_analysis(request: CancelROMRequest, user=Depends(get_current_active_user)):
    return {"data": {"message": "Analysis cancelled. No screening count was deducted."}}


@rom_router.get("/my-analyses", response_model=dict)
async def my_rom_analyses(limit: int = 10, offset: int = 0, user=Depends(get_current_active_user)):
    from app.api.rom.service import ROMAnalysisService

    return {"data": await ROMAnalysisService.get_user_analyses(user.id, limit, offset)}
