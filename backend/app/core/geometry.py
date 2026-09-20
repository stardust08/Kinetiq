"""
Shared geometric primitives for clinical metric computation.

Both the posture and gait calibrators previously carried their own private copies of
these helpers, and both copies had the same sign defect: `angle_vs_vertical` compared
against the *downward* image axis, so an upright trunk measured ~180 degrees rather
than ~0, and a forward lean was indistinguishable from a backward lean of the same
magnitude.

Everything here is defined against an explicit, documented sign convention and is
covered by the synthetic harness in app/core/validation.

Coordinate conventions
----------------------
Image / pixel space : x grows right, y grows DOWN (OpenCV and MediaPipe convention).
World space         : x grows right, y grows UP, z grows anterior (MediaPipe world
                      landmarks, metres, origin at mid-hip).

Functions taking `y_down` let the caller state which space the points are in, so a
single implementation serves both without a hidden assumption.
"""

from __future__ import annotations

from typing import Optional, Sequence

import numpy as np

EPSILON = 1e-9


def _xy(p: Sequence[float]) -> np.ndarray:
    return np.asarray(p[:2], dtype=float)


def _xyz(p: Sequence[float]) -> np.ndarray:
    arr = np.asarray(p[:3], dtype=float)
    if arr.shape[0] < 3:
        arr = np.append(arr, 0.0)
    return arr


