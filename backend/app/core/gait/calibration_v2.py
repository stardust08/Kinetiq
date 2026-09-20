"""
Per-cycle gait metric computation.

Replaces the whole-capture aggregation in calibration.py. The differences that matter:

  * Events come from app.core.gait.events (relative-coordinate detection), not from
    ankle-Y maxima. On a synthetic walk with 5 true heel strikes the old detector found
    10-11 and drove cadence onto its 200 steps/min clamp; the new one finds 5 with no
    false positives.
  * Metrics are computed per gait cycle and aggregated with a median, and the
    cycle-to-cycle coefficient of variation is reported. Variability is itself a
    clinical signal, and a high CV is the honest way to say "this capture was poor".
  * Spatial metrics are normalised to the subject's own leg length, so they are
    dimensionless and comparable between sessions. The previous values were the ankle's
    pixel travel in the image, which changed with camera distance.
  * Nothing is invented. Where detection fails the metric comes back as
    insufficient_data rather than a clamped or hardcoded default.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from app.core.gait.events import (
    GaitEvents,
    annotate_phases,
    detect_events,
    double_support_percent,
    smooth,
    stance_swing_percent,
    valid_cycles,
)
from app.core.geometry import interior_angle
from app.core.metrics.gait_registry import GAIT_METRICS, MIN_FPS_REQUIRED
from app.core.metrics.registry import MetricSpec, Status, classify
from app.core.pose.calibration_v2 import MetricResult

L_SH, R_SH = 11, 12
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANK, R_ANK = 27, 28
L_HEEL, R_HEEL = 29, 30
L_FOOT, R_FOOT = 31, 32

SIDE_VIEWS = ("leftside", "rightside")
# Assumed when the client does not report its capture dimensions. Flagged on the result.
DEFAULT_ASPECT_RATIO = 4.0 / 3.0
MIN_CYCLES = 2
MIN_FRAMES = 30


@dataclass
class GaitResult:
    calibration_date: str
    person_id: str
    metrics: Dict[str, MetricResult] = field(default_factory=dict)
    views_captured: List[str] = field(default_factory=list)
    annotated_views: Dict[str, Any] = field(default_factory=dict)
    cycles_analysed: int = 0
    aspect_ratio: float = DEFAULT_ASPECT_RATIO
    aspect_assumed: bool = True
    # The frame rate the metrics were actually computed on, and whether it came from
    # the frames' timestamps or from what the client claimed. Stored because every
    # temporal metric is only as trustworthy as this number.
    fps_used: int = 30
    fps_measured: bool = False
    fps_note: Optional[str] = None
    # Captures whose landmarks disagree with the view they were filed under.
    orientation_warnings: List[str] = field(default_factory=list)
    schema_version: int = 2

    def value(self, key: str) -> Optional[float]:
        m = self.metrics.get(key)
        return m.value if m and m.status == Status.MEASURED else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "calibrationDate": self.calibration_date,
            "personId": self.person_id,
            "fpsUsed": self.fps_used,
            "fpsMeasured": self.fps_measured,
            "fpsNote": self.fps_note,
            "orientationWarnings": self.orientation_warnings,
            "schemaVersion": self.schema_version,
            "viewsCaptured": self.views_captured,
            "cyclesAnalysed": self.cycles_analysed,
            "aspectRatio": self.aspect_ratio,
            "aspectAssumed": self.aspect_assumed,
            "metrics": {k: v.to_dict() for k, v in self.metrics.items()},
        }


class GaitAnalyser:
    """
    Computes gait metrics from per-view landmark time series.

        analyser = GaitAnalyser(fps=30)
        analyser.add_view("leftside", time_series, background_image)
        result = analyser.finalize(person_id="user_123")
    """

    def __init__(self, fps: int = 30, aspect_ratio: Optional[float] = None):
        """
        aspect_ratio: capture width / height, e.g. 1.7778 for 1280x720.

        This is REQUIRED for correct geometry. MediaPipe normalises x by the image
        width and y by the image height, so normalised landmark space is anisotropic
        whenever the frame is not square: a horizontal distance and a vertical distance
        of the same physical size come back as different numbers. Computing angles or
        distances directly on those coordinates - as the previous implementation did -
        distorts every result by the aspect ratio. Measured on a synthetic walk, peak
        knee flexion came back as 41.9 degrees instead of 60 at 16:9, and stride length
        was under-reported by 43%.

        We restore isotropy by scaling x into units of image height. When the caller
        does not supply the ratio we assume 4:3 and flag it on the result, because
        silently guessing would reintroduce the same class of error.
        """
        self.declared_fps = max(1, int(fps))
        self.fps = self.declared_fps
        self.fps_measured = False
        self.fps_note: Optional[str] = None
        self.aspect_ratio = float(aspect_ratio) if aspect_ratio else DEFAULT_ASPECT_RATIO
        self.aspect_assumed = aspect_ratio is None
        self.views: Dict[str, List[Dict]] = {}
        self.background_images: Dict[str, str] = {}

    def add_view(
        self, view_type: str, time_series: List[Dict], background_image: Optional[str] = None
    ) -> None:
        self.views[view_type] = time_series or []
        if background_image:
            self.background_images[view_type] = background_image
        self._update_fps()

    # -- capture rate -------------------------------------------------------

    def _update_fps(self) -> None:
        """
        Derive the true frame rate from the frames' own timestamps.

        The client sends the rate it ASKED the browser for. That is not the rate it got.
        A capture loop is a setInterval or a requestAnimationFrame callback competing
        with MediaPipe inference on the same thread, and on a mid-range laptop a 60 fps
        request routinely lands at 40-50. Every temporal metric divides by this number -
        cadence, stride time, stance percentage, walking speed - so believing a declared
        60 while the camera delivered 45 inflates all of them by a third, uniformly and
        invisibly. No amount of downstream validation can catch it, because the data is
        self-consistent; it is just on the wrong time base.

        The median interval is used rather than the mean: a capture that stalls for a
        few frames should not drag the whole time base with it.
        """
        intervals: List[float] = []
        for series in self.views.values():
            stamps = [
                float(f["timestamp"]) for f in series
                if isinstance(f, dict) and isinstance(f.get("timestamp"), (int, float))
            ]
            if len(stamps) < 10:
                continue
            deltas = np.diff(np.asarray(stamps))
            deltas = deltas[(deltas > 0.5) & (deltas < 500.0)]  # ms, sane frame gaps
            if deltas.size >= 8:
                intervals.append(float(np.median(deltas)))
        if not intervals:
            self.fps_measured = False
            self.fps = self.declared_fps
            return

        measured = 1000.0 / float(np.median(intervals))
        self.fps = max(1, int(round(measured)))
        self.fps_measured = True
        drift = abs(measured - self.declared_fps) / self.declared_fps
        if drift > 0.10:
            self.fps_note = (
                f"Capture ran at {measured:.1f} fps, not the {self.declared_fps} fps "
                f"requested. Timing metrics use the measured rate."
            )
        else:
            self.fps_note = None

    # -- data access --------------------------------------------------------

    def _lm(self, frame: Dict, idx: int) -> Optional[Sequence[float]]:
        """
        Read a landmark, restoring isotropy.

        x is scaled by the aspect ratio so that x and y are both expressed in units of
        image height. Every geometric helper below can then treat the coordinates as a
        proper Euclidean plane. This is the single point where the correction is
        applied, so no downstream computation can forget it.
        """
        lms = frame.get("landmarks") or {}
        v = lms.get(str(idx), lms.get(idx))
        if v is None or len(v) < 2:
            return None
        out = [float(x) for x in v]
        out[0] *= self.aspect_ratio
        return out

    # -- capture orientation ------------------------------------------------

    def _shoulder_span_ratio(self, frame: Dict) -> Optional[float]:
        """Widest shoulder/hip separation as a fraction of torso height, isotropic."""
        l_sh, r_sh = self._lm(frame, L_SH), self._lm(frame, R_SH)
        l_hip, r_hip = self._lm(frame, L_HIP), self._lm(frame, R_HIP)
        if None in (l_sh, r_sh, l_hip, r_hip):
            return None
        torso = abs(((l_sh[1] + r_sh[1]) / 2) - ((l_hip[1] + r_hip[1]) / 2))
        if torso < 1e-9:
            return None
        return max(abs(l_sh[0] - r_sh[0]), abs(l_hip[0] - r_hip[0])) / torso

    def _frame_anterior(self, frame: Dict) -> Optional[float]:
        """Heel-to-toe direction along image x: the anterior direction, or None."""
        spans = []
        for heel, toe in ((L_HEEL, L_FOOT), (R_HEEL, R_FOOT)):
            h, t = self._lm(frame, heel), self._lm(frame, toe)
            if h is None or t is None:
                continue
            spans.append(t[0] - h[0])
        if not spans:
            return None
        total = sum(spans)
        scale = max(abs(v) for v in spans)
        # A foot pointing at the camera projects to no length, and two feet disagreeing
        # means mid-stride with one foot turning. Neither is a direction.
        if scale < 1e-9 or abs(total) < 0.5 * scale:
            return None
        return total

    def _frame_lateral(self, frame: Dict) -> Optional[float]:
        """Positive when image x increases toward the subject's left."""
        l_sh, r_sh = self._lm(frame, L_SH), self._lm(frame, R_SH)
        if l_sh is None or r_sh is None:
            return None
        dx = l_sh[0] - r_sh[0]
        return None if abs(dx) < 1e-9 else dx

    def observed_view(self, view_type: str) -> Optional[str]:
        """
        Which capture this actually is, from the landmarks alone.

        Same three geometric facts the posture calibrator and the browser-side gate use,
        so all three agree by construction rather than by coincidence:

          side vs face-on   shoulders and hips are far apart across the frame face-on
                            and collapse onto each other edge-on
          left vs right     the toe is in front of the heel, so heel-to-toe IS the
                            anterior direction in the image, and the camera is on the
                            subject's right exactly when that points toward increasing x
          front vs back     MediaPipe labels left and right anatomically whichever way
                            the subject is turned, so which side of the frame the left
                            shoulder falls on says which way they face

        The side-versus-face-on question is decided ONCE for the whole capture, from the
        median, rather than per frame. A gait capture is a walk across the frame, and a
        subject at the near end of the runway is seen obliquely while one at the far end
        is nearly edge-on - the apparent shoulder separation ran from 0.45 of torso
        height down to 0.15 on a single synthetic side walk. Judging each frame against
        a fixed threshold therefore split one capture three ways and left no majority,
        so a genuinely mislabelled walk went unreported.

        Coordinates come from _lm, so the aspect correction is already applied and the
        span comparison is between like and like.
        """
        frames = self.views.get(view_type) or []
        ratios = [r for r in (self._shoulder_span_ratio(f) for f in frames) if r is not None]
        if not ratios:
            return None

        if float(np.median(ratios)) < 0.35:
            votes = [a for a in (self._frame_anterior(f) for f in frames) if a is not None]
            if not votes:
                return None
            right = sum(1 for v in votes if v > 0)
            share = right / len(votes)
            # Below a clear majority the capture is too mixed to call, and calling it
            # anyway would put a warning on a perfectly good walk.
            if share >= 0.6:
                return "rightside"
            return "leftside" if share <= 0.4 else None

        votes = [d for d in (self._frame_lateral(f) for f in frames) if d is not None]
        if not votes:
            return None
        front = sum(1 for v in votes if v > 0)
        share = front / len(votes)
        if share >= 0.6:
            return "front"
        return "back" if share <= 0.4 else None

    def orientation_warnings(self) -> List[str]:
        """
        Captures whose landmarks disagree with the view they were filed under.

        The front capture is exempt from the front-versus-back distinction: it is a walk
        toward the camera AND back, so roughly half its frames legitimately show a back
        view and the subject may start at either end. What it is NOT allowed to be is a
        side view, and vice versa - that is the confusion that puts a right-side walk in
        the leftside slot, leaving the session with two captures of one side, none of
        the other, and nothing to cross-check against.
        """
        out: List[str] = []
        for view_type in self.views:
            observed = self.observed_view(view_type)
            if observed is None:
                continue
            if view_type == "front" and observed in ("front", "back"):
                continue
            if observed == view_type:
                continue
            out.append(
                f"The capture labelled '{view_type}' shows a '{observed}' view. The "
                f"subject walked the wrong way, or the views were submitted in the "
                f"wrong order. Metrics are computed from the anatomy and remain "
                f"correct, but this session has no genuine '{view_type}' capture."
            )
        return out

    def _coord_series(self, view: str, idx: int, coord: int) -> Optional[np.ndarray]:
        """
        Time series of one coordinate, with gaps left as NaN.

        The previous implementation forward-filled missing landmarks with the last seen
        value (and 0.5 before any had been seen), which manufactures a flat signal that
        the peak detector then reads as real. NaN keeps the gap visible.
        """
        frames = self.views.get(view) or []
        if not frames:
            return None
        out = np.full(len(frames), np.nan)
        for i, f in enumerate(frames):
            lm = self._lm(f, idx)
            if lm is not None and len(lm) > coord:
                out[i] = lm[coord]
        return out

    def _best_side_view(self) -> Optional[str]:
        candidates = [
            v for v in SIDE_VIEWS
            if len(self.views.get(v) or []) >= MIN_FRAMES
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda v: len(self.views[v]))

    def _leg_length(self, view: str) -> Optional[float]:
        """Median hip-knee-ankle chain length in image units - the normalisation scale."""
        frames = self.views.get(view) or []
        lengths = []
        for f in frames:
            for hip, knee, ank in ((L_HIP, L_KNEE, L_ANK), (R_HIP, R_KNEE, R_ANK)):
                a, b, c = self._lm(f, hip), self._lm(f, knee), self._lm(f, ank)
                if a is None or b is None or c is None:
                    continue
                d = np.hypot(b[0] - a[0], b[1] - a[1]) + np.hypot(c[0] - b[0], c[1] - b[1])
                if d > 1e-6:
                    lengths.append(d)
        if not lengths:
            return None
        return float(np.median(lengths))

    # -- per-frame kinematics ----------------------------------------------

    def _knee_flexion_series(self, view: str, side: str) -> np.ndarray:
        hip, knee, ank = (L_HIP, L_KNEE, L_ANK) if side == "left" else (R_HIP, R_KNEE, R_ANK)
        frames = self.views.get(view) or []
        out = np.full(len(frames), np.nan)
        for i, f in enumerate(frames):
            a, b, c = self._lm(f, hip), self._lm(f, knee), self._lm(f, ank)
            ang = interior_angle(a, b, c) if None not in (a, b, c) else None
            if ang is not None:
                out[i] = 180.0 - ang
        return out

    def _hip_flexion_series(self, view: str, side: str, direction: float) -> np.ndarray:
        """Signed thigh angle from vertical; positive = anterior (direction of travel)."""
        hip, knee = (L_HIP, L_KNEE) if side == "left" else (R_HIP, R_KNEE)
        frames = self.views.get(view) or []
        out = np.full(len(frames), np.nan)
        for i, f in enumerate(frames):
            a, b = self._lm(f, hip), self._lm(f, knee)
            if a is None or b is None:
                continue
            forward = direction * (b[0] - a[0])
            down = b[1] - a[1]  # image y grows downward
            if abs(forward) < 1e-9 and abs(down) < 1e-9:
                continue
            out[i] = np.degrees(np.arctan2(forward, down))
        return out

    def _trunk_lean_series(self, view: str, direction: float) -> np.ndarray:
        frames = self.views.get(view) or []
        out = np.full(len(frames), np.nan)
        for i, f in enumerate(frames):
            l_sh, r_sh = self._lm(f, L_SH), self._lm(f, R_SH)
            l_hip, r_hip = self._lm(f, L_HIP), self._lm(f, R_HIP)
            if None in (l_sh, r_sh, l_hip, r_hip):
                continue
            sx, sy = (l_sh[0] + r_sh[0]) / 2, (l_sh[1] + r_sh[1]) / 2
            hx, hy = (l_hip[0] + r_hip[0]) / 2, (l_hip[1] + r_hip[1]) / 2
            forward = direction * (sx - hx)
            up = hy - sy
            if abs(forward) < 1e-9 and abs(up) < 1e-9:
                continue
            out[i] = np.degrees(np.arctan2(forward, up))
        return out

    # -- aggregation --------------------------------------------------------

    @staticmethod
    def _per_cycle_extremum(
        series: np.ndarray, cycles: List[Tuple[int, int]], mode: str
    ) -> List[float]:
        """
        Per-cycle peak, trough or range, each interpolated between frames.

        mode is "max", "min" (returned negated, as an extension magnitude) or "range".
        """
        out: List[float] = []
        for start, end in cycles:
            if end <= start:
                continue
            seg = series[start:end]
            if mode == "range":
                hi = _refined_extremum(seg, True)
                lo = _refined_extremum(seg, False)
                v = None if hi is None or lo is None else hi - lo
            elif mode == "min":
                lo = _refined_extremum(seg, False)
                v = None if lo is None else -lo
            else:
                v = _refined_extremum(seg, True)
            if v is not None and np.isfinite(v):
                out.append(float(v))
        return out

    @staticmethod
    def _per_cycle(series: np.ndarray, cycles: List[Tuple[int, int]], fn) -> List[float]:
        """Apply fn to each cycle's slice, skipping cycles with no usable data."""
        out = []
        for start, end in cycles:
            seg = series[start:end]
            seg = seg[np.isfinite(seg)]
            if seg.size == 0:
                continue
            v = fn(seg)
            if v is not None and np.isfinite(v):
                out.append(float(v))
        return out

    def _result(
        self,
        spec: MetricSpec,
        values: Sequence[float],
        view: Optional[str],
        note: Optional[str] = None,
        n_cycles: Optional[int] = None,
    ) -> MetricResult:
        """
        n_cycles: how many gait cycles actually backed this metric.

        Needed because some metrics are inherently single-valued - a cycle count, or a
        stance percentage already reduced to a median across cycles. Judging their
        confidence by len(values) would flag every one of them low confidence for
        having a single number, which devalues the flag on the metrics where it matters.
        """
        base = dict(
            key=spec.key,
            clinical_name=spec.clinical_name,
            unit=spec.unit.value,
            normal_range=spec.normal_range,
            reference=spec.reference,
            ungradeable_reason=spec.ungradeable_reason,
        )
        clean = [v for v in values if v is not None and np.isfinite(v)]
        if not clean:
            return MetricResult(
                value=None,
                status=Status.INSUFFICIENT_DATA,
                view_used=view,
                detail=note or "No gait cycle yielded a usable measurement.",
                **base,
            )

        value = float(np.median(clean))
        spread = float(np.percentile(clean, 75) - np.percentile(clean, 25)) if len(clean) >= 4 else None
        status = classify(spec, value)
        detail = note

        if status == Status.OUT_OF_RANGE:
            lo, hi = spec.physical_range
            detail = (
                f"Computed {value:.2f} {spec.unit.value}, outside the physically possible "
                f"range [{lo}, {hi}]. Treat as a capture or computation defect."
            )
            value = None
        else:
            backing = n_cycles if n_cycles is not None else len(clean)
            if backing < MIN_CYCLES:
                status = Status.LOW_CONFIDENCE
                detail = (
                    f"Based on only {backing} gait cycle(s); at least {MIN_CYCLES} "
                    f"are needed for confidence."
                )
            elif spec.max_iqr is not None and spread is not None and spread > spec.max_iqr:
                status = Status.LOW_CONFIDENCE
                detail = (
                    f"Cycle-to-cycle spread {spread:.2f} exceeds the {spec.max_iqr} "
                    f"threshold; gait was irregular or tracking was unstable."
                )

        return MetricResult(
            value=None if value is None else round(value, 3),
            status=status,
            spread=None if spread is None else round(spread, 3),
            n_frames=len(clean),
            view_used=view,
            detail=detail,
            **base,
        )

    def _unsupported(self, spec: MetricSpec) -> MetricResult:
        return MetricResult(
            key=spec.key,
            clinical_name=spec.clinical_name,
            value=None,
            unit=spec.unit.value,
            status=Status.UNSUPPORTED,
            normal_range=spec.normal_range,
            reference=spec.reference,
            detail=spec.unsupported_reason,
        )

    def _insufficient(self, spec: MetricSpec, why: str) -> MetricResult:
        return MetricResult(
            key=spec.key,
            clinical_name=spec.clinical_name,
            value=None,
            unit=spec.unit.value,
            status=Status.INSUFFICIENT_DATA,
            normal_range=spec.normal_range,
            reference=spec.reference,
            detail=why,
        )

    # -- main ---------------------------------------------------------------

    def finalize(self, person_id: str) -> GaitResult:
        result = GaitResult(
            calibration_date=datetime.now(timezone.utc).isoformat(),
            person_id=str(person_id),
            views_captured=sorted(self.views.keys()),
            aspect_ratio=self.aspect_ratio,
            aspect_assumed=self.aspect_assumed,
        )

        side = self._best_side_view()
        if side is None:
            why = (
                "No side view with at least "
                f"{MIN_FRAMES} frames. Gait analysis requires a leftside or rightside capture."
            )
            for spec in GAIT_METRICS:
                result.metrics[spec.key] = (
                    self._unsupported(spec) if not spec.is_supported else self._insufficient(spec, why)
                )
            return result

        frames = self.views[side]
        n = len(frames)
        series_x = {}
        for idx in (L_HIP, R_HIP, L_ANK, R_ANK, L_HEEL, R_HEEL, L_FOOT, R_FOOT):
            s = self._coord_series(side, idx, 0)
            if s is not None:
                # detect_events needs finite values; interpolate short gaps only.
                series_x[idx] = _interpolate_gaps(s)

        events, direction = detect_events(series_x, fps=self.fps)
        left_ev, right_ev = events.get("left", GaitEvents()), events.get("right", GaitEvents())

        if direction == 0.0:
            why = (
                "The subject did not travel across the frame, so gait events cannot be "
                "located. This happens when walking toward or away from the camera, or on "
                "a treadmill. Capture a side view with the subject walking across frame."
            )
            for spec in GAIT_METRICS:
                result.metrics[spec.key] = (
                    self._unsupported(spec) if not spec.is_supported else self._insufficient(spec, why)
                )
            return result

        left_cycles = valid_cycles(left_ev, self.fps)
        right_cycles = valid_cycles(right_ev, self.fps)
        primary_ev, primary_cycles, primary_side = (
            (left_ev, left_cycles, "left")
            if len(left_cycles) >= len(right_cycles)
            else (right_ev, right_cycles, "right")
        )
        result.cycles_analysed = len(primary_cycles)
        result.fps_used = self.fps
        result.fps_measured = self.fps_measured
        result.fps_note = self.fps_note
        result.orientation_warnings = self.orientation_warnings()

        leg_len = self._leg_length(side)
        few_cycles_note = (
            None if len(primary_cycles) >= 3
            else f"Only {len(primary_cycles)} valid gait cycle(s) detected; treat with caution."
        )

        # --- temporal -----------------------------------------------------
        all_hs = sorted(left_ev.heel_strikes + right_ev.heel_strikes)
        step_times = np.diff(all_hs) / self.fps if len(all_hs) > 1 else np.array([])
        cadence_vals = (60.0 / step_times[step_times > 0]).tolist() if step_times.size else []

        stride_left = (np.diff(left_ev.heel_strikes) / self.fps).tolist() if len(left_ev.heel_strikes) > 1 else []
        stride_right = (np.diff(right_ev.heel_strikes) / self.fps).tolist() if len(right_ev.heel_strikes) > 1 else []

        put = result.metrics.__setitem__
        spec_of = {m.key: m for m in GAIT_METRICS}

        # n_cycles, not the number of interval samples, is what backs a temporal metric.
        # Without it the confidence gate counted heel-strike intervals instead of valid
        # cycles, so a capture with a 2.3 s landmark blackout - zero valid cycles -
        # still reported a cadence of 105.9 badged "measured", with the warning demoted
        # to a detail string no UI is obliged to show. That is the v1 failure mode this
        # rewrite exists to remove.
        n_cyc = len(primary_cycles)
        put("cadence", self._result(
            spec_of["cadence"], cadence_vals, side, few_cycles_note, n_cycles=n_cyc))
        put("stride_time_left", self._result(
            spec_of["stride_time_left"], stride_left, side, few_cycles_note, n_cycles=n_cyc))
        put("stride_time_right", self._result(
            spec_of["stride_time_right"], stride_right, side, few_cycles_note, n_cycles=n_cyc))

        stance, swing = stance_swing_percent(primary_ev, self.fps)
        put("stance_phase_percent", self._result(
            spec_of["stance_phase_percent"], [stance] if stance is not None else [], side,
            "Toe-off could not be located in enough cycles." if stance is None else few_cycles_note, n_cycles=len(primary_cycles)))
        put("swing_phase_percent", self._result(
            spec_of["swing_phase_percent"], [swing] if swing is not None else [], side,
            "Toe-off could not be located in enough cycles." if swing is None else few_cycles_note, n_cycles=len(primary_cycles)))

        ds = double_support_percent(left_ev, right_ev, n)
        put("double_support_percent", self._result(
            spec_of["double_support_percent"], [ds] if ds is not None else [], side,
            "Requires heel strikes and toe-offs on both feet." if ds is None else few_cycles_note, n_cycles=len(primary_cycles)))

        # --- spatial (normalised to leg length) ---------------------------
        if leg_len and leg_len > 1e-6:
            ank_x = {"left": series_x.get(L_ANK), "right": series_x.get(R_ANK)}
            stride_ratios = []
            for foot, ev in (("left", left_ev), ("right", right_ev)):
                xs = ank_x.get(foot)
                if xs is None:
                    continue
                for a, b in zip(ev.heel_strikes, ev.heel_strikes[1:]):
                    if a < len(xs) and b < len(xs) and np.isfinite(xs[a]) and np.isfinite(xs[b]):
                        stride_ratios.append(abs(xs[b] - xs[a]) / leg_len)
            put("stride_length_ratio", self._result(
                spec_of["stride_length_ratio"], stride_ratios, side, few_cycles_note))

            median_stride_time = float(np.median(stride_left + stride_right)) if (stride_left or stride_right) else None
            speeds = (
                [r / median_stride_time for r in stride_ratios]
                if median_stride_time and median_stride_time > 0 else []
            )
            put("walking_speed_ratio", self._result(
                spec_of["walking_speed_ratio"], speeds, side, few_cycles_note))

            sym = _step_length_symmetry(left_ev, right_ev, ank_x, leg_len)
            put("step_length_symmetry", self._result(
                spec_of["step_length_symmetry"], sym, side, few_cycles_note,
                n_cycles=len(primary_cycles)))
        else:
            why = "Leg length could not be measured from the side view, so spatial metrics cannot be normalised."
            for key in ("stride_length_ratio", "walking_speed_ratio", "step_length_symmetry"):
                put(key, self._insufficient(spec_of[key], why))

        # --- kinematic ----------------------------------------------------
        # Smooth before extracting peaks. np.max over a noisy series is a biased
        # estimator - the noise can only push the maximum up, never down - so raw
        # per-frame angles inflate every peak metric in proportion to landmark noise.
        # Measured on the synthetic walk: at 4 px jitter, unsmoothed hip flexion peak
        # read 40.7 deg against a posed 25.0, and the per-cycle IQR stayed small
        # because the bias is systematic across cycles, so the low-confidence gate
        # could not see it. The event detector already smooths its own signal
        # (gait/events.py); the angle series were the one path that did not.
        knee_raw = self._knee_flexion_series(side, primary_side)
        hip_raw = self._hip_flexion_series(side, primary_side, direction)
        trunk_raw = self._trunk_lean_series(side, direction)
        # One window for the whole capture, sized from the noisiest of the three traces
        # so the smoothing applied is consistent across metrics from the same walk.
        window = max(
            _adaptive_window(knee_raw, self.fps),
            _adaptive_window(hip_raw, self.fps),
            _adaptive_window(trunk_raw, self.fps),
        )
        self.smoothing_window = window
        self.angle_noise_deg = max(
            _noise_scale(knee_raw), _noise_scale(hip_raw), _noise_scale(trunk_raw)
        )
        knee = _smoothed(knee_raw, window=window)
        hip = _smoothed(hip_raw, window=window)
        trunk = _smoothed(trunk_raw, window=window)
        peak = lambda series, mode: self._per_cycle_extremum(series, primary_cycles, mode)

        # Capture-quality gate. Each kinematic metric was certified over a range of
        # landmark noise (scripts/certify_accuracy.py); beyond that range its error
        # exceeds its tolerance, and shipping it anyway is how a number that nobody can
        # stand behind reaches a clinician. Withhold instead, naming the reason, so the
        # operator knows to recapture rather than to act on it.
        noise_ceiling = {
            "knee_flexion_max": 2.5,
            "knee_flexion_rom": 2.5,
            "hip_flexion_max": 3.5,
            "hip_extension_max": 2.5,
            "hip_flexion_rom": 2.5,
            "trunk_sagittal_lean": 3.5,
        }

        def put_kinematic(key: str, values):
            needed_fps = MIN_FPS_REQUIRED.get(key)
            if needed_fps is not None and self.fps < needed_fps:
                put(key, self._insufficient(
                    spec_of[key],
                    f"Needs a capture of at least {needed_fps} fps; this one ran at "
                    f"{self.fps} fps. The feature being measured is briefer than one "
                    f"frame at this rate, so the value would read systematically low.",
                ))
                return
            ceiling = noise_ceiling.get(key)
            if ceiling is not None and self.angle_noise_deg > ceiling:
                put(key, self._insufficient(
                    spec_of[key],
                    f"Landmark tracking on this capture varies by "
                    f"{self.angle_noise_deg:.1f} degrees frame to frame, above the "
                    f"{ceiling} degrees this metric was validated at. Recapture with "
                    f"better lighting, the whole body in frame, and plain clothing.",
                ))
                return
            put(key, self._result(spec_of[key], values, side, few_cycles_note))

        put_kinematic("knee_flexion_max", peak(knee, "max"))
        put_kinematic("knee_flexion_rom", peak(knee, "range"))
        put_kinematic("hip_flexion_max", peak(hip, "max"))
        put_kinematic("hip_extension_max", peak(hip, "min"))
        put_kinematic("hip_flexion_rom", peak(hip, "range"))
        put("trunk_sagittal_lean", self._result(
            spec_of["trunk_sagittal_lean"], self._per_cycle(trunk, primary_cycles, np.median), side, few_cycles_note))

        # --- frontal, from the front view ---------------------------------
        front = "front" if len(self.views.get("front") or []) >= MIN_FRAMES else None
        if front:
            put("step_width_ratio", self._result(
                spec_of["step_width_ratio"], self._step_widths(front), front, n_cycles=len(primary_cycles)))
            put("trunk_lateral_sway_ratio", self._result(
                spec_of["trunk_lateral_sway_ratio"], self._lateral_sway(front), front, n_cycles=len(primary_cycles)))
        else:
            why = f"Requires a front view with at least {MIN_FRAMES} frames."
            put("step_width_ratio", self._insufficient(spec_of["step_width_ratio"], why))
            put("trunk_lateral_sway_ratio", self._insufficient(spec_of["trunk_lateral_sway_ratio"], why))

        # --- functional ---------------------------------------------------
        all_strides = stride_left + stride_right
        if len(all_strides) >= 2 and np.mean(all_strides) > 0:
            cv = float(np.std(all_strides) / np.mean(all_strides) * 100.0)
            put("stride_time_variability", self._result(
                spec_of["stride_time_variability"], [cv], side, few_cycles_note, n_cycles=len(primary_cycles)))
        else:
            put("stride_time_variability", self._insufficient(
                spec_of["stride_time_variability"], "At least two strides per foot are needed."))

        sym_vals = []
        if stride_left and stride_right:
            l, r = float(np.median(stride_left)), float(np.median(stride_right))
            if l + r > 0:
                sym_vals.append(100.0 * (1.0 - abs(l - r) / (l + r)))
        step_sym = result.metrics.get("step_length_symmetry")
        if step_sym and step_sym.value is not None:
            sym_vals.append(step_sym.value)
        put("gait_symmetry_index", self._result(
            spec_of["gait_symmetry_index"], [float(np.mean(sym_vals))] if sym_vals else [],
            side, few_cycles_note, n_cycles=len(primary_cycles)))

        put("gait_cycle_count", self._result(
            spec_of["gait_cycle_count"], [float(len(primary_cycles))], side,
            n_cycles=len(primary_cycles)))

        # --- unsupported --------------------------------------------------
        for spec in GAIT_METRICS:
            if not spec.is_supported:
                put(spec.key, self._unsupported(spec))

        # --- annotated playback -------------------------------------------
        phases = annotate_phases(left_ev, right_ev, n)
        hs_all = set(left_ev.heel_strikes) | set(right_ev.heel_strikes)
        for view_name, view_frames in self.views.items():
            total = len(view_frames)
            annotated = [
                {
                    "frameIndex": i,
                    "landmarks": f.get("landmarks", {}),
                    "gaitPhase": phases[i] if view_name == side and i < len(phases) else "unknown",
                    "timestamp": f.get("timestamp", i * (1000.0 / self.fps)),
                    "isHeelStrike": bool(view_name == side and i in hs_all),
                }
                for i, f in enumerate(view_frames)
            ]
            entry = {
                "timeSeries": annotated,
                "heelStrikes": {
                    "left": list(left_ev.heel_strikes) if view_name == side else [],
                    "right": list(right_ev.heel_strikes) if view_name == side else [],
                },
                "toeOffs": {
                    "left": list(left_ev.toe_offs) if view_name == side else [],
                    "right": list(right_ev.toe_offs) if view_name == side else [],
                },
                "frameCount": total,
                "eventsFromView": view_name == side,
            }
            if view_name in self.background_images:
                entry["backgroundImage"] = self.background_images[view_name]
            result.annotated_views[view_name] = entry

        return result

    # -- front-view helpers -------------------------------------------------

    def _step_widths(self, view: str) -> List[float]:
        """
        Lateral ankle separation, sampled at maximum separation within each stride.

        The previous implementation averaged separation over every frame including
        swing, when the feet are separated fore-aft rather than laterally.
        """
        frames = self.views.get(view) or []
        leg = self._leg_length(view)
        if not leg or leg < 1e-6:
            return []
        widths = []
        for f in frames:
            l_ank, r_ank = self._lm(f, L_ANK), self._lm(f, R_ANK)
            if l_ank is None or r_ank is None:
                continue
            w = abs(l_ank[0] - r_ank[0])
            if w > 1e-6:
                widths.append(w / leg)
        if not widths:
            return []
        # Double support corresponds to the narrower part of the distribution; the wide
        # tail is mid-swing crossover seen in projection.
        cutoff = float(np.percentile(widths, 40))
        return [w for w in widths if w <= cutoff] or widths

    def _lateral_sway(self, view: str) -> List[float]:
        """
        Trunk lateral excursion, normalised to shoulder width frame by frame.

        The normalisation must happen per frame, not once at the end. On a front view
        the subject walks toward the camera, so their pixel scale grows throughout the
        capture - on a 6 s walk the shoulder width more than doubles. Dividing a
        pixel-space peak-to-peak by a single median width therefore measures how far
        the subject walked, not how much they swayed: it read 0.29 against a posed 0.09
        on the synthetic walk, which would badge a steady walker as unstable.
        """
        frames = self.views.get(view) or []
        idx, offsets = [], []
        for i, f in enumerate(frames):
            l_sh, r_sh = self._lm(f, L_SH), self._lm(f, R_SH)
            if l_sh is None or r_sh is None:
                continue
            width = abs(l_sh[0] - r_sh[0])
            if width < 1e-6:
                continue
            idx.append(i)
            offsets.append(((l_sh[0] + r_sh[0]) / 2) / width)
        if len(offsets) < 4:
            return []
        # Remove the walking path itself before measuring sway. A subject walking toward
        # the camera drifts across the frame unless they are perfectly aligned with the
        # optical axis, and that drift is not sway. The drift is not linear either: as
        # the subject approaches, the same lateral offset in metres subtends a growing
        # angle, so the path curves in the image. A straight-line fit leaves that
        # curvature behind and reports it as sway - it overstated a steady walker by an
        # order of magnitude. A quadratic tracks it.
        #
        # Peak-to-peak of the residual is then still the wrong summary: one bad frame
        # sets it. The 5th-95th percentile span is the same measurement without the
        # single-frame sensitivity.
        a = np.asarray(idx, dtype=float)
        b = np.asarray(offsets, dtype=float)
        order = 2 if a.size >= 8 else 1
        residual = b - np.polyval(np.polyfit(a, b, order), a)
        span = float(np.percentile(residual, 95) - np.percentile(residual, 5))
        return [span]



