"""
Per-view clinical posture calibration.

Replaces the landmark-averaging approach in calibration.py. Two changes matter:

1. Samples are kept per capture view. The previous implementation accepted a `view`
   argument and discarded it, appending front, leftside, rightside and back frames to
   one flat list and averaging landmark positions across all of them. Measured against
   the synthetic harness, that made a 45-degree bent knee report as 179.8 degrees - a
   perfectly straight leg - because the left and right side views cancel each other.
   Each metric now draws only from the views its plane is actually visible in.

2. Metrics are computed per frame and then aggregated with a median, keeping the
   interquartile spread. The spread is the confidence signal: a metric that scatters
   across a supposedly static capture was not measured well, however plausible its
   median looks.

Angles come from world landmarks (metric, hip-centred) when the client supplies them,
because those are immune to the subject standing off-axis to the camera. When only the
2D projection is available we fall back to it, but only for metrics whose plane that
view actually sees - and the per-view anterior sign is applied explicitly, because the
anterior direction appears on opposite sides of the image in left and right side views.
"""

from __future__ import annotations

import math

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from app.core.geometry import (
    transverse_angle,
    distance,
    frontal_segment_angle,
    interior_angle,
    midpoint,
    robust_center,
    robust_spread,
    sagittal_segment_angle,
    signed_angle_from_horizontal,
    signed_angle_from_vertical,
)
from app.core.metrics.repeatability import mdc95_for, tracks_change
from app.core.metrics.tolerances import tolerance_for
from app.core.metrics.registry import (
    POSTURE_METRICS,
    MetricSpec,
    Source,
    Status,
    View,
    classify,
    views_for,
)

# Landmark indices
NOSE = 0
L_EAR, R_EAR = 7, 8
L_SH, R_SH = 11, 12
L_ELB, R_ELB = 13, 14
L_WRI, R_WRI = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANK, R_ANK = 27, 28
L_HEEL, R_HEEL = 29, 30
L_FOOT, R_FOOT = 31, 32

VALID_VIEWS = ("front", "leftside", "rightside", "back")

# Which image-x direction corresponds to the subject's anterior in each side view.
#
# Both signs were inverted. Stand to someone's RIGHT and look at them: you are facing
# their left side, and their nose points to YOUR right - toward increasing image x. The
# comment here previously asserted the opposite and nothing tested it, so forward head
# position came back negative on live captures, reporting a normal subject's head as
# sitting BEHIND their shoulders and grading it "below range".
#
# Getting this wrong silently mirrors every 2-D sagittal measurement, which is why it is
# stated once, here, and why test_edge_cases now checks it against both a left and a
# right side capture of the same subject.
ANTERIOR_SIGN_2D = {"rightside": +1.0, "leftside": -1.0}

MIN_FRAMES_PER_METRIC = 10
MIN_VISIBILITY = 0.5

# Assumed capture aspect ratio when the client sends normalised landmarks without
# reporting its frame dimensions. See PostureCalibrator.__init__ for why this matters.
DEFAULT_ASPECT_RATIO = 4.0 / 3.0


@dataclass
class MetricResult:
    """One metric, with everything the UI needs to decide whether to show it."""

    key: str
    clinical_name: str
    value: Optional[float]
    unit: str
    status: Status
    spread: Optional[float] = None
    n_frames: int = 0
    view_used: Optional[str] = None
    normal_range: Optional[Tuple[float, float]] = None
    reference: Optional[str] = None
    detail: Optional[str] = None
    # Why this metric has a value but no normal range, when that was a deliberate
    # decision rather than an absent citation. The UI shows the number without a
    # verdict badge and can explain the omission instead of silently dropping it.
    ungradeable_reason: Optional[str] = None
    # When two captures could both see this metric, how far apart they were. This is the
    # only independent check the pipeline has on itself - everything else is a single
    # measurement's internal consistency - so it is recorded whether or not it passed.
    cross_view_delta: Optional[float] = None
    views_compared: Optional[List[str]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "clinicalName": self.clinical_name,
            "value": self.value,
            "unit": self.unit,
            "status": self.status.value,
            "spread": self.spread,
            "nFrames": self.n_frames,
            "viewUsed": self.view_used,
            "normalRange": list(self.normal_range) if self.normal_range else None,
            "reference": self.reference,
            "detail": self.detail,
            "ungradeableReason": self.ungradeable_reason,
            "crossViewDelta": self.cross_view_delta,
            "viewsCompared": self.views_compared,
            # Smallest change from a previous screening that is distinguishable from
            # measuring twice. null means repeat sessions of this metric do not agree
            # well enough to compare at all - see core/metrics/repeatability.py.
            "mdc95": mdc95_for(self.key) if tracks_change(self.key) else None,
            "tracksChange": tracks_change(self.key),
        }


