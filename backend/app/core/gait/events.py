"""
Gait event detection.

Replaces the ankle-Y-maximum heuristic in cycle_detector.py, which assumed the ankle
sits at its lowest image position at heel contact. It does not: the ankle is lowest
around foot-flat, and the ankle-Y trace has a second minimum near toe-off, so the old
peak finder reported roughly twice as many heel strikes as actually occurred. Measured
against a synthetic 6-second walk with 5 true left heel strikes, it found 10, drove
cadence onto its 200 steps/min clamp, and halved peak knee flexion.

This module uses the coordinate-based method of Zeni et al. (2008), Gait & Posture
27(4):710-714: heel strike is the local maximum of the heel's position relative to the
pelvis along the direction of progression, and toe-off is the local minimum of the
toe's relative position. Working relative to the pelvis makes the detector invariant to
the subject translating across the frame, which is what breaks absolute-coordinate
methods when the camera is static.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

try:
    from scipy.signal import find_peaks, savgol_filter
    SCIPY_AVAILABLE = True
except ImportError:  # pragma: no cover - scipy is a hard requirement in production
    SCIPY_AVAILABLE = False


L_HIP, R_HIP = 23, 24
L_HEEL, R_HEEL = 29, 30
L_FOOT, R_FOOT = 31, 32
L_ANKLE, R_ANKLE = 27, 28


@dataclass
class GaitEvents:
    """Detected events for one foot, in frame indices."""

    heel_strikes: List[int] = field(default_factory=list)
    toe_offs: List[int] = field(default_factory=list)

    def cycles(self) -> List[Tuple[int, int]]:
        """Consecutive same-foot heel strikes bound one gait cycle."""
        return [
            (self.heel_strikes[i], self.heel_strikes[i + 1])
            for i in range(len(self.heel_strikes) - 1)
        ]


def smooth(signal: Sequence[float], window: int = 9, poly: int = 3) -> np.ndarray:
    """Savitzky-Golay smoothing that degrades to a moving average without scipy."""
    arr = np.asarray(signal, dtype=float)
    if arr.size == 0:
        return arr
    if not SCIPY_AVAILABLE or arr.size < poly + 2:
        k = max(1, min(5, arr.size))
        return np.convolve(arr, np.ones(k) / k, mode="same")

    wl = min(window, arr.size)
    if wl % 2 == 0:
        wl -= 1
    if wl < poly + 2:
        return arr
    return savgol_filter(arr, window_length=wl, polyorder=poly)


def progression_axis(hip_x: np.ndarray) -> float:
    """
    Direction the subject is travelling, as +1 or -1 along the image x axis.

    Returns 0.0 when the subject barely translates - walking toward or away from the
    camera, or on a treadmill. In that case relative-coordinate event detection is not
    valid and the caller must report insufficient data rather than guess.
    """
    if hip_x.size < 2:
        return 0.0
    drift = float(hip_x[-1] - hip_x[0])
    span = float(np.ptp(hip_x))
    # Require the net drift to dominate the wobble, otherwise there is no clear
    # direction of progression.
    if span < 1e-6 or abs(drift) < 0.5 * span:
        return 0.0
    return 1.0 if drift > 0 else -1.0


def _relative_trace(
    series: Dict[int, np.ndarray], distal_idx: int, direction: float
) -> Optional[np.ndarray]:
    """Distal landmark position relative to the pelvis, along the progression axis."""
    if distal_idx not in series or L_HIP not in series or R_HIP not in series:
        return None
    sacrum = (series[L_HIP] + series[R_HIP]) / 2.0
    return smooth((series[distal_idx] - sacrum) * direction)


def _extrema(trace: np.ndarray, fps: int, find_maxima: bool) -> List[int]:
    """Local extrema separated by at least half a plausible step."""
    signal = trace if find_maxima else -trace
    min_distance = max(int(fps * 0.25), 3)  # 240 steps/min ceiling
    if not SCIPY_AVAILABLE:
        return [
            i for i in range(1, len(signal) - 1)
            if signal[i] > signal[i - 1] and signal[i] >= signal[i + 1]
        ]
    prominence = max(float(np.std(signal)) * 0.25, 1e-4)
    peaks, _ = find_peaks(signal, distance=min_distance, prominence=prominence)
    return [int(p) for p in peaks]


def detect_events(
    series: Dict[int, np.ndarray], fps: int = 30, direction: Optional[float] = None
) -> Tuple[Dict[str, GaitEvents], float]:
    """
    Detect heel strikes and toe-offs for both feet.

    `series` maps landmark index -> that landmark's x-coordinate time series.
    Returns (events_by_foot, direction). A direction of 0.0 means the subject did not
    translate enough for this method to apply.
    """
    if L_HIP not in series or R_HIP not in series:
        return {"left": GaitEvents(), "right": GaitEvents()}, 0.0

    if direction is None:
        sacrum_x = (series[L_HIP] + series[R_HIP]) / 2.0
        direction = progression_axis(sacrum_x)
    if direction == 0.0:
        return {"left": GaitEvents(), "right": GaitEvents()}, 0.0

    out: Dict[str, GaitEvents] = {}
    for foot, heel_idx, toe_idx in (("left", L_HEEL, L_FOOT), ("right", R_HEEL, R_FOOT)):
        heel_trace = _relative_trace(series, heel_idx, direction)
        toe_trace = _relative_trace(series, toe_idx, direction)
        events = GaitEvents()
        if heel_trace is not None:
            events.heel_strikes = _extrema(heel_trace, fps, find_maxima=True)
        if toe_trace is not None:
            events.toe_offs = _extrema(toe_trace, fps, find_maxima=False)
        out[foot] = events
    return out, direction


def stance_swing_percent(
    events: GaitEvents, fps: int
) -> Tuple[Optional[float], Optional[float]]:
    """
    Stance and swing as a percentage of the gait cycle, derived from real toe-off.

    The previous implementation computed mean_step_time / mean_stride_time, which is
    ~50% by construction for any symmetric gait, then clamped the result to [50, 70] -
    so the reported value carried no information about the subject. Here stance is the
    measured interval from heel strike to the next ipsilateral toe-off.
    """
    cycles = events.cycles()
    if not cycles or not events.toe_offs:
        return None, None

    fractions = []
    for start, end in cycles:
        cycle_len = end - start
        if cycle_len <= 0:
            continue
        following = [t for t in events.toe_offs if start < t < end]
        if not following:
            continue
        fractions.append((following[0] - start) / cycle_len * 100.0)

    if not fractions:
        return None, None
    stance = float(np.median(fractions))
    if not (35.0 <= stance <= 85.0):  # physically implausible => treat as undetected
        return None, None
    return stance, 100.0 - stance


def double_support_percent(
    left: GaitEvents, right: GaitEvents, total_frames: int
) -> Optional[float]:
    """
    Percentage of the cycle with both feet on the ground, measured rather than assumed.

    The previous implementation returned mean_step_time * 0.2 clamped to [0.05, 0.25],
    which was an invention with no basis in the captured data.
    """
    if not left.heel_strikes or not right.heel_strikes:
        return None
    if not left.toe_offs or not right.toe_offs:
        return None

    def in_stance(events: GaitEvents) -> np.ndarray:
        mask = np.zeros(total_frames, dtype=bool)
        for hs in events.heel_strikes:
            later = [t for t in events.toe_offs if t > hs]
            if not later:
                continue
            mask[hs:min(later[0], total_frames)] = True
        return mask

    both = in_stance(left) & in_stance(right)
    covered = in_stance(left) | in_stance(right)
    if covered.sum() == 0:
        return None
    return float(both.sum() / covered.sum() * 100.0)


def annotate_phases(
    left: GaitEvents, right: GaitEvents, total_frames: int
) -> List[str]:
    """
    Per-frame gait phase for the skeleton playback overlay.

    The previous implementation documented four phases but only ever emitted
    stance_left, stance_right and unknown - it had no concept of toe-off, so swing and
    double support were never assigned despite being in its own docstring.
    """
    def stance_mask(events: GaitEvents) -> np.ndarray:
        mask = np.zeros(total_frames, dtype=bool)
        for hs in events.heel_strikes:
            later = [t for t in events.toe_offs if t > hs]
            end = later[0] if later else total_frames
            mask[hs:min(end, total_frames)] = True
        return mask

    l_stance = stance_mask(left)
    r_stance = stance_mask(right)

    phases: List[str] = []
    for i in range(total_frames):
        if l_stance[i] and r_stance[i]:
            phases.append("double_support")
        elif l_stance[i]:
            phases.append("stance_left")
        elif r_stance[i]:
            phases.append("stance_right")
        elif left.heel_strikes or right.heel_strikes:
            phases.append("swing")
        else:
            phases.append("unknown")
    return phases


def valid_cycles(events: GaitEvents, fps: int, max_cv: float = 0.35) -> List[Tuple[int, int]]:
    """
    Gait cycles of plausible and self-consistent duration.

    Cycles far from the subject's own median duration are dropped as detection errors.
    Unlike the previous implementation this does NOT unconditionally discard the first
    and last cycle - with a 5-second capture that threw away a third of the usable data.
    """
    cycles = events.cycles()
    if not cycles:
        return []
    durations = np.array([e - s for s, e in cycles], dtype=float)
    median = float(np.median(durations))
    if median <= 0:
        return []
    # Physiological bounds: 0.6 s to 2.5 s per stride.
    lo, hi = 0.6 * fps, 2.5 * fps
    keep = [
        (int(s), int(e))
        for (s, e), d in zip(cycles, durations)
        if lo <= d <= hi and abs(d - median) / median <= max_cv
    ]
    return keep
