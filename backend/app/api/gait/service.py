"""Gait Analysis Service - business logic."""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import uuid
import math

from app.db.client import db
from app.core.exceptions import BadRequestException, UnauthorizedException
from app.core.metrics.registry import Status


class GaitAnalysisService:

    @staticmethod
    async def start_analysis(user_id: str, booking_id: str) -> Dict[str, Any]:
        booking = await db.booking.find_first(where={"id": booking_id, "userId": user_id})
        if not booking:
            raise UnauthorizedException("Booking not found or access denied.")
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException(
                f"No remaining screening counts. "
                f"Used: {booking.usedScreeningCount}/{booking.totalScreeningCount}."
            )
        valid_statuses = ["CONFIRMED", "COMPLETED"]
        if booking.status not in valid_statuses:
            raise BadRequestException(
                f"Booking status '{booking.status}' is not valid for analysis."
            )
        session_id = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(minutes=15)
        return {
            "sessionId": session_id,
            "bookingId": booking_id,
            "remainingCount": booking.remainingScreeningCount,
            "expiresAt": expires_at
        }

    @staticmethod
    async def finalize_analysis(
        user_id: str,
        booking_id: str,
        session_id: str,
        gait_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        # Validate booking
        booking = await db.booking.find_first(where={"id": booking_id, "userId": user_id})
        if not booking:
            raise UnauthorizedException("Booking not found or access denied.")
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException("No remaining screening counts.")

        # Build calibrator
        try:
            from app.core.gait.calibration_v2 import GaitAnalyser
            from app.core.metrics.legacy_mapping import gait_db_payload

            fps = int(gait_data.get("fps", 30))
            # Capture dimensions are needed to undo MediaPipe's anisotropic
            # normalisation (x by width, y by height). Without them the analyser
            # assumes 4:3 and flags that assumption on the stored result.
            width = gait_data.get("imageWidth") or gait_data.get("width")
            height = gait_data.get("imageHeight") or gait_data.get("height")
            aspect = (float(width) / float(height)) if width and height else None
            calibrator = GaitAnalyser(fps=fps, aspect_ratio=aspect)

            views_data = gait_data.get("views", {})
            if not views_data:
                raise BadRequestException("No view data provided. Please capture all 3 views.")

            for view_name, view_content in views_data.items():
                time_series = view_content.get("timeSeries", [])
                bg_image = view_content.get("backgroundImage")
                # Frame COUNT is the wrong gate once the capture rate can vary: 30
                # frames is a second at 30 fps and half a second at 60, and half a
                # second is not a gait cycle. Require a duration instead, so raising
                # the capture rate never silently lowers the bar.
                min_frames = max(30, int(2.0 * fps))
                if len(time_series) < min_frames:
                    raise BadRequestException(
                        f"Insufficient frames for '{view_name}' view: "
                        f"{len(time_series)} at {fps} fps is under the {min_frames} "
                        f"(2 seconds) needed to detect a gait cycle."
                    )
                calibrator.add_view(view_name, time_series, bg_image)

            metrics = calibrator.finalize(person_id=user_id)
            if not metrics:
                raise BadRequestException(
                    "Failed to calculate gait metrics. Please ensure good lighting "
                    "and full body visibility during capture."
                )

            # finalize() always returns a result object, so the truthiness check above
            # never fires - it passes just as happily for a capture in which not one
            # metric could be measured. That capture used to be stored and charged for:
            # the patient loses a screening credit and receives a report of dashes, and
            # has to walk again anyway. If nothing was measured, the capture failed.
            measured = [
                m for m in metrics.metrics.values()
                if m.value is not None and m.status in (Status.MEASURED, Status.LOW_CONFIDENCE)
            ]
            if not measured:
                raise BadRequestException(
                    "No gait metrics could be measured from this capture. The subject "
                    "may not have been fully in frame, or may not have walked across "
                    "the camera. Please record again - this attempt has not been "
                    "counted against your screenings."
                )

        except BadRequestException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise BadRequestException(f"Gait metric calculation failed: {str(e)}")

        captured_views = gait_data.get("capturedViews", ",".join(views_data.keys()))
        total_frames = int(gait_data.get("totalFrames", sum(
            len(v.get("timeSeries", [])) for v in views_data.values()
        )))

        # Create GaitAnalysis record + deduct count atomically
        try:
            analysis = await db.gaitanalysis.create(
                data={
                    "user": {"connect": {"id": user_id}},
                    "booking": {"connect": {"id": booking_id}},

                    # Legacy columns receive a value only where the v2 metric measures
                    # the same quantity in the same unit; everything else is NULL and
                    # the truth lives in metricsJson. See core/metrics/legacy_mapping.
                    **_wrap_json(gait_db_payload(metrics)),

                    "capturedViews": captured_views,
                    "totalFrames": total_frames,
                    "status": "completed",
                }
            )

            # Save GaitFrames — store only gait phases + heel strikes, not full landmarks or background image
            # (Storing full landmark JSON per frame × 3 views is too large for DB inserts)
            if metrics.annotated_views:
                try:
                    for view_name, view_data in metrics.annotated_views.items():
                        ts = view_data.get("timeSeries", [])
                        hs = view_data.get("heelStrikes", {})
                        fc = view_data.get("frameCount", len(ts))

                        # Slim down: only store frameIndex + gaitPhase + isHeelStrike per frame
                        slim_ts = [
                            {
                                "frameIndex": f.get("frameIndex", i),
                                "gaitPhase": f.get("gaitPhase", "unknown"),
                                "isHeelStrike": f.get("isHeelStrike", False),
                                "timestamp": f.get("timestamp", 0),
                            }
                            for i, f in enumerate(ts)
                        ]

                        await db.gaitframes.create(
                            data={
                                "analysis": {"connect": {"id": analysis.id}},
                                "viewType": view_name,
                                "imageData": None,          # Not stored in DB — frontend holds it
                                "annotatedTimeSeries": slim_ts,
                                "heelStrikes": hs,
                                "frameCount": fc,
                            }
                        )
                except Exception as frame_err:
                    import traceback
                    traceback.print_exc()
                    # Frame storage failure is non-fatal — metrics are saved, skeleton playback unavailable
                    print(f"[warn] GaitFrames storage failed ({frame_err}); continuing without frame data")

            # Atomic screening count deduction
            await db.booking.update(
                where={"id": booking_id},
                data={
                    "usedScreeningCount": {"increment": 1},
                    "remainingScreeningCount": {"decrement": 1},
                }
            )

            updated_booking = await db.booking.find_unique(where={"id": booking_id})
            remaining = updated_booking.remainingScreeningCount if updated_booking else 0

            analysis_with_frames = await db.gaitanalysis.find_unique(
                where={"id": analysis.id},
                include={"gaitFrames": True}
            )

            serialized = GaitAnalysisService._serialize_analysis(analysis_with_frames)

            # Attach full annotated views (with landmarks) directly from calibration
            # result so the frontend can do skeleton playback without needing a DB refetch.
            # These are NOT stored in DB (too large) but returned in this response only.
            if metrics.annotated_views:
                live_frames = {}
                for vn, vd in metrics.annotated_views.items():
                    live_frames[vn] = {
                        "viewType": vn,
                        "imageData": vd.get("backgroundImage"),
                        "annotatedTimeSeries": vd.get("timeSeries", []),
                        "heelStrikes": vd.get("heelStrikes", {}),
                        "toeOffs": vd.get("toeOffs", {}),
                        "frameCount": vd.get("frameCount", 0),
                    }
                serialized["gaitFrames"] = live_frames

            return {
                "analysis": serialized,
                "remainingCount": remaining
            }

        except BadRequestException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise BadRequestException(f"Failed to save gait analysis: {str(e)}")

    @staticmethod
    async def cancel_analysis(session_id: str) -> Dict[str, Any]:
        return {
            "message": "Gait analysis cancelled successfully. No screening count was deducted.",
            "sessionId": session_id
        }

    @staticmethod
    async def get_user_analyses(
        user_id: str,
        booking_id: Optional[str] = None,
        limit: int = 10,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        where = {"userId": user_id, "isActive": True}
        if booking_id:
            where["bookingId"] = booking_id

        analyses = await db.gaitanalysis.find_many(
            where=where,
            order={"analysisDate": "desc"},
            skip=offset,
            take=limit,
            include={"booking": {"include": {"service": True}}}
        )
        return [GaitAnalysisService._serialize_analysis(a) for a in analyses]

    @staticmethod
    async def get_analysis_by_id(
        analysis_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        analysis = await db.gaitanalysis.find_first(
            where={"id": analysis_id, "userId": user_id, "isActive": True},
            include={
                "gaitFrames": True,
                "booking": {"include": {"service": True}}
            }
        )
        if not analysis:
            return None
        return GaitAnalysisService._serialize_analysis(analysis)

    @staticmethod
    async def validate_booking(booking_id: str, user_id: str) -> Dict[str, Any]:
        booking = await db.booking.find_first(where={"id": booking_id, "userId": user_id})
        if not booking:
            return {
                "valid": False,
                "remainingCount": 0,
                "totalCount": 0,
                "usedCount": 0,
                "message": "Booking not found or access denied."
            }
        valid = (
            booking.remainingScreeningCount > 0 and
            booking.status in ["CONFIRMED", "COMPLETED"]
        )
        return {
            "valid": valid,
            "remainingCount": booking.remainingScreeningCount,
            "totalCount": booking.totalScreeningCount,
            "usedCount": booking.usedScreeningCount,
            "message": None if valid else "No remaining screening counts or invalid booking status."
        }

    @staticmethod
    def _serialize_analysis(analysis) -> Dict[str, Any]:
        if not analysis:
            return {}

        result = {
            "id": analysis.id,
            "userId": analysis.userId,
            "bookingId": analysis.bookingId,
            "analysisDate": analysis.analysisDate.isoformat() if analysis.analysisDate else None,
            "capturedViews": analysis.capturedViews,
            "totalFrames": analysis.totalFrames,
            "status": analysis.status,
            # v2 payload: per-metric value + status + normal range + citation. The
            # frontend renders from this so it cannot grade a patient against a
            # threshold the backend did not define. `metrics` below is the legacy flat
            # view, kept for pre-rewrite records and older clients.
            "schemaVersion": getattr(analysis, "schemaVersion", 1),
            "metricsJson": getattr(analysis, "metricsJson", None),
            "qualityFlags": getattr(analysis, "qualityFlags", None),
            "cyclesAnalysed": getattr(analysis, "cyclesAnalysed", None),
            "metrics": {
                # I. Temporal
                "cadence": analysis.cadence,
                "strideTimeLeft": analysis.strideTimeLeft,
                "strideTimeRight": analysis.strideTimeRight,
                "stancePhasePercent": analysis.stancePhasePercent,
                "swingPhasePercent": analysis.swingPhasePercent,
                "doubleSupportTime": analysis.doubleSupportTime,
                # II. Spatial
                "strideLength": analysis.strideLength,
                "stepLengthLeft": analysis.stepLengthLeft,
                "stepLengthRight": analysis.stepLengthRight,
                "stepWidth": analysis.stepWidth,
                "walkingSpeed": analysis.walkingSpeed,
                "stepLengthSymmetry": analysis.stepLengthSymmetry,
                # III. Kinematic
                "hipFlexionMax": analysis.hipFlexionMax,
                "hipExtensionMax": analysis.hipExtensionMax,
                "hipFlexionRom": analysis.hipFlexionRom,
                "kneeFlexionMax": analysis.kneeFlexionMax,
                "kneeExtensionMin": analysis.kneeExtensionMin,
                "kneeFlexionRom": analysis.kneeFlexionRom,
                "leftKneeAngleAvg": analysis.leftKneeAngleAvg,
                "rightKneeAngleAvg": analysis.rightKneeAngleAvg,
                "ankleDorsiflexionMax": analysis.ankleDorsiflexionMax,
                "footProgressionAngleLeft": analysis.footProgressionAngleLeft,
                "footProgressionAngleRight": analysis.footProgressionAngleRight,
                "armSwingAmplitude": analysis.armSwingAmplitude,
                # IV. Trunk & Pelvis
                "trunkLateralSway": analysis.trunkLateralSway,
                "trunkSagittalLean": analysis.trunkSagittalLean,
                "pelvicObliquityRange": analysis.pelvicObliquityRange,
                "armSwingSymmetry": analysis.armSwingSymmetry,
                # V. Scores
                "gaitSymmetryIndex": analysis.gaitSymmetryIndex,
                "stepRegularity": analysis.stepRegularity,
                "gaitQualityScore": analysis.gaitQualityScore,
                "gaitCycleCount": analysis.gaitCycleCount,
            }
        }

        # Include gait frames (annotated time series for skeleton playback)
        if hasattr(analysis, 'gaitFrames') and analysis.gaitFrames:
            frames_by_view = {}
            for gf in analysis.gaitFrames:
                frames_by_view[gf.viewType] = {
                    "viewType": gf.viewType,
                    "imageData": gf.imageData,
                    "annotatedTimeSeries": gf.annotatedTimeSeries,
                    "heelStrikes": gf.heelStrikes,
                    "frameCount": gf.frameCount,
                }
            result["gaitFrames"] = frames_by_view

        # Include booking info if available
        if hasattr(analysis, 'booking') and analysis.booking:
            result["booking"] = {
                "id": analysis.booking.id,
                "service": {
                    "name": analysis.booking.service.name if analysis.booking.service else None
                }
            }

        return result


def _wrap_json(payload: dict) -> dict:
    """
    Wrap dict-valued columns in prisma.Json.

    Prisma Python will not accept a bare dict for a Json column - it needs the Json
    marker type to distinguish a JSON value from a nested relation input, and the error
    it raises otherwise ("should be of any of the following types: Json") is misleading
    because it also complains about an unrelated missing userId.
    """
    from prisma import Json

    return {
        key: (Json(value) if isinstance(value, (dict, list)) else value)
        for key, value in payload.items()
    }
