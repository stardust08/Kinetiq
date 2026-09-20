"""
Certification driver for range of motion.

Lives beside the registries rather than inside certify_accuracy.py so the ROM trial can
be imported by tests too. It poses a subject at a KNOWN end-range hold, projects through
a camera at the view the metric declares, and runs the production ROMCalibrator - the
same contract the posture and gait drivers follow.

Each movement is captured on its own, because that is how the clinic does it: the
patient holds one end-range position while frames are collected, then moves to the next.
A single pose with every joint at end range simultaneously is not a capture anyone
performs, and certifying against it would certify a scenario that never happens.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from app.core.metrics.rom_registry import ROM_METRICS
from app.core.pose.rom_v2 import ROMCalibrator
from app.core.validation.camera import Camera, emit_pose_samples
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import Pose, build_skeleton

# metric key -> (pose field, the views that movement is captured from)
SAGITTAL = ("leftside", "rightside")
FRONTAL = ("front", "back")

MOVEMENTS: Dict[str, Tuple[str, Tuple[str, ...]]] = {
    "rom_shoulder_flexion_left": ("shoulder_flexion_left", SAGITTAL),
    "rom_shoulder_flexion_right": ("shoulder_flexion_right", SAGITTAL),
    "rom_shoulder_abduction_left": ("shoulder_abduction_left", FRONTAL),
    "rom_shoulder_abduction_right": ("shoulder_abduction_right", FRONTAL),
    "rom_elbow_flexion_left": ("elbow_flexion_left", SAGITTAL),
    "rom_elbow_flexion_right": ("elbow_flexion_right", SAGITTAL),
    "rom_hip_flexion_left": ("hip_flexion_left", SAGITTAL),
    "rom_hip_flexion_right": ("hip_flexion_right", SAGITTAL),
    "rom_knee_flexion_left": ("knee_flexion_left", SAGITTAL),
    "rom_knee_flexion_right": ("knee_flexion_right", SAGITTAL),
}

# End-range spans a real patient reaches. Drawn from, not fixed at, the normal range -
# a certification that only ever sees healthy values proves nothing about the readings a
# restricted joint produces.
DRAW_RANGE: Dict[str, Tuple[float, float]] = {
    "shoulder_flexion_left": (60.0, 178.0),
    "shoulder_flexion_right": (60.0, 178.0),
    "shoulder_abduction_left": (40.0, 175.0),
    "shoulder_abduction_right": (40.0, 175.0),
    "elbow_flexion_left": (30.0, 150.0),
    "elbow_flexion_right": (30.0, 150.0),
    "hip_flexion_left": (30.0, 110.0),
    "hip_flexion_right": (30.0, 110.0),
    "knee_flexion_left": (20.0, 140.0),
    "knee_flexion_right": (20.0, 140.0),
}


def _truth_from_skeleton(points: Dict, key: str) -> float:
    """
    The posed angle as it exists in the BUILT skeleton, not as it was typed into Pose.

    These differ whenever the trunk leans. Pose sets a limb's angle against world
    vertical; the metrics measure it against the TRUNK AXIS, which is the clinical
    definition - a patient who leans back has not gained shoulder range. So a subject
    posed at 150 degrees of flexion with 5 degrees of trunk lean genuinely has 145 or
    155 degrees of trunk-relative flexion, and scoring against the typed 150 charges the
    pipeline for the harness's own convention.

    Measured here, off the geometry, so the truth cannot drift from what the frames
    contain. This is the same correction the posture registry's hip angle needed.
    """
    from app.core.pose.rom_v2 import _IMPLEMENTATIONS
    from app.core.validation.camera import world_landmarks

    fn = _IMPLEMENTATIONS[key]
    return float(fn(world_landmarks(points), True, "front"))


def run_rom_trial(rng: np.random.Generator, conditions: Dict) -> List[Dict]:
    """
    One simulated ROM session: every movement captured and scored against its own
    posed angle. Returns rows in the shape certify_accuracy.score() produces.
    """
    rows: List[Dict] = []
    height = float(rng.uniform(1.50, 1.95))

    for key, (field_name, views) in MOVEMENTS.items():
        lo, hi = DRAW_RANGE[field_name]
        posed = float(rng.uniform(lo, hi))
        # A little trunk lean and head tilt, because a patient at end range is not a
        # mannequin and the measurement must survive it.
        pose = Pose(
            height_m=height,
            trunk_lean_sagittal=float(rng.uniform(-4, 8)),
            trunk_lean_lateral=float(rng.uniform(-5, 5)),
            **{field_name: posed},
        )
        points = build_skeleton(pose)
        cal = ROMCalibrator(
            normalised_input=True,
            aspect_ratio=conditions["width"] / conditions["height"],
        )
        for view in views:
            cam = Camera(
                azimuth_deg=VIEW_AZIMUTH[view],
                distance_m=conditions["distance"],
                target=(0.0, height * 0.5, 0.0),
                image_width=conditions["width"],
                image_height=conditions["height"],
                focal_px=conditions["focal"],
            )
            for raw in emit_pose_samples(
                points, cam, n_samples=60, jitter_px=conditions["jitter"],
                include_world=True, jitter_m=conditions["world_jitter"],
                world_bias_m=conditions["world_bias"], rng=rng,
            ):
                cal.add_sample(
                    {
                        "pose": {
                            i: [v[0] / conditions["width"], v[1] / conditions["height"], v[2], v[3]]
                            for i, v in raw["pose"].items()
                        },
                        "pose_world": {i: list(v) for i, v in raw["pose_world"].items()},
                    },
                    view=view,
                )

        result = cal.finalize("cert", movement=field_name)
        metric = result.metrics.get(key)
        if metric is None:
            continue
        shipped = metric.value is not None and metric.status.value in (
            "measured",
            "low_confidence",
        )
        row = {"key": key, "shipped": shipped, "status": metric.status.value}
        if shipped:
            row["error"] = float(metric.value - _truth_from_skeleton(points, key))
        rows.append(row)
    return rows