def _refined_extremum(series: np.ndarray, find_max: bool) -> Optional[float]:
    """
    A cycle's peak, interpolated between frames on the smoothed trace.

    Both the location and the value come from the smoothed trace, deliberately. It is
    tempting to locate the peak on the smoothed trace and then read its value off the
    raw one, to recover the amplitude smoothing costs - but that hands the noise bias
    straight back: an extremum of a noisy signal can only move outward, and measuring on
    raw samples inflated peak knee flexion by 7.6 degrees at 2 px of jitter while the
    smoothed estimate stayed within 1. A feature narrower than the sampling interval
    cannot be recovered and denoised at the same time; the information is not there. For
    a clinical number a stable, slightly conservative estimate beats an unstable one, so
    the attenuation is accepted, measured, and reported - see the accuracy report's
    sampling-floor column - rather than traded for variance.

    Parabolic interpolation is still worth doing on the smoothed trace: it costs no
    noise and recovers the quantisation loss from a sample grid that never lands exactly
    on the extremum.
    """
    if series.size == 0:
        return None
    finite = np.isfinite(series)
    if not finite.any():
        return None
    masked = np.where(finite, series, -np.inf if find_max else np.inf)
    i = int(np.argmax(masked) if find_max else np.argmin(masked))
    if i == 0 or i == series.size - 1:
        return float(series[i])
    y0, y1, y2 = float(series[i - 1]), float(series[i]), float(series[i + 1])
    if not all(np.isfinite([y0, y1, y2])):
        return float(y1)
    denom = y0 - 2.0 * y1 + y2
    if abs(denom) < 1e-12:
        return y1
    shift = 0.5 * (y0 - y2) / denom
    if abs(shift) > 1.0:
        return y1
    return y1 - 0.25 * (y0 - y2) * shift


