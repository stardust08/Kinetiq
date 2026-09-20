"""
Minimal detectable change, measured.

MDC95 is the smallest difference between two screenings of the same person that can be
distinguished from measuring twice. It is 1.96 * sqrt(2) * SEM, where SEM is the
within-subject standard deviation across repeat sessions - so about 95% of the time, a
change smaller than this is the measurement moving, not the patient.

Produced by scripts/repeatability.py: each subject is screened several times with the
camera placement, distance and capture noise re-drawn between sessions and the subject
held fixed, so every bit of the variance is measurement error. Re-run it after any
change to the estimators.

Why this matters more than accuracy for this product: the feature clinicians reach for
is "compare to last visit". A metric accurate to 3 degrees but varying 9 degrees
between sessions cannot support that comparison, and will show every patient improving
or deteriorating at random. Show the MDC beside any visit-to-visit delta, and do not
let a metric marked "single reading only" drive a progress claim at all - its repeat
sessions do not agree well enough to rank a patient against themselves.
"""

from __future__ import annotations

from typing import Dict, Optional

# metric key -> MDC95 in the metric's own unit.
MDC95: Dict[str, float] = {
    "cadence": 2.861,
    "double_support_percent": 2.240,
    "forward_head_ratio": 0.432,  # single reading only
    "gait_cycle_count": 0.358,
    "head_lateral_flexion": 0.916,
    "hip_flexion_max": 2.157,
    "knee_flexion_max": 1.936,
    "knee_varus_valgus": 0.142,  # single reading only
    "left_hip_angle": 2.119,
    "left_knee_angle": 1.923,
    "leg_length_asymmetry_ratio": 0.009,
    "pelvic_obliquity": 1.076,
    "right_hip_angle": 2.094,
    "right_knee_angle": 1.706,
    "shoulder_hip_width_ratio": 0.027,  # single reading only
    "shoulder_obliquity": 0.712,
    "stance_phase_percent": 1.782,
    "step_length_symmetry": 7.976,  # single reading only
    "step_width_ratio": 0.029,
    "stride_length_ratio": 0.031,
    "stride_time_left": 0.023,
    "stride_time_right": 0.020,
    "swing_phase_percent": 1.782,
    "trunk_angle": 0.364,
    "trunk_lateral_shift_ratio": 0.007,
    "trunk_sagittal_lean": 0.341,
    "walking_speed_ratio": 0.030,
}

# Metrics whose repeat sessions do not agree well enough to track change over time.
# Their single readings may still be accurate - check tolerances.py for that - but a
# difference between two of them carries no information.
SINGLE_READING_ONLY = {
    "forward_head_ratio",
    "knee_varus_valgus",
    "shoulder_hip_width_ratio",
    "step_length_symmetry",
}


def mdc95_for(key: str) -> Optional[float]:
    """Smallest change in this metric that is distinguishable from measurement error."""
    return MDC95.get(key)


def tracks_change(key: str) -> bool:
    """Whether a difference between two screenings of this metric means anything."""
    return key in MDC95 and key not in SINGLE_READING_ONLY