@dataclass
class PostureResult:
    calibration_date: str
    person_id: str
    metrics: Dict[str, MetricResult] = field(default_factory=dict)
    views_captured: List[str] = field(default_factory=list)
    frames_per_view: Dict[str, int] = field(default_factory=dict)
    aspect_assumed: bool = False
    # Captures whose landmarks disagree with the view they were filed under.
    orientation_warnings: List[str] = field(default_factory=list)
    # Median landmark position per view, for skeleton rendering and audit.
    representative_landmarks: Dict[str, Dict[int, List[float]]] = field(default_factory=dict)
    schema_version: int = 2

    def value(self, key: str) -> Optional[float]:
        m = self.metrics.get(key)
        return m.value if m and m.status == Status.MEASURED else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "calibrationDate": self.calibration_date,
            "personId": self.person_id,
            "schemaVersion": self.schema_version,
            "viewsCaptured": self.views_captured,
            "framesPerView": self.frames_per_view,
            "aspectAssumed": self.aspect_assumed,
            "orientationWarnings": self.orientation_warnings,
            "metrics": {k: v.to_dict() for k, v in self.metrics.items()},
        }


class PostureCalibrator:
    """
    Collects pose samples per view and computes clinical posture metrics.

    Usage mirrors the previous BodyCalibrator so the service layer needs only to pass
    the view through honestly:

        cal = PostureCalibrator()
        cal.add_sample(extracted, view="leftside")
        result = cal.finalize(person_id="user_123")
    """

    def __init__(
        self,
        min_frames: int = MIN_FRAMES_PER_METRIC,
        normalised_input: bool = False,
        aspect_ratio: Optional[float] = None,
    ):
        """
        normalised_input: True when landmarks arrive as MediaPipe 0-1 normalised
            coordinates rather than pixels.
        aspect_ratio: capture width / height. Only consulted for normalised input.

        MediaPipe normalises x by the frame width and y by the frame height, so
        normalised coordinates are anisotropic on any non-square frame: equal physical
        distances horizontally and vertically come back as different numbers, and every
        angle computed from them is skewed. Measured on a synthetic capture, this
        distorted peak knee flexion from 60 degrees to 41.9 at 16:9.

        The backend PoseProcessor already converts to pixels (x*width, y*height), which
        is isotropic, so the server-side frame path needs no correction. The correction
        exists for the client-sample path, where the browser sends normalised values.
        """
        self.samples_by_view: Dict[str, List[Dict]] = {v: [] for v in VALID_VIEWS}
        self.min_frames = min_frames
        self.normalised_input = normalised_input
        self.aspect_ratio = float(aspect_ratio) if aspect_ratio else DEFAULT_ASPECT_RATIO
        self.aspect_assumed = normalised_input and aspect_ratio is None

    # -- collection ---------------------------------------------------------

    def add_sample(self, extracted: Dict, view: str) -> bool:
        """
        Add one frame's landmarks under a named view.

        `extracted` may carry "pose" (2D image coords) and optionally "pose_world"
        (metric, hip-centred). World landmarks are preferred for angles when present.
        """
        if view not in self.samples_by_view:
            return False
        pose = extracted.get("pose") if isinstance(extracted, dict) else None
        if not pose:
            return False
        pose_lm = _drop_non_finite(_normalise_keys(pose))
        if self.normalised_input:
            # Restore isotropy once, at ingest, so no downstream metric can forget it.
            pose_lm = {
                idx: [v[0] * self.aspect_ratio, *v[1:]] for idx, v in pose_lm.items() if len(v) >= 2
            }
        self.samples_by_view[view].append(
            {
                "pose": pose_lm,
                "world": _drop_non_finite(_normalise_keys(extracted.get("pose_world") or {})),
            }
        )
        return True

    def observed_view(self, view: str) -> Optional[str]:
        """
        Which capture the landmarks actually show, independent of what it was labelled.

        A patient asked to show their left side will sometimes show their right. The
        metrics themselves no longer care - every sign is measured from the anatomy now
        rather than looked up from the label - but the operator does, because a session
        of two right-side captures has no second opinion in it and no left-side data at
        all.

        Side views are told apart by the anterior direction: the camera sees the
        subject's right side exactly when anterior projects toward increasing image x.
        Front and back are told apart by which side of the frame the subject's left
        shoulder falls on. Both are exact geometric facts about the landmarks, not
        thresholds.
        """
        samples = self.samples_by_view.get(view) or []
        if not samples:
            return None
        votes: Dict[str, int] = {}
        for sample in samples:
            lm = sample.get("pose") or {}
            if not lm:
                continue
            l_sh, r_sh = _get(lm, L_SH), _get(lm, R_SH)
            l_hip, r_hip = _get(lm, L_HIP), _get(lm, R_HIP)
            if None in (l_sh, r_sh, l_hip, r_hip):
                continue
            shoulder_span = abs(float(l_sh[0]) - float(r_sh[0]))
            hip_span = abs(float(l_hip[0]) - float(r_hip[0]))
            torso = abs(float(l_sh[1]) - float(l_hip[1])) or 1.0
            # Face-on, the shoulders are far apart across the frame; side-on they
            # collapse onto each other. A quarter of torso height separates the two
            # cases with room to spare.
            if max(shoulder_span, hip_span) < 0.25 * torso:
                anterior = _anterior_sign(lm)
                if anterior is None:
                    continue
                votes["rightside" if anterior > 0 else "leftside"] = (
                    votes.get("rightside" if anterior > 0 else "leftside", 0) + 1
                )
            else:
                lateral = _lateral_sign(lm)
                if lateral is None:
                    continue
                votes["front" if lateral > 0 else "back"] = (
                    votes.get("front" if lateral > 0 else "back", 0) + 1
                )
        if not votes:
            return None
        return max(votes, key=votes.get)

    def orientation_warnings(self) -> List[str]:
        """Captures whose landmarks disagree with the view they were filed under."""
        warnings: List[str] = []
        for view in self.views_captured:
            observed = self.observed_view(view)
            if observed is None or observed == view:
                continue
            warnings.append(
                f"The capture labelled '{view}' shows a '{observed}' view. The subject "
                f"faced the wrong way, or the views were submitted in the wrong order. "
                f"Measurements are computed from the anatomy and remain correct, but "
                f"this session has no genuine '{view}' capture."
            )
        return warnings

    def frames(self, view: str) -> int:
        return len(self.samples_by_view.get(view, []))

    @property
    def views_captured(self) -> List[str]:
        return [v for v in VALID_VIEWS if self.samples_by_view.get(v)]

    # -- computation --------------------------------------------------------

    def finalize(self, person_id: str) -> PostureResult:
        result = PostureResult(
            calibration_date=datetime.now(timezone.utc).isoformat(),
            person_id=str(person_id),
            views_captured=self.views_captured,
            frames_per_view={v: self.frames(v) for v in self.views_captured},
            aspect_assumed=self.aspect_assumed,
            orientation_warnings=self.orientation_warnings(),
            representative_landmarks=self._representative_landmarks(),
        )

        for spec in POSTURE_METRICS:
            result.metrics[spec.key] = self._compute(spec)
        return result

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

        # Measure from EVERY capture that can legitimately see this metric, then
        # combine - rather than picking the view with the most frames and discarding
        # the rest, which is what this did.
        #
        # The two views are not merely a second opinion, they are a correction. Both
        # things that systematically bias a 2-D measurement - the camera being rolled,
        # and the subject standing turned - are FIXED in space while the subject turns
        # 180 degrees between front and back (or the camera moves between left and
        # right). So the error they introduce arrives with opposite sign in the two
        # captures, and averaging cancels it. Measured on the harness: 5 degrees of
        # camera roll moves a shoulder tilt to +2.39 from one side and -7.61 from the
        # other, and their mean is -2.61, which is the truth to two decimals. Six
        # degrees of roll shifts trunk angle by -3 and +3, mean exact.
        #
        # Picking one view therefore reported a value wrong by half the disagreement.
        # On a live capture with 7.4 degrees of front-to-back disagreement, that was
        # 3.7 degrees of error on a metric whose entire normal range is +/-3.
        per_view: Dict[str, float] = {}
        per_view_spread: Dict[str, float] = {}
        dropped: Dict[str, int] = {}
        total_frames = 0
        for candidate in views_for(spec):
            if self.frames(candidate) < self.min_frames:
                continue
            raw = [
                v for v in (
                    self._per_frame(spec, sample, candidate)
                    for sample in self.samples_by_view[candidate]
                )
                if v is not None and np.isfinite(v)
            ]
            # Drop frames whose value is physically impossible BEFORE aggregating.
            #
            # The physical range used to be checked once, on the final median, which
            # let a minority of frames the tracker got badly wrong survive into the
            # statistics. They rarely move a median, so the reported VALUE stayed right
            # - but they wreck the spread, and the spread is what decides whether the
            # value is shown as confident. A live capture reported trunk lean as -0.5
            # degrees with a frame-to-frame spread of 177.92, and was badged low
            # confidence on the strength of frames in which the skeleton was upside
            # down. A frame outside the range of human anatomy is a tracking failure,
            # not a measurement, and it should not get a vote in either number.
            if spec.physical_range is not None:
                lo, hi = spec.physical_range
                values = [v for v in raw if lo <= v <= hi]
            else:
                values = raw
            dropped[candidate] = len(raw) - len(values)
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
                    f"Requires a {needed} capture with at least {self.min_frames} "
                    f"usable frames."
                ),
                **base,
            )

        view = "+".join(per_view)
        value = float(np.mean(list(per_view.values())))
        # The widest within-view scatter, not the scatter of the combined set: this
        # answers "did the subject hold still", and pooling two views would conflate
        # that with the between-view disagreement reported separately below.
        spread = max(per_view_spread.values()) if per_view_spread else None
        status = classify(spec, value)

        # What the captures disagreed by, recorded whether or not it passed. Frame-to-
        # frame spread only says the subject held still; it says nothing about whether
        # the camera saw them from a usable angle. A subject standing 20 degrees off
        # square produces a tight, confident, wrong number from each view.
        values_list = list(per_view.values())
        cross_delta = (
            float(max(values_list) - min(values_list)) if len(values_list) > 1 else None
        )
        compared = list(per_view) if len(per_view) > 1 else []

        detail = None
        if status == Status.OUT_OF_RANGE:
            lo, hi = spec.physical_range
            detail = (
                f"Computed {value:.2f} {spec.unit.value}, outside the physically possible "
                f"range [{lo}, {hi}]. This indicates a computation or capture defect, "
                f"not a clinical finding."
            )
        elif status == Status.MEASURED and spec.max_iqr is not None and spread is not None:
            if spread > spec.max_iqr:
                status = Status.LOW_CONFIDENCE
                detail = (
                    f"Frame-to-frame spread {spread:.2f} exceeds the {spec.max_iqr} "
                    f"threshold for this metric; the subject may have moved or tracking "
                    f"was unstable."
                )

        discarded = sum(dropped.values())
        kept = total_frames
        if status == Status.MEASURED and kept and discarded > 0.25 * (kept + discarded):
            status = Status.LOW_CONFIDENCE
            detail = (
                f"{discarded} of {kept + discarded} frames produced a physically "
                f"impossible value and were discarded; the tracker lost the subject "
                f"for a large part of this capture."
            )

        if status == Status.MEASURED and cross_delta is not None:
            limit = tolerance_for(spec.key)
            if limit is not None and cross_delta > limit:
                status = Status.LOW_CONFIDENCE
                detail = (
                    f"The {' and '.join(compared)} captures disagree by "
                    f"{cross_delta:.2f} {spec.unit.value} on this metric, more than its "
                    f"{limit} tolerance. Both cannot be right; the subject was probably "
                    f"not square to the camera, or one capture was obstructed."
                )

        return MetricResult(
            value=None if status in (Status.OUT_OF_RANGE,) else round(value, 3),
            status=status,
            spread=None if spread is None else round(spread, 3),
            n_frames=total_frames,
            view_used=view,
            detail=detail,
            cross_view_delta=None if cross_delta is None else round(cross_delta, 3),
            views_compared=compared or None,
            **base,
        )

    def _representative_landmarks(self) -> Dict[str, Dict[int, List[float]]]:
        """
        Median position of each landmark within each view.

        Per-view, because averaging a landmark across front and side captures produces
        a position that corresponds to no real anatomy - the same defect that made the
        old metric computation wrong.
        """
        out: Dict[str, Dict[int, List[float]]] = {}
        for view, samples in self.samples_by_view.items():
            if not samples:
                continue
            per_idx: Dict[int, List[List[float]]] = {}
            for sample in samples:
                for idx, value in (sample.get("pose") or {}).items():
                    if value is not None and len(value) >= 2:
                        per_idx.setdefault(idx, []).append([float(v) for v in value[:3]])
            if per_idx:
                out[view] = {
                    idx: np.median(np.array(vals), axis=0).tolist()
                    for idx, vals in per_idx.items()
                }
        return out

    def _pick_view(self, spec: MetricSpec) -> Optional[str]:
        """Choose the best captured view that legitimately shows this metric's plane."""
        candidates = [v for v in views_for(spec) if self.frames(v) >= self.min_frames]
        if not candidates:
            return None
        return max(candidates, key=self.frames)

    # -- per-frame metric implementations -----------------------------------

    def _per_frame(self, spec: MetricSpec, sample: Dict, view: str) -> Optional[float]:
        """
        Compute one metric from one frame, preferring the image plane over world 3-D.

        This preference is the opposite of what it was, and the reversal is the single
        largest accuracy change in the posture pipeline. World landmarks were preferred
        because they are immune to camera obliquity, which is true and was the right
        instinct. What it overlooked is where those coordinates come from: MediaPipe
        does not measure depth, it infers it from one image, and the inference is worst
        along the camera axis. Certified against a realistic world-landmark error -
        systematic, a few centimetres, several times worse in depth - the world-space
        path landed within tolerance on 48% of captures for pelvic obliquity, 62% for
        shoulder obliquity and 80% for trunk angle. The same metrics computed from the
        2-D image landmarks, which the detector genuinely measures, all hit 100%.

        Obliquity is still a real threat to a 2-D measurement, but it is now handled by
        the tool built for it rather than by degrading every measurement in advance:
        _compute measures from every capture that can see the metric and averages
        them, which cancels the bias outright, and drops confidence when they disagree. Trading a detectable failure for an
        undetectable one was the wrong trade.

        World landmarks remain the fallback for a frame where the 2-D implementation
        cannot resolve the geometry - a sagittal offset seen from the front has no sign
        in the image plane, for instance - and remain the second opinion.
        """
        pose = sample.get("pose") or {}
        world = sample.get("world") or {}
        fn = _IMPLEMENTATIONS.get(spec.key)
        if fn is None:
            return None

        if pose:
            value = fn(pose, False, view)
            if value is not None and math.isfinite(value):
                return value
        if world:
            value = fn(world, True, view)
            if value is not None and math.isfinite(value):
                return value
        return None