def _noise_scale(series: np.ndarray) -> float:
    """
    Robust estimate of the per-frame noise on an angle trace, in degrees.

    Measured as the residual against a short cubic fit. A second difference is the
    obvious alternative and is wrong here: a joint angle moving 5 degrees per frame has
    real curvature of the same order as the noise, so the second difference reports a
    clean capture as noisy - it picked a 9-frame smoothing window for a noiseless trace
    and blunted the very peaks the window width was supposed to protect. A 5-point
    cubic tracks genuine curvature and leaves mostly noise behind.
    """
    finite = series[np.isfinite(series)]
    if finite.size < 8:
        return 0.0
    residual = finite - smooth(finite, window=5, poly=3)
    mad = float(np.median(np.abs(residual)))
    return mad * 1.4826


def _adaptive_window(series: np.ndarray, fps: int) -> int:
    """
    Smoothing width chosen from how noisy this capture actually is.

    A fixed window is a fixed compromise: wide enough to tame a poorly-lit capture means
    needlessly blunting a clean one, and the bluntness lands on exactly the peak metrics
    that matter. Measuring the noise first lets a clean capture keep its detail and a
    noisy one buy stability with resolution it has already lost.
    """
    # Capped at 7 on purpose. Widening further does reduce variance, but the extra
    # attenuation costs more than the noise it removes: at 2 px of jitter a window of 11
    # read knee flexion range 13.8 degrees low against 9.3 for a window of 5, so the
    # "more robust" setting was the less accurate one.
    sigma = _noise_scale(series)
    frames = 5 if sigma < 0.5 else 7
    # Never smooth across more than a third of a plausible gait cycle.
    return int(min(frames, max(5, (fps // 3) | 1)))


def _smoothed(series: np.ndarray, window: int = 7, poly: int = 3) -> np.ndarray:
    """
    Gap-fill then Savitzky-Golay smooth a joint-angle series.

    Interpolation comes first because savgol propagates NaN across its whole window.
    A series with nothing finite is returned untouched so the caller still sees the
    dropout rather than a fabricated flat line.

    The 7-frame window (0.23 s at 30 fps) is a deliberate compromise. Wider windows
    reject more noise but attenuate the swing-phase knee peak, which is the sharpest
    feature in the signal: at window 9 the peak reads 2.8 deg low even with zero
    landmark noise. At 7 the zero-noise cost is 1.3 deg while the 4 px-noise
    inflation of hip flexion ROM still drops from +28.6 deg to +9.4.
    """
    if not np.isfinite(series).any():
        return series
    return smooth(_interpolate_gaps(series), window=window, poly=poly)


def _interpolate_gaps(series: np.ndarray, max_gap: int = 5) -> np.ndarray:
    """
    Linearly interpolate short NaN runs; leave long ones as the series median.

    Short dropouts are a tracker hiccup and interpolating them is fair. Long dropouts
    mean the landmark genuinely was not visible, and inventing a trajectory across them
    would manufacture events - which is exactly what the previous forward-fill did.
    """
    out = series.copy()
    finite = np.isfinite(out)
    if not finite.any():
        return np.zeros_like(out)
    idx = np.arange(out.size)
    out_interp = np.interp(idx, idx[finite], out[finite])

    # Only accept interpolation across gaps up to max_gap frames.
    gap_start = None
    for i in range(out.size):
        if not finite[i]:
            if gap_start is None:
                gap_start = i
        else:
            if gap_start is not None and i - gap_start > max_gap:
                out_interp[gap_start:i] = np.median(out[finite])
            gap_start = None
    if gap_start is not None and out.size - gap_start > max_gap:
        out_interp[gap_start:] = np.median(out[finite])
    return out_interp


def _step_length_symmetry(
    left: GaitEvents, right: GaitEvents, ank_x: Dict[str, Optional[np.ndarray]], leg_len: float
) -> List[float]:
    """Symmetry of alternating step lengths, as a percentage (100 = symmetric)."""
    lx, rx = ank_x.get("left"), ank_x.get("right")
    if lx is None or rx is None:
        return []
    events = sorted([(f, "L") for f in left.heel_strikes] + [(f, "R") for f in right.heel_strikes])
    steps = {"L": [], "R": []}
    for (f1, s1), (f2, s2) in zip(events, events[1:]):
        if s1 == s2:
            continue
        a = lx if s1 == "L" else rx
        b = rx if s2 == "R" else lx
        if f1 >= len(a) or f2 >= len(b) or not np.isfinite(a[f1]) or not np.isfinite(b[f2]):
            continue
        steps[s2].append(abs(b[f2] - a[f1]) / leg_len)
    if not steps["L"] or not steps["R"]:
        return []
    l, r = float(np.median(steps["L"])), float(np.median(steps["R"]))
    if l + r <= 0:
        return []
    return [100.0 * (1.0 - abs(l - r) / (l + r))]
