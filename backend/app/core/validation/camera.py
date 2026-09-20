"""
Pinhole camera model and MediaPipe-shaped landmark emitters.

The harness needs to hand the pipeline data in exactly the shape the pipeline
receives in production, otherwise we would be testing a different code path than
the one we ship. Two shapes are emitted:

    emit_pose_samples()  -> {"pose": {idx: (px, py, z, visibility)}}
                            the shape BodyCalibrator.add_calibration_sample expects
    emit_gait_frames()   -> [{"frameIndex", "landmarks": {"27": [x, y, z, vis]}, ...}]
                            the shape GaitCalibrator.add_view expects (normalised 0-1)

We also emit world landmarks (metric, hip-centred) because that is what MediaPipe
actually provides and what the fixed pipeline should be using for angles.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.core.validation.skeleton import L_HIP, R_HIP


@dataclass
class Camera:
    """
    A camera looking at a point in the world.

    azimuth_deg: position around the subject.
        0   = directly in front of a subject facing +Z (a "front" capture)
        90  = the subject's right side  (a "rightside" capture)
        -90 = the subject's left side   (a "leftside" capture)
        180 = directly behind           (a "back" capture)
    elevation_deg: + places the camera above the target, looking down.
    """

    azimuth_deg: float = 0.0
    elevation_deg: float = 0.0
    distance_m: float = 3.0
    target: Tuple[float, float, float] = (0.0, 0.9, 0.0)
    image_width: int = 640
    image_height: int = 480
    focal_px: float = 600.0

    def position(self) -> np.ndarray:
        az = np.radians(self.azimuth_deg)
        el = np.radians(self.elevation_deg)
        t = np.array(self.target, dtype=float)
        return t + self.distance_m * np.array([
            np.cos(el) * np.sin(az),
            np.sin(el),
            np.cos(el) * np.cos(az),
        ])

    def _basis(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Orthonormal camera basis: right, up, forward (forward points at the target)."""
        eye = self.position()
        fwd = np.array(self.target, dtype=float) - eye
        fwd = fwd / np.linalg.norm(fwd)
        world_up = np.array([0.0, 1.0, 0.0])
        right = np.cross(fwd, world_up)
        n = np.linalg.norm(right)
        if n < 1e-9:  # camera directly overhead; pick any stable right vector
            right = np.array([1.0, 0.0, 0.0])
        else:
            right = right / n
        up = np.cross(right, fwd)
        return right, up, fwd

    def project(self, points: Dict[int, np.ndarray]) -> Dict[int, Tuple[float, float, float]]:
        """
        Project world points to pixel coordinates.

        Returns idx -> (px, py, depth_m). Pixel y grows downward, matching image
        convention and MediaPipe's normalised output.
        """
        eye = self.position()
        right, up, fwd = self._basis()
        cx, cy = self.image_width / 2.0, self.image_height / 2.0

        out: Dict[int, Tuple[float, float, float]] = {}
        for idx, pt in points.items():
            rel = pt - eye
            z = float(np.dot(rel, fwd))
            if z <= 1e-6:  # behind the camera
                continue
            x = float(np.dot(rel, right))
            y = float(np.dot(rel, up))
            px = cx + self.focal_px * x / z
            py = cy - self.focal_px * y / z  # minus: image y grows downward
            out[idx] = (px, py, z)
        return out


def world_landmarks(points: Dict[int, np.ndarray]) -> Dict[int, Tuple[float, float, float]]:
    """
    MediaPipe-style world landmarks: metres, origin at the mid-hip, Y up.

    This is what `poseWorldLandmarks` gives you, and what angle computation should
    be using instead of the 2D projection.
    """
    if L_HIP not in points or R_HIP not in points:
        return {}
    origin = (points[L_HIP] + points[R_HIP]) / 2.0
    return {idx: tuple((pt - origin).tolist()) for idx, pt in points.items()}


# MediaPipe infers world landmarks from a single image, so the coordinate it knows
# least about is the one pointing away from the camera. Published evaluations put
# in-plane world-landmark error at roughly 2-3 cm and depth error several times that.
# 4x is a deliberately conservative reading of that gap.
DEPTH_ERROR_RATIO = 4.0