# ---------------------------------------------------------------------------
# Per-frame implementations.
#
# Each takes (landmarks, use_world, view) and returns a single float or None.
# `use_world` selects between metric world coordinates (y up, z anterior) and the
# 2D image projection (y down, no depth).
# ---------------------------------------------------------------------------


def _get(lm: Dict, idx: int) -> Optional[Sequence[float]]:
    v = lm.get(idx)
    if v is None or len(v) < 2:
        return None
    if len(v) >= 4 and v[3] is not None and v[3] < MIN_VISIBILITY:
        return None
    return v


def _mid(lm: Dict, a: int, b: int):
    pa, pb = _get(lm, a), _get(lm, b)
    return midpoint(pa, pb) if pa is not None and pb is not None else None


def _head_rotation(lm, use_world, view):
    """
    Head yaw: rotation of the face away from the shoulders, in the transverse plane.

    Positive = turned toward the subject's right.

    This IS measurable from pose landmarks, contrary to the note that retired it. What
    was not measurable was the thing the old implementation computed - a nose-to-ear
    DISTANCE RATIO reported as a percentage, which is not an angle and has no reference
    range. The angle itself needs only the ear midpoint, the nose and the shoulder line,
    all of which MediaPipe provides: the ear-to-nose vector gives where the face points,
    the shoulder line gives where the trunk points, and the angle between them in the
    horizontal plane is the yaw.

    Transverse-plane only, so it needs world landmarks. A camera cannot see rotation
    about the vertical axis in the image plane - that is precisely the rotation that
    moves a landmark toward or away from the lens rather than across it.
    """
    if not use_world:
        return None
    l_sh, r_sh = _get(lm, L_SH), _get(lm, R_SH)
    ear = _mid(lm, L_EAR, R_EAR)
    nose = _get(lm, NOSE)
    if None in (l_sh, r_sh, ear, nose):
        return None
    if len(l_sh) < 3 or len(r_sh) < 3 or len(ear) < 3 or len(nose) < 3:
        return None
    # Angle from the shoulder line to the facing direction. A head square to the
    # shoulders faces perpendicular to that line, so subtract the 90 degrees.
    ang = transverse_angle(r_sh, l_sh, ear, nose)
    if ang is None:
        return None
    yaw = ang - 90.0
    # Wrap into (-180, 180]; a head turned 170 degrees is a tracking failure, and the
    # physical range will catch it, but it must not arrive as +190.
    while yaw <= -180.0:
        yaw += 360.0
    while yaw > 180.0:
        yaw -= 360.0
    return yaw


