"""
Range-of-motion screening service.

Mirrors the gait service's contract, including the parts that exist because of specific
failures: a capture in which nothing could be measured is rejected rather than stored
and charged for, and the screening count is only deducted once an analysis row exists.
"""

from datetime import datetime, timezone
from typing import Any, Dict

from app.db.client import db
from app.core.exceptions import BadRequestException, UnauthorizedException
from app.core.metrics.registry import Status
from app.core.pose.rom_v2 import ROMCalibrator

# What each movement the patient performs is captured from, and what it measures.
#
# The metric registry declares each metric's plane and required view; this maps the
# MOVEMENT onto them. It is kept server-side and authoritative rather than read off the
# request, because the client sends the frames and must not also get to say what they
# prove.
#
# The metric list is explicit rather than derived from the key by pattern. Matching on a
# stem instead - "does 'shoulder_flexion' appear in this key" - attributed BOTH sides'
# metrics to every single-sided hold, so a right-arm hold also wrote a left shoulder
# flexion reading, measured off an arm that was hanging at the patient's side and
# occluded behind their body. With both holds captured the later one overwrote it and
# the result looked right; with the left hold dropped for any reason - a failed
# orientation check, a short hold, a patient who stopped - the fabricated reading was
# what got reported, and a hanging arm reads as a near-total loss of range.
MOVEMENTS: Dict[str, Dict[str, Any]] = {
    "shoulder_abduction": {
        "view": "front",
        "metrics": ("rom_shoulder_abduction_left", "rom_shoulder_abduction_right"),
    },
    "cervical_lateral_flexion": {
        "view": "front",
        "metrics": ("rom_cervical_lateral_flexion",),
    },
    "shoulder_flexion_left": {
        "view": "leftside",
        "metrics": ("rom_shoulder_flexion_left",),
    },
    "shoulder_flexion_right": {
        "view": "rightside",
        "metrics": ("rom_shoulder_flexion_right",),
    },
    "elbow_flexion_left": {"view": "leftside", "metrics": ("rom_elbow_flexion_left",)},
    "elbow_flexion_right": {"view": "rightside", "metrics": ("rom_elbow_flexion_right",)},
    "hip_flexion_left": {"view": "leftside", "metrics": ("rom_hip_flexion_left",)},
    "hip_flexion_right": {"view": "rightside", "metrics": ("rom_hip_flexion_right",)},
    "knee_flexion_left": {"view": "leftside", "metrics": ("rom_knee_flexion_left",)},
    "knee_flexion_right": {"view": "rightside", "metrics": ("rom_knee_flexion_right",)},
}

MOVEMENT_VIEWS = {name: spec["view"] for name, spec in MOVEMENTS.items()}

# Booking statuses a screening may be started against, matching
# app/api/posture/service.py and app/api/gait/service.py.
VALID_BOOKING_STATUSES = ("CONFIRMED", "COMPLETED")

MIN_FRAMES_PER_HOLD = 20


def _wrap_json(payload: Dict[str, Any]) -> Dict[str, Any]:
    from prisma import Json

    return {k: (Json(v) if isinstance(v, (dict, list)) else v) for k, v in payload.items()}


