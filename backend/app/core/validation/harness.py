"""
The validation harness: drives the real pipeline with synthetic ground truth.

This is the accuracy oracle. It poses a skeleton at known joint angles, projects it
through a known camera, feeds the result through the *actual production* calibrator,
and reports the error between what the pipeline said and what we posed.

Because the ground truth is exact, any disagreement is a defect in the pipeline -
there is no measurement uncertainty to argue about. That is what makes this
harness able to distinguish a correct metric from an incorrect one, which the
existing `assert result.fhd_pixels >= 0` style tests cannot do.
"""

from __future__ import annotations

import contextlib
import io
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

import numpy as np

from app.core.validation.camera import Camera, emit_pose_samples
from app.core.validation.skeleton import Pose, build_skeleton, ground_truth_angles

# Camera azimuths corresponding to the four capture views the product asks for.
#
# +90 puts the camera on the subject's LEFT, because the medio-lateral axis points to
# the subject's left - see the coordinate note in skeleton.py. These were the other way
# round while the skeleton was built mirrored, which meant a capture labelled
# "rightside" was validated using a view of the subject's left.
VIEW_AZIMUTH = {
    "front": 0.0,
    "leftside": 90.0,
    "rightside": -90.0,
    "back": 180.0,
}


@dataclass
class MetricError:
    """One metric scored against ground truth under one condition."""

    metric: str
    expected: float
    actual: Optional[float]
    view: str
    condition: str

    @property
    def error(self) -> Optional[float]:
        if self.actual is None:
            return None
        return self.actual - self.expected

    @property
    def abs_error(self) -> Optional[float]:
        e = self.error
        return None if e is None else abs(e)


def _quiet(fn: Callable, *args, **kwargs):
    """Run a callable with stdout suppressed - the calibrators are extremely chatty."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        return fn(*args, **kwargs)


def run_posture(
    pose: Pose,
    views: Optional[List[str]] = None,
    n_samples: int = 60,
    jitter_px: float = 0.0,
    camera_kwargs: Optional[Dict] = None,
    calibrator_factory: Optional[Callable] = None,
):
    """
    Run the production posture calibrator on a synthetic pose.

    views: which capture views to feed in. Defaults to all four, which is what the
    product actually collects - and which is precisely the condition that exposes
    the cross-view averaging defect.
    """
    from app.core.pose.calibration import BodyCalibrator

    views = views if views is not None else ["front", "leftside", "rightside", "back"]
    camera_kwargs = camera_kwargs or {}
    points = build_skeleton(pose)

    calibrator = (calibrator_factory or BodyCalibrator)()
    rng = np.random.default_rng(1234)

    for view in views:
        cam = Camera(azimuth_deg=VIEW_AZIMUTH[view], **camera_kwargs)
        samples = emit_pose_samples(
            points, cam, n_samples=n_samples, jitter_px=jitter_px, rng=rng
        )
        for s in samples:
            _quiet(calibrator.add_calibration_sample, s, view=view)

    return _quiet(calibrator.finalize_calibration, person_id="harness")


def score_posture(
    pose: Pose,
    metric_map: Dict[str, str],
    views: Optional[List[str]] = None,
    condition: str = "",
    **kwargs,
) -> List[MetricError]:
    """
    Score selected posture metrics against ground truth.

    metric_map maps a BodyCalibration attribute name -> a ground_truth_angles key.
    """
    truth = ground_truth_angles(pose)
    result = run_posture(pose, views=views, **kwargs)
    view_label = "+".join(views) if views else "all4"

    errors = []
    for attr, truth_key in metric_map.items():
        actual = getattr(result, attr, None) if result is not None else None
        errors.append(
            MetricError(
                metric=attr,
                expected=truth[truth_key],
                actual=actual,
                view=view_label,
                condition=condition,
            )
        )
    return errors


def format_table(errors: List[MetricError]) -> str:
    """Render scored errors as a fixed-width table."""
    head = f"{'metric':<26}{'view':<12}{'condition':<16}{'expected':>10}{'actual':>10}{'error':>10}"
    lines = [head, "-" * len(head)]
    for e in errors:
        actual = "None" if e.actual is None else f"{e.actual:10.2f}"
        err = "  n/a" if e.error is None else f"{e.error:+10.2f}"
        lines.append(
            f"{e.metric:<26}{e.view:<12}{e.condition:<16}{e.expected:10.2f}{actual}{err}"
        )
    return "\n".join(lines)
