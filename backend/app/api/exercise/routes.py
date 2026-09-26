"""
Exercise catalogue and prescription endpoints.

The shape to notice: everything that changes what a patient is told to do requires
staff (`get_current_staff`), and everything a patient can reach is scoped by
`plan_scope_filter`, which hides unreviewed drafts. There is no endpoint by which a
patient activates their own plan.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.exercise.schemas import (
    ActivatePlanRequest,
    AddPlanItemRequest,
    LogCompletionRequest,
    UpdateExerciseRequest,
    UpdatePlanItemRequest,
    UpdatePlanRequest,
    UpdatePlanStatusRequest,
)
from app.api.exercise.service import ExerciseCatalogueService, ExercisePlanService
from app.core.dependencies import (
    get_current_active_user,
    get_current_admin,
    get_current_staff,
)
from app.core.exercise.library import EXERCISES_BY_SLUG

exercise_router = APIRouter(prefix="/exercises", tags=["exercises"])


# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------


@exercise_router.get("/catalogue", response_model=dict)
async def list_catalogue(
    bodyRegion: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    includeInactive: bool = False,
    limit: int = 100,
    offset: int = 0,
    user=Depends(get_current_active_user),
):
    """
    The exercise library, with videos and instructions.

    Available to every signed-in role: a patient browsing what an exercise involves
    before their appointment is a good thing, and nothing here is patient-specific.
    Retired exercises are hidden unless explicitly asked for, and only staff may ask.
    """
    from app.core.roles import is_admin, is_clinician

    include_inactive = includeInactive and (is_admin(user) or is_clinician(user))
    rows = await ExerciseCatalogueService.list_exercises(
        body_region=bodyRegion,
        difficulty=difficulty,
        search=search,
        include_inactive=include_inactive,
        limit=limit,
        offset=offset,
    )
    return {
        "data": [
            ExercisePlanService._serialise_exercise(r, EXERCISES_BY_SLUG.get(r.slug))
            for r in rows
        ]
    }


@exercise_router.get("/catalogue/{exercise_id}", response_model=dict)
async def get_catalogue_entry(exercise_id: str, user=Depends(get_current_active_user)):
    row = await ExerciseCatalogueService.get_exercise(exercise_id)
    return {
        "data": ExercisePlanService._serialise_exercise(
            row, EXERCISES_BY_SLUG.get(row.slug)
        )
    }


@exercise_router.patch("/catalogue/{exercise_id}", response_model=dict)
async def update_catalogue_entry(
    exercise_id: str,
    request: UpdateExerciseRequest,
    user=Depends(get_current_admin),
):
    """
    Attach a video, retire an exercise, adjust default dosage. Admin only.

    Clinical content is not editable here - see the service for why.
    """
    row = await ExerciseCatalogueService.update_exercise(
        user, exercise_id, request.model_dump(exclude_none=True)
    )
    return {
        "data": ExercisePlanService._serialise_exercise(
            row, EXERCISES_BY_SLUG.get(row.slug)
        )
    }


@exercise_router.post("/catalogue/sync", response_model=dict)
async def sync_catalogue(user=Depends(get_current_admin)):
    """
    Make the database match the code library. Admin only.

    Safe to run repeatedly. Preserves uploaded videos and deactivates - rather than
    deletes - exercises that have left the library, because a patient may have one on
    an active plan right now.
    """
    return {"data": await ExerciseCatalogueService.sync_from_library()}


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------


@exercise_router.get("/plans", response_model=dict)
async def list_plans(
    patientId: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_active_user),
):
    """
    Plans this caller may see.

    A patient gets their own, minus unreviewed drafts. A clinician gets those belonging
    to patients booked with them. An admin gets all of them.
    """
    plans = await ExercisePlanService.list_plans(
        user, patient_id=patientId, status=status, limit=limit, offset=offset
    )
    return {"data": [ExercisePlanService.serialise_plan(p, viewer=user) for p in plans]}


@exercise_router.get("/plans/{plan_id}", response_model=dict)
async def get_plan(plan_id: str, user=Depends(get_current_active_user)):
    plan = await ExercisePlanService.get_plan(user, plan_id)
    return {"data": ExercisePlanService.serialise_plan(plan, viewer=user)}


@exercise_router.get("/plans/{plan_id}/adherence", response_model=dict)
async def get_adherence(plan_id: str, user=Depends(get_current_active_user)):
    """How much of the programme has actually been done, per exercise."""
    return {"data": await ExercisePlanService.adherence_summary(user, plan_id)}


@exercise_router.patch("/plans/{plan_id}", response_model=dict)
async def update_plan(
    plan_id: str, request: UpdatePlanRequest, user=Depends(get_current_staff)
):
    plan = await ExercisePlanService.update_plan(
        user, plan_id, request.model_dump(exclude_none=True)
    )
    return {"data": ExercisePlanService.serialise_plan(plan, viewer=user)}


@exercise_router.post("/plans/{plan_id}/activate", response_model=dict)
async def activate_plan(
    plan_id: str, request: ActivatePlanRequest, user=Depends(get_current_staff)
):
    """
    Prescribe the plan. Clinician or admin only.

    The moment a machine suggestion becomes clinical advice. Until this call the
    patient cannot see the plan at all.
    """
    plan = await ExercisePlanService.activate_plan(user, plan_id, request.clinicianNotes)
    return {"data": ExercisePlanService.serialise_plan(plan, viewer=user)}


@exercise_router.patch("/plans/{plan_id}/status", response_model=dict)
async def set_plan_status(
    plan_id: str, request: UpdatePlanStatusRequest, user=Depends(get_current_staff)
):
    plan = await ExercisePlanService.set_status(user, plan_id, request.status)
    return {"data": ExercisePlanService.serialise_plan(plan, viewer=user)}


# ---------------------------------------------------------------------------
# Plan items
# ---------------------------------------------------------------------------


@exercise_router.post("/plans/{plan_id}/items", response_model=dict)
async def add_plan_item(
    plan_id: str, request: AddPlanItemRequest, user=Depends(get_current_staff)
):
    """Add an exercise the engine did not suggest. Clinician or admin only."""
    item = await ExercisePlanService.add_item(
        user, plan_id, request.model_dump(exclude_none=True)
    )
    return {"data": {"id": item.id}}


@exercise_router.patch("/plans/{plan_id}/items/{item_id}", response_model=dict)
async def update_plan_item(
    plan_id: str,
    item_id: str,
    request: UpdatePlanItemRequest,
    user=Depends(get_current_staff),
):
    """Change sets, reps, hold time or frequency. Clinician or admin only."""
    item = await ExercisePlanService.update_item(
        user, plan_id, item_id, request.model_dump(exclude_none=True)
    )
    return {"data": {"id": item.id}}


@exercise_router.delete("/plans/{plan_id}/items/{item_id}", response_model=dict)
async def remove_plan_item(
    plan_id: str, item_id: str, user=Depends(get_current_staff)
):
    """Strike an exercise off. Soft delete - the decision stays on the record."""
    item = await ExercisePlanService.remove_item(user, plan_id, item_id)
    return {"data": {"id": item.id, "isRemoved": True}}


@exercise_router.post("/plan-items/{item_id}/complete", response_model=dict)
async def log_completion(
    item_id: str, request: LogCompletionRequest, user=Depends(get_current_active_user)
):
    """Patient logs having done an exercise, with optional pain and difficulty."""
    completion = await ExercisePlanService.log_completion(
        user, item_id, request.model_dump(exclude_none=True)
    )
    return {"data": {"id": completion.id, "completedAt": completion.completedAt}}


# ---------------------------------------------------------------------------
# Per-analysis suggestions
# ---------------------------------------------------------------------------


@exercise_router.get("/suggestions/{analysis_type}/{analysis_id}", response_model=dict)
async def get_suggestions(
    analysis_type: str, analysis_id: str, user=Depends(get_current_active_user)
):
    """
    What this screening suggests, computed live and stored nowhere.

    Drives the "recommended exercises" panel that appears on every report - posture,
    gait and range of motion alike. Read-only, so it is safe for the report page to
    call on every render, and it never creates or changes a plan.

    Note what a patient sees here versus what lands on their plan: this preview is the
    engine's raw output, and the plan it produced remains a draft until a clinician
    activates it. The UI labels it as suggested, not prescribed.
    """
    outcome = await ExercisePlanService.preview_for_analysis(
        user, analysis_type, analysis_id
    )
    plan = await ExercisePlanService.get_plan_for_analysis(
        user, analysis_type, analysis_id
    )
    return {
        "data": {
            **outcome,
            "plan": (
                ExercisePlanService.serialise_plan(plan, viewer=user) if plan else None
            ),
        }
    }


@exercise_router.post("/suggestions/{analysis_type}/{analysis_id}/regenerate", response_model=dict)
async def regenerate_plan(
    analysis_type: str, analysis_id: str, user=Depends(get_current_staff)
):
    """
    Rebuild the draft plan for an analysis. Clinician or admin only.

    For the case where the catalogue was not seeded when the screening finished, or
    the rules have changed since. Leaves a plan that has already been prescribed alone
    and leaves manually added exercises in place.
    """
    from app.core.authz import assert_can_access_analysis
    from app.api.exercise.service import _ANALYSIS_TABLES
    from app.db.client import db

    table = _ANALYSIS_TABLES.get(analysis_type.upper())
    if table is None:
        from app.core.exceptions import BadRequestException

        raise BadRequestException(f"Unknown analysis type '{analysis_type}'.")

    analysis = await getattr(db, table).find_unique(
        where={"id": analysis_id}, include={"booking": True}
    )
    assert_can_access_analysis(user, analysis, getattr(analysis, "booking", None))

    plan = await ExercisePlanService.generate_for_analysis(
        analysis_id=analysis_id,
        analysis_type=analysis_type.upper(),
        patient_id=analysis.userId,
        booking_id=analysis.bookingId,
        created_by_id=user.id,
    )
    return {
        "data": (
            ExercisePlanService.serialise_plan(plan, viewer=user) if plan else None
        )
    }
