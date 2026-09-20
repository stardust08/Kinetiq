"""
Mapping from v2 metric results onto the legacy database columns.

The legacy columns are retained so existing readers keep working, but they are filled
conservatively. A legacy column receives a value ONLY when the v2 metric measures the
same quantity in the same unit. Where the meaning or unit changed - pixels became a
dimensionless ratio, an unsigned pixel difference became a signed angle - the legacy
column is written as NULL rather than being quietly repurposed.

That is deliberate. Silently writing a ratio into a column named `fhdPixels`, or degrees
into `pelvicObliquity` which used to hold pixels, would corrupt every historical
comparison and trend line drawn from those columns. A NULL is recoverable; a
same-named-different-meaning number is not.

`metricsJson` carries the full v2 payload and is what new readers should use.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.core.metrics.registry import Status

# legacy column -> v2 metric key, for quantities that are genuinely unchanged.
POSTURE_LEGACY_MAP: Dict[str, str] = {
    "headLateralFlexion": "head_lateral_flexion",
    "thoracicKyphosisAngle": "thoracic_kyphosis_angle",
    "trunkAngle": "trunk_angle",
    "leftHipAngle": "left_hip_angle",
    "rightHipAngle": "right_hip_angle",
    "leftKneeAngle": "left_knee_angle",
    "rightKneeAngle": "right_knee_angle",
    "kneeVarusValgus": "knee_varus_valgus",
}

# Legacy columns deliberately left NULL, with the reason. Kept explicit so the decision
# is reviewable rather than implied by absence.
POSTURE_LEGACY_RETIRED: Dict[str, str] = {
    "fhdPixels": "superseded by forward_head_ratio (dimensionless, not pixels)",
    "cervicalAngle": "was a duplicate of head tilt, not a craniovertebral angle",
    "roundedShoulderAngle": "unsupported - not separable from trunk lean without a thoracic landmark",
    "headRotation": "unsupported - was a distance ratio reported as a percentage",
    "lumbarLordosisAngle": "not measurable from surface landmarks; removed pending validation",
    "trunkLateralShift": "superseded by trunk_lateral_shift_ratio (dimensionless)",
    "leftShoulderAngle": "not part of the validated posture set",
    "rightShoulderAngle": "not part of the validated posture set",
    "shoulderHeightDiff": "superseded by shoulder_obliquity (signed degrees, not pixels)",
    "leftElbowAngle": "not part of the validated posture set",
    "rightElbowAngle": "not part of the validated posture set",
    "pelvicObliquity": "superseded by pelvic_obliquity in signed degrees; unit changed from pixels",
    "pelvicTiltAngle": "unsupported - requires ASIS/PSIS landmarks",
    "hipHeightDiff": "was a duplicate of pelvicObliquity",
    "kneeFlexionNeutral": "was hardcoded to 0.0",
    "qAngleLeft": "unsupported - requires ASIS and patella landmarks",
    "qAngleRight": "unsupported - requires ASIS and patella landmarks",
    "footProgressionAngle": "unsupported in static standing - no line of progression",
    "pronationSupinationLeft": "unsupported - requires a calcaneal axis",
    "pronationSupinationRight": "unsupported - requires a calcaneal axis",
    "shoulderWidth": "superseded by shoulder_hip_width_ratio; pixel widths are not comparable",
    "hipWidth": "superseded by shoulder_hip_width_ratio",
    "torsoLength": "pixel length, not comparable between sessions",
    "leftArmLength": "pixel length, not comparable between sessions",
    "rightArmLength": "pixel length, not comparable between sessions",
    "leftLegLength": "superseded by leg_length_asymmetry_ratio",
    "rightLegLength": "superseded by leg_length_asymmetry_ratio",
}

GAIT_LEGACY_MAP: Dict[str, str] = {
    "cadence": "cadence",
    "strideTimeLeft": "stride_time_left",
    "strideTimeRight": "stride_time_right",
    "stancePhasePercent": "stance_phase_percent",
    "swingPhasePercent": "swing_phase_percent",
    "stepLengthSymmetry": "step_length_symmetry",
    "hipFlexionMax": "hip_flexion_max",
    "hipExtensionMax": "hip_extension_max",
    "hipFlexionRom": "hip_flexion_rom",
    "kneeFlexionMax": "knee_flexion_max",
    "kneeFlexionRom": "knee_flexion_rom",
    "trunkSagittalLean": "trunk_sagittal_lean",
    "gaitSymmetryIndex": "gait_symmetry_index",
    "gaitCycleCount": "gait_cycle_count",
}

GAIT_LEGACY_RETIRED: Dict[str, str] = {
    "doubleSupportTime": "superseded by double_support_percent; the seconds value was invented as step_time*0.2",
    "strideLength": "superseded by stride_length_ratio; the old value was pixel travel in the image",
    "stepLengthLeft": "superseded by stride_length_ratio and step_length_symmetry",
    "stepLengthRight": "superseded by stride_length_ratio and step_length_symmetry",
    "stepWidth": "superseded by step_width_ratio (normalised to leg length)",
    "walkingSpeed": "superseded by walking_speed_ratio; the old value was in normalised image units/sec",
    "kneeExtensionMin": "not part of the validated gait set",
    "leftKneeAngleAvg": "a whole-capture mean over a cyclic signal is not clinically meaningful",
    "rightKneeAngleAvg": "a whole-capture mean over a cyclic signal is not clinically meaningful",
    "ankleDorsiflexionMax": "unsupported - short segment dominated by landmark noise",
    "footProgressionAngleLeft": "unsupported - transverse plane not observable from these views",
    "footProgressionAngleRight": "unsupported - transverse plane not observable from these views",
    "armSwingAmplitude": "pixel range, not comparable between sessions",
    "armSwingSymmetry": "derived from an uncalibrated pixel range",
    "trunkLateralSway": "superseded by trunk_lateral_sway_ratio",
    "pelvicObliquityRange": "unsupported - the previous degrees conversion had no basis",
    "stepRegularity": "superseded by stride_time_variability (CV), the clinically standard form",
    "gaitQualityScore": "a weighted composite of metrics that were themselves invalid; removed pending redefinition",
}


def _value(result, key: str) -> Optional[float]:
    """Legacy columns receive a number only for a genuinely measured metric."""
    metric = result.metrics.get(key)
    if metric is None or metric.value is None:
        return None
    if metric.status not in (Status.MEASURED, Status.LOW_CONFIDENCE):
        return None
    return float(metric.value)


def _quality_flags(result) -> Dict[str, Any]:
    counts: Dict[str, int] = {}
    for metric in result.metrics.values():
        counts[metric.status.value] = counts.get(metric.status.value, 0) + 1
    flags: Dict[str, Any] = {
        "statusCounts": counts,
        "viewsCaptured": list(result.views_captured),
    }
    if getattr(result, "aspect_assumed", False):
        flags["aspectRatioAssumed"] = (
            "Capture dimensions were not reported, so a 4:3 frame was assumed. "
            "Angles and distances may be skewed if the real capture was not 4:3."
        )
    low = [m.key for m in result.metrics.values() if m.status == Status.LOW_CONFIDENCE]
    if low:
        flags["lowConfidenceMetrics"] = low
    return flags


def posture_db_payload(result) -> Dict[str, Any]:
    """Legacy columns + the v2 payload, ready to merge into a Prisma create()."""
    payload: Dict[str, Any] = {col: _value(result, key) for col, key in POSTURE_LEGACY_MAP.items()}
    payload.update({col: None for col in POSTURE_LEGACY_RETIRED})
    payload["metricsJson"] = result.to_dict()
    payload["qualityFlags"] = _quality_flags(result)
    payload["schemaVersion"] = result.schema_version
    return payload


def gait_db_payload(result) -> Dict[str, Any]:
    payload: Dict[str, Any] = {col: _value(result, key) for col, key in GAIT_LEGACY_MAP.items()}
    payload.update({col: None for col in GAIT_LEGACY_RETIRED})
    # gaitCycleCount is an Int column.
    cycles = payload.get("gaitCycleCount")
    payload["gaitCycleCount"] = int(cycles) if cycles is not None else None
    payload["cyclesAnalysed"] = result.cycles_analysed
    payload["metricsJson"] = result.to_dict()
    payload["qualityFlags"] = _quality_flags(result)
    payload["schemaVersion"] = result.schema_version
    return payload
