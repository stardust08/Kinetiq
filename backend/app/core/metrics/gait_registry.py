"""
Gait metric registry.

Same contract as the posture registry: a metric is declared once, and the calibrator,
the API and the report all derive from that declaration. Normal ranges carry a citation
because we grade patients against them.

Two things changed materially from the previous implementation and are encoded here:

1. Spatial metrics are declared in RATIO units, normalised to the subject's own leg
   length, not in raw normalised-image units. The old `strideLength` was the ankle's
   horizontal pixel travel in the image, which changes with camera distance and with
   whether the subject walked across the frame or toward it. Dividing by leg length
   gives a dimensionless quantity that is comparable between sessions and subjects,
   and which has published reference values.

2. Gait kinematics are declared IMAGE_2D, not WORLD_3D. The gait client currently
   sends only 2D normalised landmarks, so declaring a 3D source would claim data the
   pipeline never receives. This is a real limitation: a side-view sagittal angle
   computed from the projection is correct only while the subject walks close to
   perpendicular to the camera, and degrades as they drift off that line. Sending
   poseWorldLandmarks for gait, as the posture path now does, would remove that
   sensitivity - see GaitWebcamCapture.

3. Metrics that were previously fabricated when detection failed - cadence clamped to
   [40, 200], stance hardcoded near 60/40, double support invented as step_time * 0.2 -
   now carry physical_range gates and are allowed to come back as insufficient_data.
"""

from __future__ import annotations

from dataclasses import replace

from typing import Dict, List

from app.core.metrics.registry import MetricSpec, Plane, Source, Status, Unit, View

# Reference for dimensionless spatial normalisation.
LEG_LENGTH_NOTE = (
    "Normalised to the subject's own leg length (hip-knee-ankle chain), so the value is "
    "dimensionless and comparable across sessions without a scale object in frame."
)