class ROMAnalysisService:
    @staticmethod
    async def start_analysis(user_id: str, booking_id: str) -> Dict[str, Any]:
        booking = await db.booking.find_first(where={"id": booking_id, "userId": user_id})
        if not booking:
            raise UnauthorizedException("Booking not found or access denied.")
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException("No remaining screening counts for this booking.")
        # Same rule the posture and gait services enforce. ROM was missing it, so a
        # cancelled booking could start a ROM screening while the other two refused it -
        # the patient would perform all ten movements and only then be told.
        if booking.status not in VALID_BOOKING_STATUSES:
            raise BadRequestException(
                f"Booking status '{booking.status}' is not valid for analysis."
            )
        import uuid

        return {
            "sessionId": str(uuid.uuid4()),
            "bookingId": booking_id,
            "remainingCount": booking.remainingScreeningCount,
            "movements": list(MOVEMENT_VIEWS),
        }

    @staticmethod
    async def finalize_analysis(
        user_id: str, booking_id: str, session_id: str, rom_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        booking = await db.booking.find_first(where={"id": booking_id, "userId": user_id})
        if not booking:
            raise UnauthorizedException("Booking not found or access denied.")
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException("No remaining screening counts.")
        if booking.status not in VALID_BOOKING_STATUSES:
            raise BadRequestException(
                f"Booking status '{booking.status}' is not valid for analysis."
            )

        movements = rom_data.get("movements") or {}
        if not movements:
            raise BadRequestException(
                "No movement data provided. Capture at least one end-range hold."
            )

        width = rom_data.get("imageWidth")
        height = rom_data.get("imageHeight")
        aspect = (float(width) / float(height)) if width and height else None
        normalised = rom_data.get("coordinateSpace", "normalized") == "normalized"

        # One calibrator per movement. ROM is measured on a held position, and holds are
        # performed one at a time - pooling every movement's frames into one calibrator
        # would let a shoulder hold contribute frames to a knee measurement.
        all_metrics: Dict[str, Any] = {}
        captured = []
        total_frames = 0
        orientation_warnings: list = []
        frames_per_movement: Dict[str, int] = {}
        frames_per_view: Dict[str, int] = {}
        aspect_assumed = False

        for movement, payload in movements.items():
            samples = payload.get("samples") or []
            if len(samples) < MIN_FRAMES_PER_HOLD:
                raise BadRequestException(
                    f"Too few frames for '{movement}': {len(samples)}. At least "
                    f"{MIN_FRAMES_PER_HOLD} are needed to measure a steady hold."
                )
            spec = MOVEMENTS.get(movement)
            if spec is None:
                raise BadRequestException(f"Unknown movement '{movement}'.")
            # The view comes from the server's map, not from the request. A client that
            # labels a right-side hold "leftside" would otherwise have the far limb
            # measured through the near one and reported as the patient's range.
            view = spec["view"]

            calibrator = ROMCalibrator(normalised_input=normalised, aspect_ratio=aspect)
            for sample in samples:
                calibrator.add_sample(sample, view=view)

            result = calibrator.finalize(person_id=user_id, movement=movement)
            captured.append(movement)
            total_frames += len(samples)
            frames_per_movement[movement] = len(samples)
            frames_per_view[view] = frames_per_view.get(view, 0) + len(samples)
            # A hold performed facing the wrong way measures the FAR limb through the
            # near one. The browser blocks it while the patient is still standing there;
            # this is the second opinion, because the browser can be bypassed and a
            # mirrored preview can fool a person. The numbers are still reported - every
            # sign is derived from the anatomy - but the operator is told which movement
            # to re-capture.
            orientation_warnings.extend(result.orientation_warnings)
            aspect_assumed = aspect_assumed or result.aspect_assumed

            # Keep only the metrics this movement was performed to measure. The
            # calibrator computes every metric in the registry from whatever frames it
            # is given, so the rest are readings of joints the patient was not moving.
            for key in spec["metrics"]:
                metric = result.metrics.get(key)
                if metric is not None:
                    all_metrics[key] = metric

        measured = [
            m
            for m in all_metrics.values()
            if m.value is not None and m.status in (Status.MEASURED, Status.LOW_CONFIDENCE)
        ]
        if not measured:
            raise BadRequestException(
                "No range of motion could be measured from this capture. Check that the "
                "whole body was visible and that each position was held steady. This "
                "attempt has not been counted against your screenings."
            )

        # The full MetricsPayload contract the report is typed against
        # (frontend/src/types/metrics.ts). calibrationDate, personId and viewsCaptured
        # are REQUIRED there and were all absent: the payload carried metrics and a
        # schema version. TypeScript could not catch it - the value arrives as JSON and
        # is asserted into the type at the boundary - so the report simply rendered
        # without a capture date and the one consumer that reads viewsCaptured survived
        # only because it happens to guard for undefined.
        payload = {
            "calibrationDate": datetime.now(timezone.utc).isoformat(),
            "personId": str(user_id),
            "schemaVersion": 2,
            "viewsCaptured": sorted({MOVEMENTS[m]["view"] for m in captured}),
            "framesPerView": frames_per_view,
            "capturedMovements": captured,
            "framesPerMovement": frames_per_movement,
            # Read by the report's quality banner. Both were computed and then dropped
            # on the floor before: the stored payload carried metrics and nothing else,
            # so a capture taken at an assumed aspect ratio, or one performed facing the
            # wrong way, reached the clinician with no indication of either.
            "aspectAssumed": aspect_assumed,
            "orientationWarnings": orientation_warnings,
            "metrics": {k: v.to_dict() for k, v in all_metrics.items()},
        }

        status_counts: Dict[str, int] = {}
        for metric in all_metrics.values():
            name = metric.status.value
            status_counts[name] = status_counts.get(name, 0) + 1
        low_confidence = [
            m.key for m in all_metrics.values() if m.status == Status.LOW_CONFIDENCE
        ]
        quality_flags: Dict[str, Any] = {
            "statusCounts": status_counts,
            "viewsCaptured": sorted({MOVEMENTS[m]["view"] for m in captured}),
        }
        if aspect_assumed:
            quality_flags["aspectRatioAssumed"] = (
                "Capture dimensions were not reported, so a 4:3 frame was assumed. "
                "Angles may be skewed if the real capture was not 4:3."
            )
        if low_confidence:
            quality_flags["lowConfidenceMetrics"] = low_confidence

        try:
            analysis = await db.romanalysis.create(
                data={
                    "user": {"connect": {"id": user_id}},
                    "booking": {"connect": {"id": booking_id}},
                    **_wrap_json({"metricsJson": payload, "qualityFlags": quality_flags}),
                    "capturedMovements": ",".join(captured),
                    "totalFrames": total_frames,
                    "status": "completed",
                }
            )
            updated = await db.booking.update(
                where={"id": booking_id},
                data={
                    "usedScreeningCount": {"increment": 1},
                    "remainingScreeningCount": {"decrement": 1},
                },
            )
        except Exception as exc:  # noqa: BLE001
            raise BadRequestException(
                f"Failed to save range-of-motion analysis: {exc}. No screening count was "
                f"deducted. Please retry."
            )

        return {"analysis": analysis, "remainingCount": updated.remainingScreeningCount}

    @staticmethod
    async def get_user_analyses(user_id: str, limit: int = 10, offset: int = 0):
        rows = await db.romanalysis.find_many(
            where={"userId": user_id},
            order={"analysisDate": "desc"},
            skip=offset,
            take=limit,
        )
        return [r.model_dump() for r in rows]
