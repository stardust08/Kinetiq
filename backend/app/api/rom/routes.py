"""Range-of-motion API routes."""

from fastapi import APIRouter, Depends

from app.api.posture.routes import _analysis_id_from, _attach_draft_plan
from app.api.rom.schemas import CancelROMRequest, FinalizeROMRequest, StartROMRequest
from app.core.dependencies import get_current_active_user
from app.core.screening_gate import authorise_screening, consume_authorisation

rom_router = APIRouter(prefix="/rom", tags=["rom"])


@rom_router.post("/start-analysis", response_model=dict)
async def start_rom_analysis(request: StartROMRequest, user=Depends(get_current_active_user)):
    from app.api.rom.service import ROMAnalysisService

    authorisation = await authorise_screening(
        user,
        request.bookingId,
        "ROM",
        screening_token=request.screeningToken,
        patient_id=request.patientId,
    )
    result = await ROMAnalysisService.start_analysis(
        authorisation.patient_id, request.bookingId
    )
    result["supervision"] = authorisation.to_dict()
    return {"data": result}


@rom_router.post("/finalize-analysis", response_model=dict)
async def finalize_rom_analysis(
    request: FinalizeROMRequest, user=Depends(get_current_active_user)
):
    from app.api.rom.service import ROMAnalysisService

    authorisation = await authorise_screening(
        user,
        request.bookingId,
        "ROM",
        screening_token=request.screeningToken,
        patient_id=request.patientId,
    )
    result = await ROMAnalysisService.finalize_analysis(
        user_id=authorisation.patient_id,
        booking_id=request.bookingId,
        session_id=request.sessionId,
        rom_data=request.romData,
    )

    analysis_id = _analysis_id_from(result)
    if analysis_id:
        await consume_authorisation(authorisation, analysis_id)
        await _attach_draft_plan(
            analysis_id=analysis_id,
            analysis_type="ROM",
            patient_id=authorisation.patient_id,
            booking_id=request.bookingId,
            result=result,
        )
    return {"data": result}


@rom_router.post("/cancel-analysis", response_model=dict)
async def cancel_rom_analysis(request: CancelROMRequest, user=Depends(get_current_active_user)):
    return {"data": {"message": "Analysis cancelled. No screening count was deducted."}}


@rom_router.get("/my-analyses", response_model=dict)
async def my_rom_analyses(limit: int = 10, offset: int = 0, user=Depends(get_current_active_user)):
    from app.api.rom.service import ROMAnalysisService

    return {"data": await ROMAnalysisService.get_user_analyses(user.id, limit, offset)}