GAIT_METRICS: List[MetricSpec] = [
    # --- I. Temporal ------------------------------------------------------
    MetricSpec(
        key="cadence",
        clinical_name="Cadence",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.STEPS_PER_MIN,
        physical_range=(20.0, 220.0),
        normal_range=(100.0, 120.0),
        reference="Perry J & Burnfield JM, Gait Analysis: Normal and Pathological Function, 2nd ed., ch. 16",
        max_iqr=12.0,
        notes="Derived from detected heel-strike intervals. Previously clamped to [40,200], which silently turned a detection failure into a plausible number.",
    ),
    MetricSpec(
        key="stride_time_left",
        clinical_name="Stride time (left)",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.SECONDS,
        physical_range=(0.5, 3.0),
        normal_range=(0.98, 1.07),
        reference="Perry & Burnfield, 2nd ed., ch. 16",
        max_iqr=0.15,
    ),
    MetricSpec(
        key="stride_time_right",
        clinical_name="Stride time (right)",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.SECONDS,
        physical_range=(0.5, 3.0),
        normal_range=(0.98, 1.07),
        reference="Perry & Burnfield, 2nd ed., ch. 16",
        max_iqr=0.15,
    ),
    MetricSpec(
        key="stance_phase_percent",
        clinical_name="Stance phase",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.PERCENT,
        physical_range=(35.0, 85.0),
        normal_range=(60.0, 62.0),
        reference="Perry & Burnfield, 2nd ed., ch. 1",
        max_iqr=6.0,
        notes="Measured heel-strike to ipsilateral toe-off. NOT YET VALIDATED against instrumented reference; the synthetic harness has no ground-contact model.",
    ),
    MetricSpec(
        key="swing_phase_percent",
        clinical_name="Swing phase",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.PERCENT,
        physical_range=(15.0, 65.0),
        normal_range=(38.0, 40.0),
        reference="Perry & Burnfield, 2nd ed., ch. 1",
        max_iqr=6.0,
        notes="NOT YET VALIDATED - see stance_phase_percent.",
    ),
    MetricSpec(
        key="double_support_percent",
        clinical_name="Double support",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.PERCENT,
        physical_range=(0.0, 50.0),
        normal_range=(20.0, 24.0),
        reference="Perry & Burnfield, 2nd ed., ch. 1",
        max_iqr=8.0,
        notes="Replaces double_support_time, which was invented as step_time*0.2 clamped to [0.05,0.25]. NOT YET VALIDATED.",
    ),

    # --- II. Spatial (dimensionless) --------------------------------------
    MetricSpec(
        key="stride_length_ratio",
        clinical_name="Stride length / leg length",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.RATIO,
        physical_range=(0.3, 2.5),
        normal_range=(1.2, 1.6),
        reference=f"Hof AL, Gait & Posture 1996;4:222-223 (dimensionless normalisation). {LEG_LENGTH_NOTE}",
        max_iqr=0.25,
    ),
    MetricSpec(
        key="step_length_symmetry",
        clinical_name="Step length symmetry",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.PERCENT,
        physical_range=(0.0, 100.0),
        normal_range=(94.0, 100.0),
        reference="Patterson KK et al., Gait & Posture 2010;31:241-246",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="walking_speed_ratio",
        clinical_name="Walking speed (leg lengths/s)",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.RATIO,
        physical_range=(0.1, 3.0),
        normal_range=(1.1, 1.6),
        reference=f"Hof AL, Gait & Posture 1996;4:222-223. {LEG_LENGTH_NOTE}",
        max_iqr=0.3,
        notes="Replaces walking_speed, which was in normalised image units per second and not a physical quantity.",
    ),

    # --- III. Kinematic ---------------------------------------------------
    MetricSpec(
        key="knee_flexion_max",
        clinical_name="Peak knee flexion (swing)",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.DEGREES,
        landmarks=(23, 25, 27),
        physical_range=(0.0, 100.0),
        normal_range=(55.0, 65.0),
        reference="Perry & Burnfield, 2nd ed., ch. 4",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="knee_flexion_rom",
        clinical_name="Knee flexion range of motion",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.DEGREES,
        landmarks=(23, 25, 27),
        physical_range=(0.0, 100.0),
        normal_range=(50.0, 65.0),
        reference="Perry & Burnfield, 2nd ed., ch. 4",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="hip_flexion_max",
        clinical_name="Peak hip flexion",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.DEGREES,
        landmarks=(11, 23, 25),
        signed=True,
        physical_range=(-20.0, 70.0),
        normal_range=(20.0, 30.0),
        reference="Perry & Burnfield, 2nd ed., ch. 5",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="hip_extension_max",
        clinical_name="Peak hip extension",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.DEGREES,
        landmarks=(11, 23, 25),
        signed=True,
        physical_range=(-40.0, 30.0),
        normal_range=(10.0, 20.0),
        reference="Perry & Burnfield, 2nd ed., ch. 5",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="hip_flexion_rom",
        clinical_name="Hip flexion range of motion",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.DEGREES,
        landmarks=(11, 23, 25),
        physical_range=(0.0, 90.0),
        normal_range=(40.0, 50.0),
        reference="Perry & Burnfield, 2nd ed., ch. 5",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="trunk_sagittal_lean",
        clinical_name="Trunk sagittal lean during gait",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.DEGREES,
        landmarks=(11, 12, 23, 24),
        signed=True,
        physical_range=(-30.0, 45.0),
        normal_range=(0.0, 5.0),
        reference="Perry & Burnfield, 2nd ed., ch. 7",
        max_iqr=5.0,
        notes="Signed, positive = forward. Previously ~180 for every subject due to the unsigned arccos defect, then graded against a 0-5 range.",
    ),

    # --- IV. Frontal-plane, from the front view ---------------------------
    MetricSpec(
        key="step_width_ratio",
        clinical_name="Step width / leg length",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.IMAGE_2D,
        unit=Unit.RATIO,
        physical_range=(0.0, 0.8),
        normal_range=(0.06, 0.18),
        reference=f"Perry & Burnfield, 2nd ed., ch. 16. {LEG_LENGTH_NOTE}",
        max_iqr=0.08,
        notes="Sampled at double support only. The previous implementation averaged ankle separation across every frame including swing.",
    ),
    MetricSpec(
        key="trunk_lateral_sway_ratio",
        clinical_name="Trunk lateral sway / shoulder width",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.IMAGE_2D,
        unit=Unit.RATIO,
        physical_range=(0.0, 1.5),
        unsupported_reason=(
            "Cannot be separated from the walking path on a single front view. The "
            "subject approaches the camera, so a fixed lateral offset in metres subtends "
            "a growing angle and the path curves in the image; whatever polynomial is "
            "fitted to remove that curve also removes part of the sway. Certification "
            "measured 0 of 12 captures within tolerance, with the error an order of "
            "magnitude larger than the quantity. Needs a second camera, a known floor "
            "plane, or depth before it can be reported."
        ),
        reference="Descriptive; thresholds require local validation",
        max_iqr=0.15,
    ),

    # --- V. Functional ----------------------------------------------------
    MetricSpec(
        key="gait_symmetry_index",
        clinical_name="Gait symmetry index",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.PERCENT,
        physical_range=(0.0, 100.0),
        normal_range=(94.0, 100.0),
        reference="Patterson KK et al., Gait & Posture 2010;31:241-246",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="stride_time_variability",
        clinical_name="Stride time variability (CV)",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.PERCENT,
        physical_range=(0.0, 60.0),
        normal_range=(0.0, 3.0),
        reference="Hausdorff JM, Hum Mov Sci 2007;26:555-589",
        max_iqr=4.0,
        notes="Coefficient of variation of stride time. Replaces step_regularity (1-CV), which inverted a clinically standard quantity into a non-standard one.",
    ),
    MetricSpec(
        key="gait_cycle_count",
        clinical_name="Gait cycles analysed",
        plane=Plane.NONE,
        required_view=View.ANY_SIDE,
        source=Source.IMAGE_2D,
        unit=Unit.COUNT,
        physical_range=(0.0, 200.0),
        reference="Capture quality indicator, not a clinical finding",
        notes="Fewer than 3 valid cycles means every derived metric should be treated as low confidence.",
    ),

    # --- Retained for schema compatibility, not measurable ---------------
    MetricSpec(
        key="foot_progression_angle_left",
        clinical_name="Foot progression angle (left)",
        plane=Plane.TRANSVERSE,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "A transverse-plane angle between the long axis of the foot and the line of "
            "progression. From a sagittal or frontal camera the foot's transverse "
            "orientation is not observable, and MediaPipe provides a single toe point "
            "rather than a foot axis. The previous implementation measured a heel-to-toe "
            "vector against image vertical, which is a different quantity entirely."
        ),
    ),
    MetricSpec(
        key="foot_progression_angle_right",
        clinical_name="Foot progression angle (right)",
        plane=Plane.TRANSVERSE,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "See foot_progression_angle_left - the transverse foot axis is not observable "
            "from the captured views."
        ),
    ),
    MetricSpec(
        key="pelvic_obliquity_range",
        clinical_name="Pelvic obliquity range during gait",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "The previous implementation multiplied a normalised hip-height range by 100 "
            "and labelled the result degrees, then graded it against a 4-6 degree normal "
            "range. That conversion has no basis. A real obliquity angle needs the pelvis "
            "tracked in 3D across the cycle, which requires world landmarks the gait path "
            "does not yet receive."
        ),
    ),
    MetricSpec(
        key="ankle_dorsiflexion_max",
        clinical_name="Peak ankle dorsiflexion",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Requires the foot segment axis relative to the shank. MediaPipe's toe and "
            "heel points sit on a rigid triangle with the ankle, so the computed angle is "
            "dominated by landmark noise on a very short segment. Excluded until "
            "validated rather than reported with unknown error."
        ),
    ),
]

