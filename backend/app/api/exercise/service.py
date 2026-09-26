"""
Exercise catalogue and prescription service.

Three jobs:

  1. **Catalogue.** Read the exercises, and let an admin edit the parts that are
     deployment-specific - chiefly the video URL, which cannot live in the code library
     because nobody can put a real video in a source file.

  2. **Draft generation.** When a screening finalises, run the rules engine over its
     metrics and write a DRAFT plan. This happens automatically and without a human in
     the loop, which is precisely why the result is a draft.

  3. **Review and prescription.** A clinician edits the draft - striking exercises,
     adding their own, changing dosage - and activates it. Only then can the patient
     see it.

The DRAFT/ACTIVE split is the safety property of this whole module. The engine is a
set of rules over measurements, and measurements can be wrong in ways the engine cannot
see: a patient who could not raise their arm because of a fresh fracture produces the
same low shoulder-flexion number as one with a stiff joint, and the exercise that helps
the second would harm the first. Nothing here lets a plan reach a patient without a
clinician having looked.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.authz import (
    assert_can_access_patient_record,
    assert_can_review_plan,
    plan_scope_filter,
)
from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.exercise.engine import ENGINE_VERSION, generate
from app.core.exercise.library import EXERCISES, EXERCISES_BY_SLUG
from app.core.roles import is_admin, is_clinician, is_patient
from app.db.client import db

_PLAN_INCLUDE = {
    "items": {"include": {"exercise": True}},
    "patient": True,
    "createdBy": True,
    "reviewedBy": True,
    "booking": {"include": {"service": True}},
}

#: Which table holds each analysis type's rows, and therefore where to read metricsJson.
_ANALYSIS_TABLES = {
    "POSTURE": "postureanalysis",
    "GAIT": "gaitanalysis",
    "ROM": "romanalysis",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ExerciseCatalogueService:
    """Reading and maintaining the exercise library rows."""

    @staticmethod
    async def list_exercises(
        *,
        body_region: Optional[str] = None,
        difficulty: Optional[str] = None,
        search: Optional[str] = None,
        include_inactive: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Any]:
        where: Dict[str, Any] = {}
        if not include_inactive:
            where["isActive"] = True
        if body_region:
            where["bodyRegion"] = body_region.upper()
        if difficulty:
            where["difficulty"] = difficulty.upper()
        if search:
            where["OR"] = [
                {"name": {"contains": search, "mode": "insensitive"}},
                {"summary": {"contains": search, "mode": "insensitive"}},
            ]
        return await db.exercise.find_many(
            where=where,
            order=[{"bodyRegion": "asc"}, {"name": "asc"}],
            take=min(limit, 200),
            skip=offset,
        )

    @staticmethod
    async def get_exercise(exercise_id: str) -> Any:
        exercise = await db.exercise.find_unique(where={"id": exercise_id})
        if exercise is None:
            # Accept a slug too. The library speaks slugs, the database speaks uuids,
            # and every caller that has one and not the other would otherwise need a
            # lookup table of its own.
            exercise = await db.exercise.find_unique(where={"slug": exercise_id})
        if exercise is None:
            raise NotFoundException("Exercise not found.")
        return exercise

    @staticmethod
    async def update_exercise(
        admin_user, exercise_id: str, data: Dict[str, Any]
    ) -> Any:
        """
        Edit a catalogue entry. Admin only.

        Restricted to the fields a deployment legitimately owns. The clinical content -
        the instructions, the cautions, the citation - comes from the code library and
        is not editable through the API: an exercise whose instructions can be changed
        by an API call is an exercise whose instructions nobody reviewed.
        """
        if not is_admin(admin_user):
            raise ForbiddenException("Only an administrator can edit the catalogue.")

        editable = {
            "videoUrl",
            "videoProvider",
            "thumbnailUrl",
            "durationSeconds",
            "isActive",
            "equipment",
            "defaultSets",
            "defaultReps",
            "defaultHoldSeconds",
            "defaultFrequencyPerWeek",
        }
        rejected = set(data) - editable
        if rejected:
            raise BadRequestException(
                "These fields are defined in the exercise library and cannot be edited "
                f"through the API: {', '.join(sorted(rejected))}."
            )

        payload = {k: v for k, v in data.items() if v is not None}
        if not payload:
            raise BadRequestException("Nothing to update.")

        await ExerciseCatalogueService.get_exercise(exercise_id)
        return await db.exercise.update(where={"id": exercise_id}, data=payload)

    @staticmethod
    async def sync_from_library() -> Dict[str, int]:
        """
        Make the database match the code library.

        Upserts rather than truncating: an exercise row carries a videoUrl somebody
        uploaded and plan items that point at it, and rebuilding the table would
        destroy both. Exercises that have left the library are deactivated rather than
        deleted, because a patient may have one on an active plan right now.
        """
        from prisma import Json

        created = updated = retired = 0

        for definition in EXERCISES:
            row = {
                "name": definition.name,
                "summary": definition.summary,
                "bodyRegion": definition.body_region.value,
                "difficulty": definition.difficulty.value,
                "equipment": ",".join(definition.equipment) or None,
                "defaultSets": definition.default_sets,
                "defaultReps": definition.default_reps,
                "defaultHoldSeconds": definition.default_hold_seconds,
                "defaultFrequencyPerWeek": definition.default_frequency_per_week,
                "instructions": Json(list(definition.instructions)),
                "cautions": definition.cautions,
                "reference": definition.reference,
                "isActive": True,
            }
            existing = await db.exercise.find_unique(where={"slug": definition.slug})
            if existing is None:
                await db.exercise.create(data={"slug": definition.slug, **row})
                created += 1
            else:
                # videoUrl, videoProvider and thumbnailUrl are intentionally absent
                # from `row`: they are deployment data, and a sync must not wipe the
                # video somebody uploaded last week.
                await db.exercise.update(where={"id": existing.id}, data=row)
                updated += 1

        known = [d.slug for d in EXERCISES]
        result = await db.exercise.update_many(
            where={"slug": {"not_in": known}, "isActive": True},
            data={"isActive": False},
        )
        retired = result if isinstance(result, int) else 0

        return {"created": created, "updated": updated, "retired": retired}


class ExercisePlanService:
    """Generating, reviewing and serving exercise plans."""

    # -------------------------------------------------------------------
    # Generation
    # -------------------------------------------------------------------

    @staticmethod
    async def generate_for_analysis(
        *,
        analysis_id: str,
        analysis_type: str,
        patient_id: str,
        booking_id: str,
        created_by_id: Optional[str] = None,
    ) -> Optional[Any]:
        """
        Build the DRAFT plan for one finished screening.

        Returns None when the screening found nothing actionable. That is a real
        outcome and not a failure: a patient whose measurements all sat inside their
        normal ranges should be told so, not handed exercises to justify the
        appointment.

        Idempotent on (analysisType, analysisId) - re-running over the same analysis
        updates the existing draft. Without that, a retried finalize would leave the
        patient with two plans drawn from one set of measurements.
        """
        analysis_type = analysis_type.upper()
        table = _ANALYSIS_TABLES.get(analysis_type)
        if table is None:
            raise BadRequestException(f"Unknown analysis type '{analysis_type}'.")

        analysis = await getattr(db, table).find_unique(where={"id": analysis_id})
        if analysis is None:
            raise NotFoundException("Analysis not found.")

        outcome = generate(getattr(analysis, "metricsJson", None), analysis_type)
        findings = outcome["findings"]
        prescriptions = outcome["prescriptions"]

        existing = await db.exerciseplan.find_first(
            where={"analysisType": analysis_type, "analysisId": analysis_id}
        )

        # A plan a clinician has already reviewed is theirs. Regenerating over it would
        # silently undo their edits, so the engine steps back.
        if existing is not None and existing.status != "DRAFT":
            return existing

        if not prescriptions:
            if existing is not None:
                from prisma import Json

                return await db.exerciseplan.update(
                    where={"id": existing.id},
                    data={
                        "summary": outcome["summary"],
                        "findings": Json(findings),
                        "engineVersion": ENGINE_VERSION,
                    },
                    include=_PLAN_INCLUDE,
                )
            # Nothing to prescribe and nothing already stored: record the finding set
            # anyway, so the clinician can see what was measured and add their own
            # exercises if they disagree with the engine.
            if findings:
                from prisma import Json

                return await db.exerciseplan.create(
                    data={
                        "patientId": patient_id,
                        "bookingId": booking_id,
                        "analysisType": analysis_type,
                        "analysisId": analysis_id,
                        "status": "DRAFT",
                        "title": outcome["title"],
                        "summary": outcome["summary"],
                        "findings": Json(findings),
                        "engineVersion": ENGINE_VERSION,
                        "createdById": created_by_id,
                    },
                    include=_PLAN_INCLUDE,
                )
            return None

        from prisma import Json

        if existing is None:
            plan = await db.exerciseplan.create(
                data={
                    "patientId": patient_id,
                    "bookingId": booking_id,
                    "analysisType": analysis_type,
                    "analysisId": analysis_id,
                    "status": "DRAFT",
                    "title": outcome["title"],
                    "summary": outcome["summary"],
                    "findings": Json(findings),
                    "engineVersion": ENGINE_VERSION,
                    "createdById": created_by_id,
                }
            )
        else:
            plan = await db.exerciseplan.update(
                where={"id": existing.id},
                data={
                    "title": outcome["title"],
                    "summary": outcome["summary"],
                    "findings": Json(findings),
                    "engineVersion": ENGINE_VERSION,
                },
            )
            # Only the engine's own suggestions are replaced. An exercise a clinician
            # added by hand survives a regeneration - they put it there deliberately,
            # and the engine has no opinion about it to override.
            await db.exerciseplanitem.delete_many(
                where={"planId": plan.id, "source": "AUTO"}
            )

        for order, item in enumerate(prescriptions):
            exercise = await db.exercise.find_unique(
                where={"slug": item["exerciseSlug"]}
            )
            if exercise is None:
                # The catalogue has not been seeded, or this exercise was retired.
                # Skipping keeps the rest of the plan rather than losing all of it.
                continue
            existing_item = await db.exerciseplanitem.find_first(
                where={"planId": plan.id, "exerciseId": exercise.id}
            )
            if existing_item is not None:
                continue
            await db.exerciseplanitem.create(
                data={
                    "planId": plan.id,
                    "exerciseId": exercise.id,
                    "sets": item["sets"] or 2,
                    "reps": item["reps"],
                    "holdSeconds": item["holdSeconds"],
                    "frequencyPerWeek": item["frequencyPerWeek"],
                    "priority": item["priority"],
                    "displayOrder": order,
                    "source": "AUTO",
                    "reason": item["reason"],
                    "triggerMetricKeys": ",".join(item["triggerMetricKeys"]),
                }
            )

        return await db.exerciseplan.find_unique(
            where={"id": plan.id}, include=_PLAN_INCLUDE
        )

    @staticmethod
    async def preview_for_analysis(user, analysis_type: str, analysis_id: str) -> Dict[str, Any]:
        """
        Run the engine over an analysis without storing anything.

        Used by the report screen so a patient sees what their screening suggests the
        moment it finishes, and by a clinician deciding whether the draft is worth
        activating. Read-only, so it is safe to call repeatedly.
        """
        analysis_type = analysis_type.upper()
        table = _ANALYSIS_TABLES.get(analysis_type)
        if table is None:
            raise BadRequestException(f"Unknown analysis type '{analysis_type}'.")

        analysis = await getattr(db, table).find_unique(
            where={"id": analysis_id}, include={"booking": True}
        )
        if analysis is None:
            raise NotFoundException("Analysis not found.")

        from app.core.authz import can_access_analysis

        if not can_access_analysis(user, analysis, getattr(analysis, "booking", None)):
            raise NotFoundException("Analysis not found or access denied.")

        outcome = generate(getattr(analysis, "metricsJson", None), analysis_type)

        # Attach the catalogue rows so the client has video URLs and instructions
        # without a second round trip per exercise.
        slugs = [p["exerciseSlug"] for p in outcome["prescriptions"]]
        rows = (
            await db.exercise.find_many(where={"slug": {"in": slugs}}) if slugs else []
        )
        by_slug = {r.slug: r for r in rows}
        for prescription in outcome["prescriptions"]:
            row = by_slug.get(prescription["exerciseSlug"])
            definition = EXERCISES_BY_SLUG.get(prescription["exerciseSlug"])
            prescription["exercise"] = (
                ExercisePlanService._serialise_exercise(row, definition)
                if (row or definition)
                else None
            )
        return outcome

    # -------------------------------------------------------------------
    # Reading
    # -------------------------------------------------------------------

    @staticmethod
    async def list_plans(
        user,
        *,
        patient_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Any]:
        where: Dict[str, Any] = dict(plan_scope_filter(user))
        if patient_id:
            if is_patient(user) and patient_id != user.id:
                raise ForbiddenException("You can only view your own plans.")
            where["patientId"] = patient_id
        if status:
            requested = status.upper()
            if is_patient(user) and requested == "DRAFT":
                # The scope filter already excludes drafts; saying so beats returning
                # an empty list that reads like "you have no plans".
                raise ForbiddenException(
                    "A draft plan is not visible until your clinician has reviewed it."
                )
            where["status"] = requested
        return await db.exerciseplan.find_many(
            where=where,
            include=_PLAN_INCLUDE,
            order={"createdAt": "desc"},
            take=min(limit, 100),
            skip=offset,
        )

    @staticmethod
    async def get_plan(user, plan_id: str) -> Any:
        plan = await db.exerciseplan.find_first(
            where={"id": plan_id, **plan_scope_filter(user)}, include=_PLAN_INCLUDE
        )
        if plan is None:
            raise NotFoundException("Exercise plan not found or access denied.")
        return plan

    @staticmethod
    async def get_plan_for_analysis(
        user, analysis_type: str, analysis_id: str
    ) -> Optional[Any]:
        return await db.exerciseplan.find_first(
            where={
                "analysisType": analysis_type.upper(),
                "analysisId": analysis_id,
                **plan_scope_filter(user),
            },
            include=_PLAN_INCLUDE,
        )

    # -------------------------------------------------------------------
    # Review
    # -------------------------------------------------------------------

    @staticmethod
    async def update_plan(user, plan_id: str, data: Dict[str, Any]) -> Any:
        """Edit the plan's own fields - title, notes, duration. Staff only."""
        assert_can_review_plan(user)
        plan = await ExercisePlanService.get_plan(user, plan_id)

        editable = {"title", "summary", "clinicianNotes", "durationWeeks"}
        payload = {k: v for k, v in data.items() if k in editable and v is not None}
        if not payload:
            raise BadRequestException("Nothing to update.")
        return await db.exerciseplan.update(
            where={"id": plan.id}, data=payload, include=_PLAN_INCLUDE
        )

    @staticmethod
    async def add_item(user, plan_id: str, data: Dict[str, Any]) -> Any:
        """
        Put an exercise on the plan by hand. Staff only.

        Marked MANUAL so a later regeneration leaves it alone - see
        generate_for_analysis, which only clears AUTO items.
        """
        assert_can_review_plan(user)
        plan = await ExercisePlanService.get_plan(user, plan_id)

        exercise = await ExerciseCatalogueService.get_exercise(
            data.get("exerciseId") or data.get("exerciseSlug") or ""
        )

        existing = await db.exerciseplanitem.find_first(
            where={"planId": plan.id, "exerciseId": exercise.id}
        )
        if existing is not None:
            # Re-adding an exercise the clinician previously struck off is how they
            # undo that, so this restores rather than refusing.
            return await db.exerciseplanitem.update(
                where={"id": existing.id},
                data={
                    "isRemoved": False,
                    "source": "MANUAL",
                    **{
                        k: v
                        for k, v in data.items()
                        if k
                        in {"sets", "reps", "holdSeconds", "frequencyPerWeek", "clinicianNote"}
                        and v is not None
                    },
                },
                include={"exercise": True},
            )

        count = await db.exerciseplanitem.count(where={"planId": plan.id})
        return await db.exerciseplanitem.create(
            data={
                "planId": plan.id,
                "exerciseId": exercise.id,
                "sets": data.get("sets") or exercise.defaultSets,
                "reps": data.get("reps") if data.get("reps") is not None else exercise.defaultReps,
                "holdSeconds": (
                    data.get("holdSeconds")
                    if data.get("holdSeconds") is not None
                    else exercise.defaultHoldSeconds
                ),
                "frequencyPerWeek": data.get("frequencyPerWeek")
                or exercise.defaultFrequencyPerWeek,
                "displayOrder": count,
                "source": "MANUAL",
                "reason": data.get("reason") or "Added by your clinician.",
                "clinicianNote": data.get("clinicianNote"),
            },
            include={"exercise": True},
        )

    @staticmethod
    async def update_item(user, plan_id: str, item_id: str, data: Dict[str, Any]) -> Any:
        """Change dosage or notes on one exercise. Staff only."""
        assert_can_review_plan(user)
        await ExercisePlanService.get_plan(user, plan_id)

        item = await db.exerciseplanitem.find_first(
            where={"id": item_id, "planId": plan_id}
        )
        if item is None:
            raise NotFoundException("Exercise not found on this plan.")

        editable = {
            "sets",
            "reps",
            "holdSeconds",
            "frequencyPerWeek",
            "durationWeeks",
            "displayOrder",
            "clinicianNote",
            "isRemoved",
        }
        payload = {k: v for k, v in data.items() if k in editable and v is not None}
        if not payload:
            raise BadRequestException("Nothing to update.")
        return await db.exerciseplanitem.update(
            where={"id": item.id}, data=payload, include={"exercise": True}
        )

    @staticmethod
    async def remove_item(user, plan_id: str, item_id: str) -> Any:
        """
        Strike an exercise off. Staff only.

        A soft delete. A clinician deciding an auto-suggestion is wrong for this
        patient is itself a clinical judgement, and keeping the row keeps the record
        of it - and of who made it.
        """
        assert_can_review_plan(user)
        await ExercisePlanService.get_plan(user, plan_id)
        item = await db.exerciseplanitem.find_first(
            where={"id": item_id, "planId": plan_id}
        )
        if item is None:
            raise NotFoundException("Exercise not found on this plan.")
        return await db.exerciseplanitem.update(
            where={"id": item.id}, data={"isRemoved": True}, include={"exercise": True}
        )

    @staticmethod
    async def activate_plan(user, plan_id: str, notes: Optional[str] = None) -> Any:
        """
        Prescribe the plan: DRAFT becomes ACTIVE and the patient can see it.

        The single moment at which a machine suggestion becomes clinical advice, and
        the reason `reviewedById` is recorded - somebody's name is now on it.
        """
        assert_can_review_plan(user)
        plan = await ExercisePlanService.get_plan(user, plan_id)

        if plan.status == "ACTIVE":
            return plan
        if plan.status in ("COMPLETED", "ARCHIVED"):
            raise ConflictException(
                f"A {plan.status.lower()} plan cannot be activated. Generate a new one "
                f"from a fresh screening."
            )

        live_items = await db.exerciseplanitem.count(
            where={"planId": plan.id, "isRemoved": False}
        )
        if live_items == 0:
            raise BadRequestException(
                "This plan has no exercises on it. Add at least one before prescribing."
            )

        data: Dict[str, Any] = {
            "status": "ACTIVE",
            "reviewedById": user.id,
            "reviewedAt": _now(),
            "activatedAt": _now(),
        }
        if notes:
            data["clinicianNotes"] = notes
        return await db.exerciseplan.update(
            where={"id": plan.id}, data=data, include=_PLAN_INCLUDE
        )

    @staticmethod
    async def set_status(user, plan_id: str, status: str) -> Any:
        """Move a plan to COMPLETED or ARCHIVED. Staff only."""
        assert_can_review_plan(user)
        plan = await ExercisePlanService.get_plan(user, plan_id)
        status = status.upper()
        if status not in ("COMPLETED", "ARCHIVED", "ACTIVE"):
            raise BadRequestException(
                "Status must be ACTIVE, COMPLETED or ARCHIVED. A plan cannot be "
                "returned to DRAFT once it has been prescribed."
            )
        data: Dict[str, Any] = {"status": status}
        if status == "COMPLETED":
            data["completedAt"] = _now()
        return await db.exerciseplan.update(
            where={"id": plan.id}, data=data, include=_PLAN_INCLUDE
        )

    # -------------------------------------------------------------------
    # Adherence
    # -------------------------------------------------------------------

    @staticmethod
    async def log_completion(user, item_id: str, data: Dict[str, Any]) -> Any:
        """
        Patient records having done an exercise.

        Adherence is the strongest predictor of whether a home programme works, and
        without this the clinician is asking "how did you get on?" at the next
        appointment and believing the answer.
        """
        item = await db.exerciseplanitem.find_unique(
            where={"id": item_id}, include={"plan": True}
        )
        if item is None or item.plan is None:
            raise NotFoundException("Exercise not found.")

        plan = item.plan
        if plan.patientId != user.id and not (is_clinician(user) or is_admin(user)):
            raise NotFoundException("Exercise not found.")
        if plan.status != "ACTIVE":
            raise BadRequestException(
                "This plan is not active, so there is nothing to log against it."
            )
        if item.isRemoved:
            raise BadRequestException(
                "Your clinician has taken this exercise off your plan."
            )

        pain = data.get("painScore")
        if pain is not None and not 0 <= int(pain) <= 10:
            raise BadRequestException("Pain score must be between 0 and 10.")
        difficulty = data.get("difficultyRating")
        if difficulty is not None and not 1 <= int(difficulty) <= 5:
            raise BadRequestException("Difficulty rating must be between 1 and 5.")

        return await db.exercisecompletion.create(
            data={
                "planItemId": item.id,
                "patientId": plan.patientId,
                "setsDone": data.get("setsDone"),
                "repsDone": data.get("repsDone"),
                "painScore": pain,
                "difficultyRating": difficulty,
                "notes": data.get("notes"),
            }
        )

    @staticmethod
    async def adherence_summary(user, plan_id: str) -> Dict[str, Any]:
        """
        How much of this plan the patient has actually done.

        Expected sessions are counted from activation, not from plan creation: a draft
        that sat unreviewed for a week is not a week the patient failed to exercise.
        """
        plan = await ExercisePlanService.get_plan(user, plan_id)
        items = await db.exerciseplanitem.find_many(
            where={"planId": plan.id, "isRemoved": False}, include={"exercise": True}
        )
        completions = await db.exercisecompletion.find_many(
            where={"planItem": {"is": {"planId": plan.id}}}, order={"completedAt": "desc"}
        )

        start = plan.activatedAt or plan.createdAt
        days = max((_now() - _as_aware(start)).days, 0) + 1 if start else 1
        weeks = max(days / 7.0, 1 / 7.0)

        per_item: List[Dict[str, Any]] = []
        for item in items:
            done = [c for c in completions if c.planItemId == item.id]
            expected = max(round(item.frequencyPerWeek * weeks), 1)
            per_item.append(
                {
                    "itemId": item.id,
                    "exerciseName": item.exercise.name if item.exercise else None,
                    "completed": len(done),
                    "expected": expected,
                    "adherencePercent": round(min(len(done) / expected, 1.0) * 100),
                    "lastCompletedAt": done[0].completedAt if done else None,
                    "averagePainScore": (
                        round(
                            sum(c.painScore for c in done if c.painScore is not None)
                            / max(len([c for c in done if c.painScore is not None]), 1),
                            1,
                        )
                        if any(c.painScore is not None for c in done)
                        else None
                    ),
                }
            )

        total_done = sum(p["completed"] for p in per_item)
        total_expected = sum(p["expected"] for p in per_item) or 1
        return {
            "planId": plan.id,
            "status": plan.status,
            "activatedAt": plan.activatedAt,
            "daysActive": days,
            "overallAdherencePercent": round(min(total_done / total_expected, 1.0) * 100),
            "totalCompleted": total_done,
            "totalExpected": total_expected,
            "items": per_item,
        }

    # -------------------------------------------------------------------
    # Serialisation
    # -------------------------------------------------------------------

    @staticmethod
    def _serialise_exercise(row, definition=None) -> Dict[str, Any]:
        """
        One exercise, merging the database row with the code library.

        The row is authoritative for deployment data (video, active flag); the library
        is authoritative for clinical content. Reading instructions from the row when
        it has none, rather than returning null, is what stops a half-seeded database
        rendering an exercise card with no instructions on it.
        """
        if row is None and definition is not None:
            return {
                "id": None,
                "slug": definition.slug,
                "name": definition.name,
                "summary": definition.summary,
                "bodyRegion": definition.body_region.value,
                "difficulty": definition.difficulty.value,
                "equipment": list(definition.equipment),
                "instructions": list(definition.instructions),
                "cautions": definition.cautions,
                "reference": definition.reference,
                "videoUrl": None,
                "videoProvider": None,
                "thumbnailUrl": None,
                "durationSeconds": definition.duration_seconds,
            }

        instructions = row.instructions
        if not instructions and definition is not None:
            instructions = list(definition.instructions)

        return {
            "id": row.id,
            "slug": row.slug,
            "name": row.name,
            "summary": row.summary,
            "bodyRegion": row.bodyRegion,
            "difficulty": row.difficulty,
            "equipment": [e for e in (row.equipment or "").split(",") if e],
            "instructions": instructions or [],
            "cautions": row.cautions,
            "reference": row.reference,
            "videoUrl": row.videoUrl,
            "videoProvider": row.videoProvider,
            "thumbnailUrl": row.thumbnailUrl,
            "durationSeconds": row.durationSeconds,
            "isActive": row.isActive,
        }

    @staticmethod
    def serialise_plan(plan, *, viewer=None) -> Dict[str, Any]:
        items = getattr(plan, "items", None) or []
        staff_viewer = viewer is not None and (is_clinician(viewer) or is_admin(viewer))

        serialised_items = []
        for item in sorted(items, key=lambda i: (i.displayOrder, -i.priority)):
            # A struck-off exercise stays in the record for the clinician and
            # disappears for the patient, who should simply not be doing it.
            if item.isRemoved and not staff_viewer:
                continue
            definition = EXERCISES_BY_SLUG.get(
                item.exercise.slug if item.exercise else ""
            )
            serialised_items.append(
                {
                    "id": item.id,
                    "sets": item.sets,
                    "reps": item.reps,
                    "holdSeconds": item.holdSeconds,
                    "frequencyPerWeek": item.frequencyPerWeek,
                    "durationWeeks": item.durationWeeks,
                    "priority": item.priority,
                    "displayOrder": item.displayOrder,
                    "source": item.source,
                    "reason": item.reason,
                    "triggerMetricKeys": [
                        k for k in (item.triggerMetricKeys or "").split(",") if k
                    ],
                    "clinicianNote": item.clinicianNote,
                    "isRemoved": item.isRemoved,
                    "exercise": (
                        ExercisePlanService._serialise_exercise(item.exercise, definition)
                        if item.exercise
                        else None
                    ),
                }
            )

        patient = getattr(plan, "patient", None)
        reviewer = getattr(plan, "reviewedBy", None)

        return {
            "id": plan.id,
            "patientId": plan.patientId,
            "bookingId": plan.bookingId,
            "analysisType": plan.analysisType,
            "analysisId": plan.analysisId,
            "status": plan.status,
            "title": plan.title,
            "summary": plan.summary,
            "clinicianNotes": plan.clinicianNotes,
            # The raw findings are the clinician's working material - the borderline
            # ones especially, which exist to be judged rather than acted on.
            "findings": plan.findings if staff_viewer else _patient_findings(plan.findings),
            "engineVersion": plan.engineVersion,
            "durationWeeks": plan.durationWeeks,
            "reviewedAt": plan.reviewedAt,
            "activatedAt": plan.activatedAt,
            "completedAt": plan.completedAt,
            "createdAt": plan.createdAt,
            "reviewedBy": ({"id": reviewer.id, "name": reviewer.name} if reviewer else None),
            "patient": (
                {"id": patient.id, "name": patient.name} if patient and staff_viewer else None
            ),
            "items": serialised_items,
        }


def _patient_findings(findings) -> Any:
    """
    The findings a patient sees: the ones that were acted on.

    A borderline finding is a number that landed just outside its range by less than
    the system can reliably measure. Showing it to a patient invites them to worry
    about a measurement that will read differently next week; showing it to their
    clinician is the whole point of recording it.
    """
    if not isinstance(findings, list):
        return findings
    return [f for f in findings if isinstance(f, dict) and f.get("actionable")]


def _as_aware(value: Optional[datetime]) -> datetime:
    if value is None:
        return _now()
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