def _foot_progression(side: str):
    """
    Foot progression angle in standing: the long axis of the foot against the body's
    own forward direction, in the transverse plane. Positive = toe-out.

    The note that retired this said there is no line of progression in static standing,
    which is true and beside the point: the clinical measurement in standing is against
    the SAGITTAL PLANE, not against a direction of travel. Out-toeing and in-toeing are
    exactly what a standing assessment is looking for, and the body's forward direction
    is available from the shoulder line - it is the perpendicular to it.

    Transverse-plane, so world landmarks only, for the same reason as head yaw.
    """
    heel, toe = (L_HEEL, L_FOOT) if side == "left" else (R_HEEL, R_FOOT)
    # Toe-out is lateral - away from the midline - so the two feet rotate in opposite
    # directions and the raw transverse angle carries opposite signs for them. The
    # reference axis runs from the right shoulder to the left, which is why the left
    # foot is the one that needs negating.
    outward = -1.0 if side == "left" else 1.0

    def impl(lm, use_world, view):
        if not use_world:
            return None
        l_sh, r_sh = _get(lm, L_SH), _get(lm, R_SH)
        h, t = _get(lm, heel), _get(lm, toe)
        if None in (l_sh, r_sh, h, t):
            return None
        if min(len(l_sh), len(r_sh), len(h), len(t)) < 3:
            return None
        ang = transverse_angle(r_sh, l_sh, h, t)
        if ang is None:
            return None
        progression = ang - 90.0
        while progression <= -180.0:
            progression += 360.0
        while progression > 180.0:
            progression -= 360.0
        return outward * progression

    return impl