def interior_angle(a, b, c, use_3d: bool = False) -> Optional[float]:
    """
    Unsigned interior angle at vertex b formed by a-b-c, in degrees, range [0, 180].

    This one is genuinely unsigned and that is correct: a hip-knee-ankle angle of
    150 degrees means the same thing whichever way you traverse it. Used for joint
    angles where 180 = fully extended.
    """
    if a is None or b is None or c is None:
        return None
    f = _xyz if use_3d else _xy
    ba, bc = f(a) - f(b), f(c) - f(b)
    denom = np.linalg.norm(ba) * np.linalg.norm(bc)
    if denom < EPSILON:
        return None
    cosine = np.clip(np.dot(ba, bc) / denom, -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


def signed_angle_from_vertical(a, b, y_down: bool = True) -> Optional[float]:
    """
    Signed angle of the vector a->b away from the upward vertical, in degrees.

    Returns 0 when b is directly above a, positive when b leans toward +x, negative
    when b leans toward -x. Range (-180, 180].

    This replaces the previous `_angle_vs_vertical`, which used arccos against the
    downward axis and therefore returned ~180 for an upright segment and lost the
    direction of lean entirely. Callers pass a=proximal, b=distal for a segment
    whose neutral state points up (hip->shoulder), so an upright trunk gives 0.

    y_down=True for pixel/normalised image coordinates, False for world coordinates.
    """
    if a is None or b is None:
        return None
    v = _xy(b) - _xy(a)
    if np.linalg.norm(v) < EPSILON:
        return None
    dx = v[0]
    # Component along "up". In image space up is -y; in world space up is +y.
    dy_up = -v[1] if y_down else v[1]
    return float(np.degrees(np.arctan2(dx, dy_up)))


def signed_angle_from_horizontal(a, b, y_down: bool = True) -> Optional[float]:
    """
    Signed angle of the vector a->b away from the horizontal, in degrees.

    Returns 0 when a and b are level, positive when b is higher than a.
    Range (-180, 180]. Used for shoulder and pelvis obliquity, where which side is
    high is clinically meaningful and must not be collapsed to an absolute value.
    """
    if a is None or b is None:
        return None
    v = _xy(b) - _xy(a)
    if np.linalg.norm(v) < EPSILON:
        return None
    dy_up = -v[1] if y_down else v[1]
    return float(np.degrees(np.arctan2(dy_up, v[0])))


def sagittal_segment_angle(a, b, forward_axis: int = 2) -> Optional[float]:
    """
    Signed angle of segment a->b from vertical within the sagittal plane, using
    WORLD coordinates (metres, y up).

    Positive = b lies anterior to a (forward lean / flexion).
    Negative = b lies posterior to a (backward lean / extension).

    Preferred over the projected 2D version for any sagittal measurement, because it
    is not corrupted by the subject standing off-axis to the camera.
    """
    if a is None or b is None:
        return None
    va, vb = _xyz(a), _xyz(b)
    v = vb - va
    if np.linalg.norm(v) < EPSILON:
        return None
    return float(np.degrees(np.arctan2(v[forward_axis], v[1])))


def frontal_segment_angle(a, b) -> Optional[float]:
    """
    Signed angle of segment a->b from vertical within the frontal plane, using WORLD
    coordinates. Positive = b lies toward the subject's RIGHT.

    MediaPipe's world landmarks put the subject's right at NEGATIVE x - a body facing
    the camera with up +y has its right at -x in any right-handed frame - so the sign is
    inverted here rather than at each call site. The docstring previously claimed +x was
    the subject's right, which is the same mirrored assumption that had three frontal
    metrics reporting ~178 degrees on live captures.
    """
    if a is None or b is None:
        return None
    v = _xyz(b) - _xyz(a)
    if np.linalg.norm(v) < EPSILON:
        return None
    return float(np.degrees(np.arctan2(-v[0], v[1])))


def transverse_angle(reference_a, reference_b, segment_a, segment_b) -> Optional[float]:
    """
    Signed angle in the TRANSVERSE (top-down) plane between a body reference axis and a
    segment, in degrees, in WORLD coordinates.

    The transverse plane is the one a single camera cannot see: rotation about the
    vertical axis changes nothing about where a landmark projects vertically, and very
    little about where it projects horizontally. It is the one plane where MediaPipe's
    inferred depth is not merely preferable to the image but the only source of the
    information at all.

    reference_a -> reference_b defines the axis to measure against (typically the
    shoulder or hip line, which fixes the body's own frame). segment_a -> segment_b is
    the segment being measured. Both are flattened onto the horizontal plane first, so
    the caller does not have to care which way is up.

    Positive = the segment is rotated toward the reference axis's +90 degrees side.
    """
    for p in (reference_a, reference_b, segment_a, segment_b):
        if p is None or len(p) < 3:
            return None
    ref = np.array([reference_b[0] - reference_a[0], reference_b[2] - reference_a[2]], dtype=float)
    seg = np.array([segment_b[0] - segment_a[0], segment_b[2] - segment_a[2]], dtype=float)
    if np.linalg.norm(ref) < EPSILON or np.linalg.norm(seg) < EPSILON:
        return None
    ref /= np.linalg.norm(ref)
    seg /= np.linalg.norm(seg)
    # Signed angle from ref to seg within the horizontal plane.
    cross = ref[0] * seg[1] - ref[1] * seg[0]
    dot = float(np.dot(ref, seg))
    return float(np.degrees(np.arctan2(cross, dot)))


def midpoint(a, b):
    """Midpoint of two landmarks, preserving dimensionality."""
    if a is None or b is None:
        return None
    n = min(len(a), len(b))
    return tuple((np.asarray(a[:n], dtype=float) + np.asarray(b[:n], dtype=float)) / 2.0)


def distance(a, b, use_3d: bool = False) -> Optional[float]:
    """Euclidean distance between two landmarks."""
    if a is None or b is None:
        return None
    f = _xyz if use_3d else _xy
    return float(np.linalg.norm(f(a) - f(b)))


def robust_center(values: Sequence[float]) -> Optional[float]:
    """
    Median of a sample of per-frame metric values.

    We deliberately aggregate the *metric*, not the landmarks. Averaging landmark
    positions first and then computing an angle is biased, because angle is a
    nonlinear function and E[f(x)] != f(E[x]); it also destroys the frame-to-frame
    spread that we need in order to report confidence. Median rather than mean so a
    handful of badly-tracked frames cannot drag the result.
    """
    clean = [v for v in values if v is not None and np.isfinite(v)]
    if not clean:
        return None
    return float(np.median(clean))


def robust_spread(values: Sequence[float]) -> Optional[float]:
    """
    Interquartile range of per-frame metric values.

    This is the raw material for the confidence signal: a metric whose per-frame
    values scatter widely across a supposedly static capture was not measured well,
    regardless of how plausible the median looks.
    """
    clean = [v for v in values if v is not None and np.isfinite(v)]
    if len(clean) < 4:
        return None
    q75, q25 = np.percentile(clean, [75, 25])
    return float(q75 - q25)
