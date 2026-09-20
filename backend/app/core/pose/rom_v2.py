"""
Range-of-motion measurement.

Supersedes rom_calculator.py, which was never reachable from any endpoint and carried
the defects the posture rewrite existed to remove. Three worth naming, because they are
the reason this is a rewrite rather than a repair:

  * `rom_current = abs(180 - angle)` on a hip-shoulder-elbow interior angle is INVERTED.
    An arm hanging at rest gives an interior angle near 0, so that expression reported
    180 degrees of shoulder flexion for a patient standing still, and 0 degrees for one
    holding their arm straight up.

  * `abs(180 - angle)` is also the folded-absolute-value pattern that made thoracic
    kyphosis read tracking noise as anatomy - measured at 3.76 degrees of "curvature" on
    a skeleton with exactly zero. Noise can only push such a value away from zero.

  * `cervical_rotation(view="top")` wanted a top-down camera. The product captures
    front, back and two sides. That metric could never run.

The measurements here reuse the clinical definitions and nothing else. They follow the
same rules the posture calibrator arrived at: the plane the camera can actually see,
signs derived from the anatomy rather than from a view label, and per-frame values
filtered against physical bounds before anything is aggregated.

ROM is captured as an END-RANGE HOLD - the patient moves the joint as far as it goes and
holds while frames are collected - so this is a static measurement of a held position,
and every mechanism the posture path uses applies unchanged.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from app.core.geometry import interior_angle, robust_center, robust_spread
from app.core.metrics.registry import MetricSpec, Status, classify, views_for
from app.core.metrics.rom_registry import ROM_METRICS
from app.core.metrics.tolerances import tolerance_for
from app.core.pose.calibration_v2 import (
    DEFAULT_ASPECT_RATIO,
    MIN_FRAMES_PER_METRIC,
    VALID_VIEWS,
    MetricResult,
    _drop_non_finite,
    _frontal_tilt,
    _get,
    _mid,
    _normalise_keys,
)

L_EAR, R_EAR = 7, 8
L_SH, R_SH = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANK, R_ANK = 27, 28


# ---------------------------------------------------------------------------
# Per-frame implementations
# ---------------------------------------------------------------------------


def _joint_angle(proximal: int, vertex: int, distal: int, *, complement: bool = False):
    """
    Interior angle at `vertex`, optionally reported as its complement.

    `complement=True` converts a straight-limb-is-180 interior angle into a
    flexion-from-neutral reading, which is how elbow and knee ROM are recorded: a fully
    extended knee is 0 degrees of flexion, not 180.

    Done as `180 - angle` rather than `abs(180 - angle)`. The absolute value looks
    harmless and is not: it folds the distribution, so noise around a straight joint can
    only push the reading up, and the metric starts reporting the tracker's jitter as
    movement. That is exactly how thoracic kyphosis came to report 3.76 degrees of
    curvature on a skeleton with none. A joint bending the wrong way is physically
    impossible, and the physical-range filter is the right place to catch it.
    """

    def impl(lm, use_world, view):
        a, b, c = _get(lm, proximal), _get(lm, vertex), _get(lm, distal)
        angle = interior_angle(a, b, c, use_3d=use_world)
        if angle is None:
            return None
        return 180.0 - angle if complement else angle

    return impl


def _arm_elevation(side: str):
    """
    Arm elevation measured from the TRUNK AXIS, for both flexion and abduction.

    The axis is mid-hip to mid-shoulder, not the hip on the same side. Shoulders sit
    about 5.8 cm wider than hips, and over a 49 cm torso that lateral offset tilts an
    ipsilateral hip-to-shoulder reference by 6.7 degrees - which is exactly the error it
    produced: a posed 160 degrees of abduction read 166.5. The posture registry's hip
    angle had the identical bug for the identical reason.

    Measuring against the trunk rather than against vertical is also the clinical
    definition, and it matters: a patient who leans sideways to get their arm higher has
    not gained range, and a vertical reference would credit them for the lean.
    """
    sh, elbow = (L_SH, L_ELBOW) if side == "left" else (R_SH, R_ELBOW)

    def impl(lm, use_world, view):
        mid_hip = _mid(lm, L_HIP, R_HIP)
        mid_sh = _mid(lm, L_SH, R_SH)
        shoulder, elb = _get(lm, sh), _get(lm, elbow)
        if None in (mid_hip, mid_sh, shoulder, elb):
            return None
        dims = 3 if use_world else 2
        trunk = np.asarray(mid_sh[:dims], dtype=float) - np.asarray(mid_hip[:dims], dtype=float)
        arm = np.asarray(elb[:dims], dtype=float) - np.asarray(shoulder[:dims], dtype=float)
        n_t, n_a = np.linalg.norm(trunk), np.linalg.norm(arm)
        if n_t < 1e-9 or n_a < 1e-9:
            return None
        # Elevation is measured from the arm hanging at rest, which points DOWN the
        # trunk axis - hence the negated trunk vector.
        cosine = float(np.dot(-trunk, arm) / (n_t * n_a))
        return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))

    return impl


def _cervical_lateral_flexion(lm, use_world, view):
    """
    Head tilt toward one shoulder, relative to the shoulder line.

    Relative to the shoulders, not to horizontal: a patient with a dropped shoulder
    would otherwise be credited with cervical range they do not have. Negative = tilted
    toward the subject's left, matching the posture registry's convention so the two
    read the same way on one report.
    """
    ear_tilt = _frontal_tilt(lm, use_world, view, L_EAR, R_EAR)
    shoulder_tilt = _frontal_tilt(lm, use_world, view, L_SH, R_SH)
    if ear_tilt is None or shoulder_tilt is None:
        return None
    return ear_tilt - shoulder_tilt


# Flexion and abduction share _arm_elevation on purpose, and it is worth saying why
# because two keys pointing at one function normally means a copy-paste bug.
#
# Both ARE the same quantity - elevation of the arm away from the trunk axis. What
# distinguishes them clinically is the PLANE the arm travels in: forward for flexion,
# sideways for abduction. The registry encodes that as the required view, and the 2-D
# path measures within whatever plane that view presents, so a side capture yields the
# sagittal component and a front capture the frontal one. A patient who both flexes and
# abducts is then correctly credited with the component each view can see, rather than
# with a single blended elevation.
_IMPLEMENTATIONS = {
    "rom_shoulder_flexion_left": _arm_elevation("left"),
    "rom_shoulder_flexion_right": _arm_elevation("right"),
    "rom_shoulder_abduction_left": _arm_elevation("left"),
    "rom_shoulder_abduction_right": _arm_elevation("right"),
    "rom_elbow_flexion_left": _joint_angle(L_SH, L_ELBOW, L_WRIST, complement=True),
    "rom_elbow_flexion_right": _joint_angle(R_SH, R_ELBOW, R_WRIST, complement=True),
    "rom_hip_flexion_left": _joint_angle(L_SH, L_HIP, L_KNEE, complement=True),
    "rom_hip_flexion_right": _joint_angle(R_SH, R_HIP, R_KNEE, complement=True),
    "rom_knee_flexion_left": _joint_angle(L_HIP, L_KNEE, L_ANK, complement=True),
    "rom_knee_flexion_right": _joint_angle(R_HIP, R_KNEE, R_ANK, complement=True),
    "rom_cervical_lateral_flexion": _cervical_lateral_flexion,
}


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass
class ROMResult:
    calibration_date: str
    person_id: str
    movement: str
    metrics: Dict[str, MetricResult] = field(default_factory=dict)
    views_captured: List[str] = field(default_factory=list)
    frames_per_view: Dict[str, int] = field(default_factory=dict)
    aspect_assumed: bool = False
    schema_version: int = 2

    def value(self, key: str) -> Optional[float]:
        m = self.metrics.get(key)
        return m.value if m and m.status == Status.MEASURED else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "calibrationDate": self.calibration_date,
            "personId": self.person_id,
            "movement": self.movement,
            "schemaVersion": self.schema_version,
            "viewsCaptured": self.views_captured,
            "framesPerView": self.frames_per_view,
            "aspectAssumed": self.aspect_assumed,
            "metrics": {k: v.to_dict() for k, v in self.metrics.items()},
        }


class ROMCalibrator:
    """
    Collects end-range hold samples and computes joint range of motion.

    Deliberately mirrors PostureCalibrator rather than sharing a base class: the two
    read different registries and will diverge as ROM grows movement-specific handling,
    and a premature abstraction over two things that are only currently similar tends to
    constrain both. What IS shared is imported - the landmark normalisation, the
    non-finite filter, the frontal-tilt primitive - so the parts that must agree cannot
    drift.
    """

    def __init__(
        self,
        min_frames: int = MIN_FRAMES_PER_METRIC,
        normalised_input: bool = False,
        aspect_ratio: Optional[float] = None,
    ):
        self.samples_by_view: Dict[str, List[Dict]] = {v: [] for v in VALID_VIEWS}
        self.min_frames = min_frames
        self.normalised_input = normalised_input
        self.aspect_ratio = float(aspect_ratio) if aspect_ratio else DEFAULT_ASPECT_RATIO
        self.aspect_assumed = normalised_input and aspect_ratio is None

    def add_sample(self, extracted: Dict, view: str) -> bool:
        if view not in self.samples_by_view:
            return False
        pose = extracted.get("pose") if isinstance(extracted, dict) else None
        if not pose:
            return False
        pose_lm = _drop_non_finite(_normalise_keys(pose))
        if self.normalised_input:
            pose_lm = {
                idx: [v[0] * self.aspect_ratio, *v[1:]]
                for idx, v in pose_lm.items()
                if len(v) >= 2
            }
        self.samples_by_view[view].append(
            {
                "pose": pose_lm,
                "world": _drop_non_finite(_normalise_keys(extracted.get("pose_world") or {})),
            }
        )
        return True

    def frames(self, view: str) -> int:
        return len(self.samples_by_view.get(view, []))

    @property
    def views_captured(self) -> List[str]:
        return [v for v in VALID_VIEWS if self.samples_by_view.get(v)]

    def finalize(self, person_id: str, movement: str = "") -> ROMResult:
        result = ROMResult(
            calibration_date=datetime.now(timezone.utc).isoformat(),
            person_id=str(person_id),
            movement=movement,
            views_captured=self.views_captured,
            frames_per_view={v: self.frames(v) for v in self.views_captured},
            aspect_assumed=self.aspect_assumed,
        )
        for spec in ROM_METRICS:
            result.metrics[spec.key] = self._compute(spec)
        return result

    def _per_frame(self, spec: MetricSpec, sample: Dict, view: str) -> Optional[float]:
        """
        2-D first, world as the fallback - the same order the posture calibrator arrived
        at after measuring both. MediaPipe does not measure depth, it infers it, and the
        inference is its least accurate axis by a wide margin.
        """
        fn = _IMPLEMENTATIONS.get(spec.key)
        if fn is None:
            return None
        for lm, use_world in ((sample.get("pose") or {}, False), (sample.get("world") or {}, True)):
            if not lm:
                continue
            value = fn(lm, use_world, view)
            if value is not None and math.isfinite(value):
                return value
        return None

    def _compute(self, spec: MetricSpec) -> MetricResult:
        base = dict(
            key=spec.key,
            clinical_name=spec.clinical_name,
            unit=spec.unit.value,
            normal_range=spec.normal_range,
            reference=spec.reference,
            ungradeable_reason=spec.ungradeable_reason,
        )

        if not spec.is_supported:
            return MetricResult(
                value=None, status=Status.UNSUPPORTED, detail=spec.unsupported_reason, **base
            )

        per_view: Dict[str, float] = {}
        per_view_spread: Dict[str, float] = {}
        total_frames = 0
        for candidate in views_for(spec):
            if self.frames(candidate) < self.min_frames:
                continue
            raw = [
                v
                for v in (
                    self._per_frame(spec, sample, candidate)
                    for sample in self.samples_by_view[candidate]
                )
                if v is not None and np.isfinite(v)
            ]
            # Physically impossible values are tracking failures, not measurements, and
            # are dropped BEFORE aggregating. Checking only the final median lets a
            # minority of bad frames survive into the spread, which is what decides
            # whether the value is shown as confident.
            if spec.physical_range is not None:
                lo, hi = spec.physical_range
                values = [v for v in raw if lo <= v <= hi]
            else:
                values = raw
            if len(values) < self.min_frames:
                continue
            centre = robust_center(values)
            if centre is None:
                continue
            per_view[candidate] = centre
            spread_v = robust_spread(values)
            if spread_v is not None:
                per_view_spread[candidate] = spread_v
            total_frames += len(values)

        if not per_view:
            needed = " or ".join(views_for(spec))
            return MetricResult(
                value=None,
                status=Status.INSUFFICIENT_DATA,
                detail=(
                    f"Requires a {needed} capture of the end-range hold with at least "
                    f"{self.min_frames} usable frames."
                ),
                **base,
            )

        # Opposing views are averaged rather than one being discarded: camera roll and
        # subject yaw bias them in opposite directions, so the mean cancels the error.
        view = "+".join(per_view)
        value = float(np.mean(list(per_view.values())))
        spread = max(per_view_spread.values()) if per_view_spread else None
        status = classify(spec, value)
        detail = None

        if status == Status.OUT_OF_RANGE:
            lo, hi = spec.physical_range
            detail = (
                f"Computed {value:.2f} {spec.unit.value}, outside the physically possible "
                f"range [{lo}, {hi}]. Treat as a capture or computation defect, not a "
                f"clinical finding."
            )
            value = None
        elif spec.max_iqr is not None and spread is not None and spread > spec.max_iqr:
            status = Status.LOW_CONFIDENCE
            detail = (
                f"Frame-to-frame spread {spread:.2f} exceeds the {spec.max_iqr} threshold; "
                f"the hold was not steady, or tracking was unstable."
            )

        values_list = list(per_view.values())
        cross_delta = (
            float(max(values_list) - min(values_list)) if len(values_list) > 1 else None
        )
        if status == Status.MEASURED and cross_delta is not None:
            limit = tolerance_for(spec.key)
            if limit is not None and cross_delta > limit:
                status = Status.LOW_CONFIDENCE
                detail = (
                    f"The {' and '.join(per_view)} captures disagree by {cross_delta:.2f} "
                    f"{spec.unit.value}, more than its {limit} tolerance. Both cannot be "
                    f"right; the subject was probably not square to the camera."
                )

        return MetricResult(
            value=None if value is None else round(value, 3),
            status=status,
            spread=None if spread is None else round(spread, 3),
            n_frames=total_frames,
            view_used=view,
            detail=detail,
            cross_view_delta=None if cross_delta is None else round(cross_delta, 3),
            views_compared=list(per_view) if len(per_view) > 1 else None,
            **base,
        )