def _world_axes(lm) -> Optional[Tuple[float, float]]:
    """
    (vertical sign, anterior sign) for a set of world landmarks, read off the body.

    MediaPipe's world landmarks are documented as metres from the mid-hip, but the
    ORIENTATION of those axes is not something to take on faith: the image landmarks
    have y growing downward, the world ones are widely described as matching that, and
    a synthetic harness that emits y-up will validate the opposite convention happily
    and forever. Forward head position shipped at -0.45 on a live capture - a normal
    subject's head reported as sitting well behind their shoulders - for exactly this
    reason.

    So the axes are derived instead, from two facts that hold for every standing person
    in every capture: the shoulders are above the hips, and the nose is in front of the
    shoulders. Returns +1 for the vertical sign when world y increases upward, and +1
    for the anterior sign when world z increases anteriorly.

    None when the landmarks needed to establish it are missing, which is the honest
    answer: without them there is no way to know which way is up.
    """
    sh = _mid(lm, L_SH, R_SH)
    hip = _mid(lm, L_HIP, R_HIP)
    if sh is None or hip is None or len(sh) < 3 or len(hip) < 3:
        return None
    rise = float(sh[1]) - float(hip[1])
    if abs(rise) < 1e-6:
        return None
    y_up = 1.0 if rise > 0 else -1.0

    nose = _get(lm, NOSE)
    ear = _mid(lm, L_EAR, R_EAR)
    reference = nose if nose is not None and len(nose) >= 3 else ear
    if reference is None or len(reference) < 3:
        # The head is what makes anterior identifiable; without it, report the vertical
        # axis only by leaving the anterior sign unknown.
        return None
    forward = float(reference[2]) - float(sh[2])
    if abs(forward) < 1e-9:
        return None
    return y_up, (1.0 if forward > 0 else -1.0)