GAIT_BY_KEY: Dict[str, MetricSpec] = {m.key: m for m in GAIT_METRICS}


def supported_gait_metrics() -> List[MetricSpec]:
    return [m for m in GAIT_METRICS if m.is_supported]


# ---------------------------------------------------------------------------
# Grading safety gate
# ---------------------------------------------------------------------------
# A normal range is a promise that a value landing outside it means something about the
# patient. For a handful of metrics the measured error is wider than the range itself -
# certification put stance phase at +/-5 points against a 2-point-wide band - so the
# badge a report prints is decided by measurement noise, not by the person being
# screened. Those metrics keep their number and lose their range: the clinician still
# sees the measurement, the UI can no longer call it normal or abnormal.
#
# This is enforced here rather than in the UI so it cannot be forgotten by a second
# client. Re-run scripts/certify_accuracy.py after any change to the estimators; a
# metric whose tolerance drops below its range width can be taken off the list.

from app.core.metrics.tolerances import UNGRADEABLE as _UNGRADEABLE  # noqa: E402

# Metrics retired because certification could not stand behind the number at all, as
# opposed to merely not behind a verdict on it. Each carries its measured failure.
_RETIRED = {
    "hip_extension_max": (
        "Reads 6.9 degrees low on average and was within tolerance on 69% of certified "
        "captures. Terminal-stance hip extension is a brief extremum; smoothing wide "
        "enough to survive landmark noise attenuates it, and 30 fps sampling accounts "
        "for about half the remaining error. Needs 60 fps capture to report."
    ),
    "hip_flexion_rom": (
        "Inherits hip_extension_max's error, since the range is measured from it: "
        "7.0 degrees low, within tolerance on 66% of certified captures. Peak hip "
        "flexion (hip_flexion_max) is certified and is the half of this that survives."
    ),
    "knee_flexion_rom": (
        "Sampling-limited even at 60 fps. Gating it to captures measured above 58 fps "
        "lifted it from 85% within tolerance to 95%, but 95% is not the bar and only "
        "20% of captures cleared the gate, so the metric would appear and disappear "
        "between visits for reasons that have nothing to do with the patient. "
        "knee_flexion_max is certified and carries the clinically useful half of this."
    ),
    "gait_symmetry_index": (
        "Redundant and worse than its own input. It is the mean of stride-time symmetry "
        "and step_length_symmetry, so it carries no information step_length_symmetry "
        "does not, and averaging in the noisier stride-time term drags it from 97% "
        "within tolerance to 95% with a +3.7 point bias. Two numbers measuring one "
        "thing also read on a report as two independent findings. Use "
        "step_length_symmetry."
    ),
    "stride_time_variability": (
        "Reads 1.6 percentage points high against a 0-3% normal range, so a perfectly "
        "regular walker lands mid-band and an irregular one is indistinguishable from "
        "quantisation. Stride time is measured in whole frames, and at 30 fps one frame "
        "is 3% of a stride, which is the entire width of the normal range."
    ),
}