def emit_pose_samples(
    points: Dict[int, np.ndarray],
    camera: Camera,
    n_samples: int = 60,
    jitter_px: float = 0.0,
    visibility: float = 0.95,
    rng: Optional[np.random.Generator] = None,
    include_world: bool = False,
    jitter_m: float = 0.0,
    depth_error_ratio: float = DEPTH_ERROR_RATIO,
    world_bias_m: float = 0.0,
) -> List[Dict]:
    """
    Emit samples in the shape BodyCalibrator.add_calibration_sample() expects.

    jitter_px simulates MediaPipe landmark noise so the harness can measure how
    detector noise propagates into each metric. include_world additionally emits
    "pose_world" (metric, hip-centred), matching MediaPipe's poseWorldLandmarks,
    with its own jitter_m noise level in metres.

    World-landmark noise is ANISOTROPIC and tied to the camera, which matters more than
    its magnitude. MediaPipe does not measure 3-D; it infers it from one image, and the
    axis it infers worst is the one pointing away from the lens. Emitting isotropic
    world noise - as this harness originally did - hands the pipeline a quality of 3-D
    input that no real capture provides, and makes every world-space metric look better
    than it is. It also makes the cross-view agreement check vacuous: with perfect world
    landmarks the left and right captures produce identical numbers by construction, so
    a check designed to catch a subject standing off-axis can never fire.

    world_bias_m models the part of that error that does NOT average away. A pose
    estimator handed sixty near-identical frames of a stationary subject returns sixty
    near-identical answers: whatever it gets wrong about this body in this pose from
    this angle, it gets wrong every frame. Only the jitter averages out. Modelling the
    error as pure per-frame noise therefore lets 60 frames divide it by nearly eight,
    and credits the pipeline with an accuracy that no amount of frame-averaging can
    actually buy. The bias is drawn once per landmark per view - which is also what
    makes two views disagree, and what the cross-view check exists to detect.
    """
    rng = rng or np.random.default_rng(0)
    projected = camera.project(points)
    world = world_landmarks(points)
    # Camera basis, so world noise can be applied in the camera's frame rather than the
    # world's: sideways and vertical error stay at jitter_m, depth error is multiplied.
    cam_right, cam_up, cam_fwd = camera._basis()

    # Drawn once, for this view, and applied to every frame.
    bias: Dict[int, np.ndarray] = {}
    if include_world and world_bias_m > 0:
        for idx in world:
            bias[idx] = (
                rng.normal(0.0, world_bias_m) * cam_right
                + rng.normal(0.0, world_bias_m) * cam_up
                + rng.normal(0.0, world_bias_m * depth_error_ratio) * cam_fwd
            )

    samples = []
    for _ in range(n_samples):
        pose_dict = {}
        world_dict = {}
        for idx, (px, py, depth) in projected.items():
            if jitter_px > 0:
                px = px + rng.normal(0.0, jitter_px)
                py = py + rng.normal(0.0, jitter_px)
            # The production processor stores integer pixels; match that exactly so
            # we also capture quantisation error.
            pose_dict[idx] = (int(px), int(py), float(world.get(idx, (0, 0, 0))[2]), visibility)
            if include_world and idx in world:
                w = np.array(world[idx], dtype=float) + bias.get(idx, 0.0)
                if jitter_m > 0:
                    w = w + (
                        rng.normal(0.0, jitter_m) * cam_right
                        + rng.normal(0.0, jitter_m) * cam_up
                        + rng.normal(0.0, jitter_m * depth_error_ratio) * cam_fwd
                    )
                world_dict[idx] = (float(w[0]), float(w[1]), float(w[2]), visibility)
        sample = {"pose": pose_dict}
        if include_world:
            sample["pose_world"] = world_dict
        samples.append(sample)
    return samples


def emit_gait_frames(
    frames_points: List[Dict[int, np.ndarray]],
    camera: Camera,
    fps: int = 30,
    jitter_px: float = 0.0,
    visibility: float = 0.95,
    rng: Optional[np.random.Generator] = None,
) -> List[Dict]:
    """
    Emit a time series in the shape GaitCalibrator.add_view() expects.

    Coordinates are normalised 0-1 by image dimensions, matching what the browser
    sends up from MediaPipe.
    """
    rng = rng or np.random.default_rng(0)
    out = []
    for i, points in enumerate(frames_points):
        projected = camera.project(points)
        landmarks = {}
        for idx, (px, py, depth) in projected.items():
            if jitter_px > 0:
                px = px + rng.normal(0.0, jitter_px)
                py = py + rng.normal(0.0, jitter_px)
            landmarks[str(idx)] = [
                px / camera.image_width,
                py / camera.image_height,
                float(depth),
                visibility,
            ]
        out.append({
            "frameIndex": i,
            "landmarks": landmarks,
            "timestamp": i * (1000.0 / fps),
        })
    return out