def _anterior_sign(lm) -> Optional[float]:
    """
    Which image-x direction is the subject's ANTERIOR, measured from the foot.

    The toe is in front of the heel. That is true of every human, in every capture, at
    every camera angle, and it does not care whether the preview was mirrored or which
    side the patient actually turned - so measuring it is strictly better than looking
    the answer up from the view the operator SAID they were capturing.

    Looking it up is what shipped, and both entries in the table were inverted, so
    forward head position came back negative on live captures: a normal subject's head
    reported as sitting behind their shoulders. A lookup also silently mirrors every
    sagittal measurement when a patient turns the wrong way, which is a thing patients
    do and which no amount of on-screen instruction prevents.

    Returns None when the feet are too close together in x to give a direction, which is
    what a front or back capture looks like - and those cannot see sagittal lean anyway.
    """
    votes = []
    for heel, toe in ((L_HEEL, L_FOOT), (R_HEEL, R_FOOT)):
        h, t = _get(lm, heel), _get(lm, toe)
        if h is None or t is None:
            continue
        span = float(t[0]) - float(h[0])
        votes.append(span)
    if not votes:
        return None
    total = sum(votes)
    # Require the foot to project with real length; a foot pointing at the camera gives
    # a near-zero span and no usable direction.
    scale = max(abs(v) for v in votes)
    if scale < 1e-6 or abs(total) < 0.5 * scale:
        return None
    return 1.0 if total > 0 else -1.0


def _lateral_sign(lm) -> Optional[float]:
    """
    +1 when image x increases toward the subject's LEFT, -1 when it increases toward
    their right.

    Read off the shoulders, which MediaPipe labels anatomically whichever way the
    subject is turned. Every frontal-plane comparison below multiplies by this instead
    of special-casing `view == "back"`, because the back view is not the only thing that
    flips handedness - a mirrored camera preview does too, and the view label cannot
    see that.
    """
    l_sh, r_sh = _get(lm, L_SH), _get(lm, R_SH)
    if l_sh is None or r_sh is None:
        l_sh, r_sh = _get(lm, L_HIP), _get(lm, R_HIP)
    if l_sh is None or r_sh is None:
        return None
    dx = float(l_sh[0]) - float(r_sh[0])
    if abs(dx) < 1e-9:
        return None
    return 1.0 if dx > 0 else -1.0


def _sagittal(lm, use_world, view, prox, dist_):
    """Signed sagittal angle of a segment, positive = anterior lean, in either space."""
    a, b = prox, dist_
    if a is None or b is None:
        return None
    if use_world:
        return sagittal_segment_angle(a, b)
    sign = _anterior_sign(lm)
    if sign is None:  # a frontal view cannot see sagittal lean
        return None
    ang = signed_angle_from_vertical(a, b, y_down=True)
    return None if ang is None else sign * ang


def _trunk_angle(lm, use_world, view):
    return _sagittal(lm, use_world, view, _mid(lm, L_HIP, R_HIP), _mid(lm, L_SH, R_SH))


def _kyphosis(lm, use_world, view):
    ear = _mid(lm, L_EAR, R_EAR)
    sh = _mid(lm, L_SH, R_SH)
    hip = _mid(lm, L_HIP, R_HIP)
    if ear is None or sh is None or hip is None:
        return None
    ang = interior_angle(ear, sh, hip, use_3d=use_world)
    return None if ang is None else abs(180.0 - ang)


def _forward_head_ratio(lm, use_world, view):
    """
    Anterior offset of the ears from the shoulders, normalised to shoulder width.

    The normaliser is the catch. Shoulder width is a FRONTAL measurement and this is a
    SAGITTAL metric, so the one view that can see the offset is the one view that cannot
    see the width: edge-on, the two shoulders project almost on top of each other. On a
    side capture their apparent separation came out at 16% of the real thing, which
    inflated the ratio roughly six-fold - a patient with a 0.08 ratio was reported at
    0.54 and graded "above range" - and made it unstable besides, because dividing by a
    small noisy number amplifies the noise with it.

    So the 2-D path refuses the job unless the shoulders are genuinely face-on, and the
    caller falls back to world landmarks, where shoulder width is a real distance. That
    is the right division of labour: an in-plane ANGLE is measured far better in the
    image than in MediaPipe's inferred depth, but a body WIDTH seen edge-on is not
    measurable in the image at all.
    """
    ear = _mid(lm, L_EAR, R_EAR)
    sh = _mid(lm, L_SH, R_SH)
    l_sh, r_sh = _get(lm, L_SH), _get(lm, R_SH)
    if ear is None or sh is None or l_sh is None or r_sh is None:
        return None
    width = distance(l_sh, r_sh, use_3d=use_world)
    if not width or width < 1e-6:
        return None

    if use_world:
        axes = _world_axes(lm)
        if axes is None:
            return None
        _, anterior = axes
        offset = anterior * (ear[2] - sh[2])   # anterior offset in metres
    else:
        l_hip, r_hip = _get(lm, L_HIP), _get(lm, R_HIP)
        if l_hip is None or r_hip is None:
            return None
        torso = abs(float(sh[1]) - float((l_hip[1] + r_hip[1]) / 2.0))
        # Face-on, shoulder span is most of torso height; edge-on it collapses. Below
        # half, the separation on screen is foreshortening, not anatomy.
        if torso < 1e-6 or width < 0.5 * torso:
            return None
        sign = _anterior_sign(lm)
        if sign is None:
            return None
        offset = sign * (ear[0] - sh[0])  # anterior offset in pixels
    return offset / width