def _gate(spec):
    if spec.key in _RETIRED:
        return replace(spec, normal_range=None, unsupported_reason=_RETIRED[spec.key])
    if spec.key in _UNGRADEABLE:
        return replace(spec, normal_range=None, ungradeable_reason=_UNGRADEABLE[spec.key])
    return spec


GAIT_METRICS = [_gate(spec) for spec in GAIT_METRICS]


# Metrics that are only measurable above a minimum capture frame rate. Unlike the
# entries in _RETIRED these are not broken - they are sampling-limited, and the limit
# lifts when the camera runs faster. Certification at a pinned rate is what produced
# these numbers (scripts/certify_accuracy.py --fps 60):
#
#   knee_flexion_rom   30 fps: 85% within tolerance, bias -10.6 deg   -> withheld
#                      60 fps: 100% within tolerance, bias  -5.3 deg  -> reported
#
# The knee's extension trough is narrower than one frame at 30 fps, so neither
# smoothing nor interpolation can recover its depth; at 60 fps the trough spans enough
# samples to measure. The analyser checks the rate it MEASURED from frame timestamps,
# not the rate the client asked for.
MIN_FPS_REQUIRED = {
    # 58, not 50. The sampling limit lifts gradually: at a measured 52 fps the metric
    # certified at 93-94%, at 60 fps at 100%. The gate sits just under the rate where
    # it demonstrably holds, not at the rate where it merely starts improving.
    "knee_flexion_rom": 58,
}
