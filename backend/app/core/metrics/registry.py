"""
Metric registry: the single source of truth for every clinical metric.

Before this existed, a metric's definition was spread across three places that could
drift independently - the computation in calibration.py, the field name in the Prisma
schema, and the "normal range" hardcoded in the React report template. That drift is
how a trunk angle that always returned ~180 degrees ended up being graded against a
"0-5 degrees" normal range and badged Severe for every patient.

Now a metric is declared once, here, and everything downstream is derived:
  - the calibrator reads `required_view` and `source` to decide what data it may use
  - `physical_range` catches computation defects before a result is ever stored
  - the API serialises `normal_range` and `unit` to the frontend, so the report cannot
    grade a metric against a range the backend did not define
  - `status` tells the UI when to render "not measurable" instead of a number

Adding a metric without a citation for its normal range is deliberately awkward. If
we cannot cite it, we should not be grading patients against it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple


class Plane(str, Enum):
    SAGITTAL = "sagittal"      # side-on: flexion / extension
    FRONTAL = "frontal"        # face-on: abduction / lateral lean / obliquity
    TRANSVERSE = "transverse"  # top-down: rotation / foot progression
    NONE = "none"              # scalar distances and ratios


class View(str, Enum):
    FRONT = "front"
    LEFTSIDE = "leftside"
    RIGHTSIDE = "rightside"
    BACK = "back"
    ANY_SIDE = "any_side"
    ANY = "any"


class Source(str, Enum):
    WORLD_3D = "world_3d"    # metric, hip-centred; immune to camera obliquity
    IMAGE_2D = "image_2d"    # pixel projection; only valid for in-plane measures


class Unit(str, Enum):
    DEGREES = "degrees"
    METRES = "metres"
    RATIO = "ratio"                  # dimensionless, normalised to a body segment
    PERCENT = "percent"
    SECONDS = "seconds"
    STEPS_PER_MIN = "steps_per_min"
    COUNT = "count"
    PIXELS = "pixels"                # legacy only; not comparable between sessions


class Status(str, Enum):
    MEASURED = "measured"
    INSUFFICIENT_DATA = "insufficient_data"   # required view missing / too few frames
    LOW_CONFIDENCE = "low_confidence"         # measured, but spread too wide to trust
    OUT_OF_RANGE = "out_of_range"             # outside physical possibility => defect
    UNSUPPORTED = "unsupported"               # cannot be measured with this hardware


@dataclass(frozen=True)
class MetricSpec:
    key: str
    clinical_name: str
    plane: Plane
    required_view: View
    source: Source
    unit: Unit
    landmarks: Tuple[int, ...] = ()
    signed: bool = False
    # Outside this range the value is physically impossible, so it is a bug, not a finding.
    physical_range: Optional[Tuple[float, float]] = None
    normal_range: Optional[Tuple[float, float]] = None
    # Set when a normal range was deliberately removed because the metric's measured
    # error is wider than the range. Carried through to the client so the UI can say
    # why a number has no verdict instead of silently showing one less badge.
    ungradeable_reason: Optional[str] = None
    reference: Optional[str] = None
    # Max acceptable interquartile spread across frames before we flag low confidence.
    max_iqr: Optional[float] = None
    # Set when the metric is retained for schema compatibility but cannot be measured.
    unsupported_reason: Optional[str] = None
    notes: str = ""

    @property
    def is_supported(self) -> bool:
        return self.unsupported_reason is None


def _deg(**kw):
    kw.setdefault("unit", Unit.DEGREES)
    return kw


# ---------------------------------------------------------------------------
# Posture metrics
# ---------------------------------------------------------------------------

POSTURE_METRICS: List[MetricSpec] = [
    # --- Sagittal: require a true side view -------------------------------
    MetricSpec(
        key="trunk_angle",
        clinical_name="Trunk sagittal lean",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(11, 12, 23, 24),
        signed=True,
        physical_range=(-45.0, 60.0),
        normal_range=(-2.0, 6.0),
        reference="Kendall FP et al., Muscles: Testing and Function, 5th ed., ch. 3",
        max_iqr=4.0,
        notes="Positive = forward lean. Previously always ~180 due to an unsigned arccos against the downward axis.",
    ),
    MetricSpec(
        key="thoracic_kyphosis_angle",
        clinical_name="Thoracic kyphosis (surface proxy)",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(7, 8, 11, 12, 23, 24),
        physical_range=(0.0, 90.0),
        normal_range=(20.0, 45.0),
        reference="Fon GT et al., AJR 1980;134:979-983 (radiographic Cobb reference range)",
        max_iqr=6.0,
        notes="Three-point surface proxy, NOT a Cobb angle. Report as a screening proxy only; agreement with radiographic Cobb is unestablished and must not be implied.",
    ),
    MetricSpec(
        key="forward_head_ratio",
        clinical_name="Forward head position (normalised)",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.WORLD_3D,
        unit=Unit.RATIO,
        landmarks=(7, 8, 11, 12),
        physical_range=(-0.5, 1.5),
        normal_range=(0.0, 0.35),
        reference="Normalised to shoulder width; ratio thresholds require local validation",
        max_iqr=0.12,
        notes="Replaces fhd_pixels. Ear-to-shoulder anterior offset divided by shoulder width, so it is comparable between sessions and subjects.",
    ),
    MetricSpec(
        key="rounded_shoulder_angle",
        clinical_name="Shoulder protraction angle",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Protraction is the acromion's anterior translation relative to the thorax. "
            "MediaPipe provides one shoulder landmark per side and no separate thoracic "
            "reference, so shoulder-versus-hip geometry measures trunk lean and nothing "
            "else - any 'protraction' computed this way is numerically identical to "
            "trunk_angle. Requires a distinct thoracic or acromion landmark."
        ),
    ),

    # --- Frontal: require a front or back view ----------------------------
    MetricSpec(
        key="shoulder_obliquity",
        clinical_name="Shoulder obliquity",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(11, 12),
        signed=True,
        physical_range=(-25.0, 25.0),
        normal_range=(-2.5, 2.5),
        reference="Kendall FP et al., Muscles: Testing and Function, 5th ed.",
        max_iqr=2.5,
        notes="Signed: positive = subject's right shoulder high. Replaces the unsigned pixel shoulder_height_diff.",
    ),
    MetricSpec(
        key="pelvic_obliquity",
        clinical_name="Pelvic obliquity",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(23, 24),
        signed=True,
        physical_range=(-25.0, 25.0),
        normal_range=(-2.5, 2.5),
        reference="Kendall FP et al., Muscles: Testing and Function, 5th ed.",
        max_iqr=2.5,
    ),
    MetricSpec(
        key="trunk_lateral_shift_ratio",
        clinical_name="Lateral trunk shift (normalised)",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.RATIO,
        landmarks=(11, 12, 23, 24),
        signed=True,
        physical_range=(-1.0, 1.0),
        normal_range=(-0.05, 0.05),
        reference="Normalised to shoulder width; thresholds require local validation",
        max_iqr=0.05,
    ),
    MetricSpec(
        key="head_lateral_flexion",
        clinical_name="Head lateral tilt",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(7, 8),
        signed=True,
        physical_range=(-45.0, 45.0),
        normal_range=(-3.0, 3.0),
        reference="Kendall FP et al., Muscles: Testing and Function, 5th ed.",
        max_iqr=3.0,
    ),

    # --- Joint angles: valid from a side view -----------------------------
    MetricSpec(
        key="left_knee_angle",
        clinical_name="Left knee angle (standing)",
        plane=Plane.SAGITTAL,
        required_view=View.LEFTSIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(23, 25, 27),
        physical_range=(30.0, 190.0),
        normal_range=(175.0, 185.0),
        reference="Norkin & White, Measurement of Joint Motion, 5th ed.",
        max_iqr=5.0,
        notes="180 = full extension.",
    ),
    MetricSpec(
        key="right_knee_angle",
        clinical_name="Right knee angle (standing)",
        plane=Plane.SAGITTAL,
        required_view=View.RIGHTSIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(24, 26, 28),
        physical_range=(30.0, 190.0),
        normal_range=(175.0, 185.0),
        reference="Norkin & White, Measurement of Joint Motion, 5th ed.",
        max_iqr=5.0,
    ),
    MetricSpec(
        key="left_hip_angle",
        clinical_name="Left hip angle (standing)",
        plane=Plane.SAGITTAL,
        required_view=View.LEFTSIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(11, 23, 25),
        physical_range=(60.0, 190.0),
        normal_range=(170.0, 185.0),
        reference="Norkin & White, Measurement of Joint Motion, 5th ed.",
        max_iqr=5.0,
    ),
    MetricSpec(
        key="right_hip_angle",
        clinical_name="Right hip angle (standing)",
        plane=Plane.SAGITTAL,
        required_view=View.RIGHTSIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(12, 24, 26),
        physical_range=(60.0, 190.0),
        normal_range=(170.0, 185.0),
        reference="Norkin & White, Measurement of Joint Motion, 5th ed.",
        max_iqr=5.0,
    ),
    MetricSpec(
        key="knee_varus_valgus",
        clinical_name="Frontal knee alignment (varus/valgus)",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(23, 24, 25, 26, 27, 28),
        signed=True,
        physical_range=(-25.0, 25.0),
        normal_range=(-5.0, 8.0),
        reference="Hip-knee-ankle frontal alignment; cf. Cooke TDV et al., Skeletal Radiol 2007",
        max_iqr=4.0,
        notes="Positive = valgus (knock-knee). This is the femorotibial frontal angle, which is NOT the clinical Q-angle.",
    ),

    # --- Body proportions: normalised, not raw pixels ---------------------
    MetricSpec(
        key="shoulder_hip_width_ratio",
        clinical_name="Shoulder-to-hip width ratio",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.RATIO,
        landmarks=(11, 12, 23, 24),
        physical_range=(0.5, 3.0),
        reference="Descriptive proportion; no clinical threshold claimed",
        max_iqr=0.15,
    ),
    MetricSpec(
        key="leg_length_asymmetry_ratio",
        clinical_name="Leg length asymmetry (normalised)",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.RATIO,
        landmarks=(23, 24, 25, 26, 27, 28),
        signed=True,
        physical_range=(-0.3, 0.3),
        normal_range=(-0.02, 0.02),
        reference="Apparent (not true) leg length; radiographic confirmation required for any clinical claim",
        max_iqr=0.03,
    ),

    # --- Retained for schema compatibility, but not measurable ------------
    MetricSpec(
        key="pelvic_tilt_angle",
        clinical_name="Anterior/posterior pelvic tilt",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Requires ASIS and PSIS landmarks to define the pelvic plane. MediaPipe "
            "provides a single hip-centre landmark per side and no pelvic orientation, "
            "so this cannot be derived. The previous implementation reported thigh "
            "inclination under this name."
        ),
    ),
    MetricSpec(
        key="q_angle_left",
        clinical_name="Q-angle (left)",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Requires ASIS and the patella centre / tibial tuberosity. MediaPipe has no "
            "patella landmark and landmark 23 is a hip centre, not the ASIS. See "
            "knee_varus_valgus for the frontal alignment angle that IS measurable."
        ),
    ),
    MetricSpec(
        key="q_angle_right",
        clinical_name="Q-angle (right)",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Requires ASIS and the patella centre / tibial tuberosity, neither of which "
            "MediaPipe provides. See knee_varus_valgus."
        ),
    ),
    MetricSpec(
        key="pronation_supination_left",
        clinical_name="Subtalar pronation (left)",
        plane=Plane.FRONTAL,
        required_view=View.BACK,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Rearfoot pronation is a frontal-plane calcaneal eversion angle measured "
            "from behind against the tibial axis. MediaPipe provides one heel point and "
            "no calcaneal axis, so the angle is not observable."
        ),
    ),
    MetricSpec(
        key="pronation_supination_right",
        clinical_name="Subtalar pronation (right)",
        plane=Plane.FRONTAL,
        required_view=View.BACK,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Rearfoot pronation is a frontal-plane calcaneal eversion angle. MediaPipe "
            "provides no calcaneal axis, so the angle is not observable."
        ),
    ),
    MetricSpec(
        key="foot_progression_angle_left",
        clinical_name="Foot progression angle (left)",
        plane=Plane.TRANSVERSE,
        required_view=View.ANY,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(11, 12, 29, 31),
        signed=True,
        physical_range=(-45.0, 60.0),
        normal_range=(-2.0, 18.0),
        reference="Simon SR et al., J Bone Joint Surg 1981 (out-toeing in relaxed stance)",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="foot_progression_angle_right",
        clinical_name="Foot progression angle (right)",
        plane=Plane.TRANSVERSE,
        required_view=View.ANY,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(11, 12, 30, 32),
        signed=True,
        physical_range=(-45.0, 60.0),
        normal_range=(-2.0, 18.0),
        reference="Simon SR et al., J Bone Joint Surg 1981 (out-toeing in relaxed stance)",
        max_iqr=8.0,
    ),
    MetricSpec(
        key="head_rotation",
        clinical_name="Head rotation (yaw)",
        plane=Plane.TRANSVERSE,
        required_view=View.ANY,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(0, 7, 8, 11, 12),
        signed=True,
        physical_range=(-90.0, 90.0),
        normal_range=(-8.0, 8.0),
        reference="Kendall FP et al., Muscles: Testing and Function, 5th ed. (neutral head alignment)",
        max_iqr=6.0,
    ),
    MetricSpec(
        key="knee_flexion_neutral",
        clinical_name="Knee flexion at neutral stance",
        plane=Plane.SAGITTAL,
        required_view=View.ANY_SIDE,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        unsupported_reason=(
            "Was hardcoded to 0.0 and never computed. Superseded by left_knee_angle / "
            "right_knee_angle, which measure the same thing from a defined view."
        ),
    ),
]


POSTURE_BY_KEY: Dict[str, MetricSpec] = {m.key: m for m in POSTURE_METRICS}


def supported_posture_metrics() -> List[MetricSpec]:
    return [m for m in POSTURE_METRICS if m.is_supported]


def views_for(spec: MetricSpec) -> Tuple[str, ...]:
    """Which capture views may legitimately supply data for this metric."""
    if spec.required_view == View.ANY_SIDE:
        return ("leftside", "rightside")
    if spec.required_view == View.ANY:
        return ("front", "leftside", "rightside", "back")
    if spec.required_view == View.FRONT:
        # A back view sees the same frontal plane; obliquity sign is handled by the caller.
        return ("front", "back")
    return (spec.required_view.value,)


def classify(spec: MetricSpec, value: Optional[float]) -> Status:
    """Physical-plausibility gate. Runs before any clinical interpretation."""
    if value is None:
        return Status.INSUFFICIENT_DATA
    if spec.physical_range is not None:
        lo, hi = spec.physical_range
        if not (lo <= value <= hi):
            return Status.OUT_OF_RANGE
    return Status.MEASURED


# ---------------------------------------------------------------------------
# Grading safety gate - see the identical block in gait_registry.py
# ---------------------------------------------------------------------------
# A metric whose measurement error is wider than its normal range keeps its number and
# loses its range, so no client can badge it normal or abnormal on the strength of
# noise. Enforced here rather than in the UI so it survives a second client.

from dataclasses import replace as _replace  # noqa: E402

from app.core.metrics.tolerances import UNGRADEABLE as _UNGRADEABLE  # noqa: E402

POSTURE_METRICS = [
    _replace(spec, normal_range=None, ungradeable_reason=_UNGRADEABLE[spec.key])
    if spec.key in _UNGRADEABLE and spec.normal_range else spec
    for spec in POSTURE_METRICS
]


# ---------------------------------------------------------------------------
# Transverse-plane metrics: implemented, measured, and not good enough to grade
# ---------------------------------------------------------------------------
# Head yaw and foot progression ARE computable from pose landmarks - the earlier notes
# claiming otherwise were wrong about the maths, and both are exact on clean landmarks.
# What they are not is measurable to a useful precision, and the reason is the same for
# both: a transverse angle is rotation about the vertical axis, which moves a landmark
# toward or away from the lens rather than across it. It is the one plane a single
# camera cannot see, so the measurement rests entirely on MediaPipe's inferred depth -
# its least accurate axis by a wide margin.
#
# Certified over 100 subjects against realistic world-landmark error:
#
#   head_rotation                  bias +0.1 deg, p95 error 25.5 deg, normal range +/-8
#   foot_progression_angle_left    bias +0.2 deg, p95 error 11.6 deg, normal range 20 wide
#   foot_progression_angle_right   bias -1.1 deg, p95 error 13.3 deg, normal range 20 wide
#
# Unbiased and uselessly imprecise. A head yaw with 25 degrees of uncertainty cannot
# distinguish a neutral head from a badly rotated one, and a foot progression angle
# whose error is most of its normal range cannot tell out-toeing from normal.
#
# The implementations stay, because what is missing is a sensor rather than a method:
# a depth camera, a second calibrated view, or any source of real 3-D would make all
# three reportable tomorrow with no change to the maths.

from dataclasses import replace as _replace2  # noqa: E402

_TRANSVERSE_UNMEASURABLE = {
    "thoracic_kyphosis_angle": (
        "Reads tracking noise as spinal curvature. It is |180 - the ear-shoulder-hip "
        "angle|, and those three points are nearly collinear on a standing person, so "
        "the angle at that vertex is hypersensitive to small perpendicular error - and "
        "the absolute value folds the distribution, so noise can only push the reading "
        "UP, never toward zero. Measured on a skeleton with exactly zero curvature it "
        "returns 0.00 at 0 px of jitter, 1.27 at 1 px and 3.76 at 3 px, with an IQR as "
        "large as the value: the number tracks how bad the tracking was, not the "
        "patient's spine. Observed live at 17.8 degrees with a 13.2 spread and a 19.5 "
        "degree disagreement between the two side views. "
        "A real surface kyphosis measurement needs landmarks ON the thoracic curve - a "
        "flexicurve, an inclinometer over T1-T12, or markers on the spinous processes. "
        "Ear-shoulder-hip cannot substitute, whatever range it is graded against."
    ),
    "head_rotation": (
        "Implemented and exact on clean landmarks, but measured entirely in MediaPipe's "
        "inferred depth: certification put the error at 25.5 degrees (p95) against a "
        "normal range of +/-8, so the number cannot distinguish a neutral head from a "
        "rotated one. Needs a depth camera or a second calibrated view, not new maths."
    ),
    "foot_progression_angle_left": (
        "Implemented and exact on clean landmarks. Certified error 11.6 degrees (p95) "
        "against a 20-degree-wide normal range - most of the range - because a "
        "transverse angle is visible only in MediaPipe's inferred depth. Needs a depth "
        "camera or a second calibrated view."
    ),
    "foot_progression_angle_right": (
        "Implemented and exact on clean landmarks. Certified error 13.3 degrees (p95) "
        "against a 20-degree-wide normal range. Needs a depth camera or a second "
        "calibrated view."
    ),
}

POSTURE_METRICS = [
    _replace2(spec, normal_range=None, unsupported_reason=_TRANSVERSE_UNMEASURABLE[spec.key])
    if spec.key in _TRANSVERSE_UNMEASURABLE else spec
    for spec in POSTURE_METRICS
]