def _frontal_tilt(lm, use_world, view, left_idx: int, right_idx: int):
    """
    Tilt of a left-right anatomical segment from horizontal. Negative = the subject's
    LEFT side is the high one.

    Computed without reference to which side of the IMAGE each landmark falls on, which
    is the whole point. The previous version took the angle of the vector from the left
    landmark to the right one, so it depended on the capture's handedness: on an
    un-mirrored front-facing webcam the subject's left shoulder lands on the image's
    RIGHT, the vector runs backwards, and a 4 degree shoulder tilt is reported as 176.
    That is what shipped - three frontal metrics reading ~178 degrees on live patients
    and being withheld as physically impossible.

    It was not caught because the synthetic harness built a mirrored subject, so its
    front view had the opposite handedness to a real camera and the bug cancelled out.
    Special-casing the back view to mirror it did not help either: that fixed one
    handedness by assuming another.

    Taking the vertical difference over the ABSOLUTE horizontal separation removes the
    dependency entirely. The numerator carries the clinical content - which side is
    high - and the denominator only sets the scale, so front, back, mirrored preview and
    un-mirrored capture all give the same answer.
    """
    a, b = _get(lm, left_idx), _get(lm, right_idx)
    if a is None or b is None:
        return None
    if use_world:
        # The medio-lateral separation may lie in any direction in the horizontal plane
        # depending on which way the subject faces, and which way world y points is
        # derived from the body rather than assumed.
        axes = _world_axes(lm)
        if axes is None:
            return None
        y_up, _ = axes
        rise = y_up * (float(b[1]) - float(a[1]))   # right minus left, in body-up terms
        run = float(np.hypot(b[0] - a[0], (b[2] - a[2]) if len(a) > 2 and len(b) > 2 else 0.0))
    else:
        # Image coordinates: y grows downward, so the left landmark being higher on the
        # subject means a SMALLER y.
        rise = float(a[1]) - float(b[1])
        run = abs(float(b[0]) - float(a[0]))
    if run < 1e-9:
        return None
    return float(np.degrees(np.arctan2(rise, run)))


def _shoulder_obliquity(lm, use_world, view):
    return _frontal_tilt(lm, use_world, view, L_SH, R_SH)


def _pelvic_obliquity(lm, use_world, view):
    return _frontal_tilt(lm, use_world, view, L_HIP, R_HIP)


def _head_lateral_flexion(lm, use_world, view):
    return _frontal_tilt(lm, use_world, view, L_EAR, R_EAR)


def _trunk_lateral_shift(lm, use_world, view):
    sh = _mid(lm, L_SH, R_SH)
    hip = _mid(lm, L_HIP, R_HIP)
    l_sh, r_sh = _get(lm, L_SH), _get(lm, R_SH)
    if sh is None or hip is None or l_sh is None or r_sh is None:
        return None
    width = distance(l_sh, r_sh, use_3d=use_world)
    if not width or width < 1e-6:
        return None
    lateral = _lateral_sign(lm)
    if lateral is None:
        return None
    # Positive = the trunk sits toward the subject's LEFT of the pelvis, regardless of
    # which way they faced or whether the preview was mirrored.
    return lateral * (sh[0] - hip[0]) / width


def _knee_angle(side: str):
    hip, knee, ank = (L_HIP, L_KNEE, L_ANK) if side == "left" else (R_HIP, R_KNEE, R_ANK)

    def impl(lm, use_world, view):
        a, b, c = _get(lm, hip), _get(lm, knee), _get(lm, ank)
        return interior_angle(a, b, c, use_3d=use_world)

    return impl


def _hip_angle(side: str):
    """
    Trunk-to-thigh angle at the hip: mid-shoulder, hip, knee.

    The trunk reference is the MID-shoulder, not the ipsilateral one. Hip flexion is
    the angle between the trunk axis and the thigh, and the trunk axis runs up the
    midline; taking the shoulder on the same side instead drags a medio-lateral offset
    into what is meant to be a sagittal measurement. Shoulders sit wider than hips
    (0.129 vs 0.095 of height), so the two are about 6 cm apart laterally, and in the
    image plane that offset projects straight into the angle - it showed up as a
    consistent +2.5 degree bias that no amount of averaging removed.
    """
    hip, knee = (L_HIP, L_KNEE) if side == "left" else (R_HIP, R_KNEE)

    def impl(lm, use_world, view):
        a, b, c = _mid(lm, L_SH, R_SH), _get(lm, hip), _get(lm, knee)
        return interior_angle(a, b, c, use_3d=use_world)

    return impl


def _knee_varus_valgus(lm, use_world, view):
    """Frontal hip-knee-ankle deviation, averaged over both legs. Positive = valgus."""
    vals = []
    for hip, knee, ank, sign in ((L_HIP, L_KNEE, L_ANK, +1.0), (R_HIP, R_KNEE, R_ANK, -1.0)):
        a, b, c = _get(lm, hip), _get(lm, knee), _get(lm, ank)
        if a is None or b is None or c is None:
            continue
        # Deviation of the knee from the hip-ankle line, in the frontal plane.
        mid_x = (a[0] + c[0]) / 2.0
        span = abs(a[1] - c[1]) if use_world else abs(c[1] - a[1])
        if span < 1e-6:
            continue
        vals.append(np.degrees(np.arctan2(sign * (b[0] - mid_x), span)))
    if not vals:
        return None
    lateral = _lateral_sign(lm)
    if lateral is None:
        return None
    return lateral * float(np.mean(vals))


def _shoulder_hip_width_ratio(lm, use_world, view):
    l_sh, r_sh, l_hip, r_hip = _get(lm, L_SH), _get(lm, R_SH), _get(lm, L_HIP), _get(lm, R_HIP)
    if None in (l_sh, r_sh, l_hip, r_hip):
        return None
    sw = distance(l_sh, r_sh, use_3d=use_world)
    hw = distance(l_hip, r_hip, use_3d=use_world)
    if not sw or not hw or hw < 1e-6:
        return None
    return sw / hw


def _leg_length_asymmetry(lm, use_world, view):
    def leg(hip, knee, ank):
        a, b, c = _get(lm, hip), _get(lm, knee), _get(lm, ank)
        if a is None or b is None or c is None:
            return None
        d1 = distance(a, b, use_3d=use_world)
        d2 = distance(b, c, use_3d=use_world)
        return None if d1 is None or d2 is None else d1 + d2

    left = leg(L_HIP, L_KNEE, L_ANK)
    right = leg(R_HIP, R_KNEE, R_ANK)
    if not left or not right:
        return None
    total = left + right
    if total < 1e-6:
        return None
    # Purely anatomical: two segment lengths, compared. There is no image direction in
    # it, so the back view must NOT negate it - doing so reported a longer left leg as a
    # longer right one on any back capture. It went unnoticed because the synthetic
    # subject had legs of equal length, making the truth zero and the sign invisible.
    return (left - right) / (total / 2.0)


_IMPLEMENTATIONS = {
    "trunk_angle": _trunk_angle,
    "thoracic_kyphosis_angle": _kyphosis,
    "forward_head_ratio": _forward_head_ratio,
    "shoulder_obliquity": _shoulder_obliquity,
    "pelvic_obliquity": _pelvic_obliquity,
    "head_lateral_flexion": _head_lateral_flexion,
    "trunk_lateral_shift_ratio": _trunk_lateral_shift,
    "left_knee_angle": _knee_angle("left"),
    "right_knee_angle": _knee_angle("right"),
    "left_hip_angle": _hip_angle("left"),
    "right_hip_angle": _hip_angle("right"),
    "knee_varus_valgus": _knee_varus_valgus,
    "shoulder_hip_width_ratio": _shoulder_hip_width_ratio,
    "leg_length_asymmetry_ratio": _leg_length_asymmetry,
    "head_rotation": _head_rotation,
    "foot_progression_angle_left": _foot_progression("left"),
    "foot_progression_angle_right": _foot_progression("right"),
}


def _drop_non_finite(lm: Dict[int, Sequence[float]]) -> Dict[int, Sequence[float]]:
    """
    Discard landmarks carrying NaN or infinity.

    A tracker that loses a joint sometimes emits NaN rather than omitting it. NaN then
    propagates through every trigonometric step without raising, and arrives as a
    "measured" metric whose value is NaN - which serialises to JSON null and reaches the
    report indistinguishable from a value we deliberately withheld. Dropping the
    landmark at ingest routes it to insufficient_data instead, which carries a reason.
    """
    return {
        idx: v for idx, v in lm.items()
        if v is not None and len(v) >= 2 and all(
            isinstance(c, (int, float)) and math.isfinite(c) for c in v[:3]
        )
    }


def _normalise_keys(d: Dict) -> Dict[int, Sequence[float]]:
    """Landmark dicts arrive with int keys from Python and str keys from JSON."""
    out: Dict[int, Sequence[float]] = {}
    for k, v in (d or {}).items():
        try:
            out[int(k)] = v
        except (TypeError, ValueError):
            continue
    return out
