"""
Ground-truth tests for range of motion.

ROM replaces rom_calculator.py, which was unreachable from any endpoint and carried the
defects the posture rewrite removed. The most consequential was `abs(180 - angle)` on a
hip-shoulder-elbow interior angle, which is INVERTED: an arm hanging at rest reported
180 degrees of shoulder flexion, a fully raised arm reported 0. Nothing caught it
because nothing called it.

Every assertion here compares against an angle known by construction.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.metrics.registry import Status
from app.core.metrics.rom_registry import ROM_METRICS, supported_rom_metrics
from app.core.pose.rom_v2 import _IMPLEMENTATIONS, ROMCalibrator
from app.core.validation.camera import Camera, emit_pose_samples, world_landmarks
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import Pose, build_skeleton

SAGITTAL = ("leftside", "rightside")
FRONTAL = ("front", "back")


def _run(pose: Pose, views, jitter_px=1.5, world_bias=0.03, n=60):
    points = build_skeleton(pose)
    rng = np.random.default_rng(3)
    cal = ROMCalibrator()
    for view in views:
        cam = Camera(azimuth_deg=VIEW_AZIMUTH[view])
        for sample in emit_pose_samples(
            points, cam, n_samples=n, jitter_px=jitter_px, include_world=True,
            jitter_m=world_bias / 3, world_bias_m=world_bias, rng=rng,
        ):
            cal.add_sample(sample, view=view)
    return cal.finalize("test")


class TestROMAccuracy:
    @pytest.mark.parametrize("angle", [45.0, 90.0, 150.0, 175.0])
    def test_shoulder_flexion_recovers_the_posed_angle(self, angle):
        pose = Pose(shoulder_flexion_right=angle)
        truth = _IMPLEMENTATIONS["rom_shoulder_flexion_right"](
            world_landmarks(build_skeleton(pose)), True, "front"
        )
        m = _run(pose, SAGITTAL).metrics["rom_shoulder_flexion_right"]
        assert m.status == Status.MEASURED
        assert m.value == pytest.approx(truth, abs=5.0)

    @pytest.mark.parametrize("angle", [40.0, 90.0, 160.0])
    def test_shoulder_abduction_recovers_the_posed_angle(self, angle):
        pose = Pose(shoulder_abduction_right=angle)
        truth = _IMPLEMENTATIONS["rom_shoulder_abduction_right"](
            world_landmarks(build_skeleton(pose)), True, "front"
        )
        m = _run(pose, FRONTAL).metrics["rom_shoulder_abduction_right"]
        assert m.status == Status.MEASURED
        assert m.value == pytest.approx(truth, abs=5.0)

    @pytest.mark.parametrize("angle", [30.0, 90.0, 140.0])
    def test_knee_flexion_recovers_the_posed_angle(self, angle):
        m = _run(Pose(knee_flexion_right=angle), SAGITTAL).metrics["rom_knee_flexion_right"]
        assert m.value == pytest.approx(angle, abs=5.0)

    @pytest.mark.parametrize("angle", [30.0, 90.0, 145.0])
    def test_elbow_flexion_recovers_the_posed_angle(self, angle):
        m = _run(Pose(elbow_flexion_right=angle), SAGITTAL).metrics["rom_elbow_flexion_right"]
        assert m.value == pytest.approx(angle, abs=5.0)

    def test_an_arm_at_rest_reads_zero_flexion_not_one_hundred_and_eighty(self):
        """
        The v1 bug, pinned. `abs(180 - angle)` on a hip-shoulder-elbow interior angle
        inverted the scale: a patient standing with their arms down was reported as
        having 180 degrees of shoulder flexion, and one holding their arms straight up
        as having none.
        """
        m = _run(Pose(), SAGITTAL).metrics["rom_shoulder_flexion_right"]
        assert m.value == pytest.approx(0.0, abs=5.0)

    def test_a_straight_knee_reads_zero_flexion(self):
        m = _run(Pose(), SAGITTAL).metrics["rom_knee_flexion_right"]
        assert m.value == pytest.approx(0.0, abs=5.0)

    def test_a_neutral_joint_reads_zero_when_tracking_is_clean(self):
        """No folded-absolute-value bias: with no noise, zero means zero, exactly."""
        clean = _run(Pose(), SAGITTAL, jitter_px=0.0, world_bias=0.0)
        for key in ("rom_knee_flexion_right", "rom_elbow_flexion_right"):
            assert clean.metrics[key].value == pytest.approx(0.0, abs=0.5), key

    @pytest.mark.parametrize("jitter,world", [(1.5, 0.03), (3.0, 0.04), (4.0, 0.05)])
    def test_noise_inflating_a_neutral_joint_is_never_reported_as_confident(
        self, jitter, world
    ):
        """
        A straight joint has a hard floor at zero - interior_angle is an arccos, bounded
        at 180 - so noise can only push a flexion reading UP. That is not a bug to
        remove, it is a property of measuring an angle at the end of its range, and at
        4 px of jitter it puts 7.4 degrees of flexion on an elbow that is straight.

        The contract is therefore the same one the gait peak metrics hold: never shipped
        AND wrong. Either the value is close to the truth, or the spread gate has marked
        it low confidence so nobody reads it as a finding.
        """
        result = _run(Pose(), SAGITTAL, jitter_px=jitter, world_bias=world)
        for key in ("rom_knee_flexion_right", "rom_elbow_flexion_right"):
            m = result.metrics[key]
            if abs(m.value) > 5.0:
                assert m.status == Status.LOW_CONFIDENCE, (
                    f"{key} read {m.value} on a neutral joint and was presented as "
                    f"confident"
                )
                assert m.detail

    def test_left_and_right_are_measured_independently(self):
        """
        Asymmetry is the finding clinicians look for. A shoulder reaching 170 on one
        side and 100 on the other is a result, and averaging the two would erase it.
        """
        result = _run(Pose(shoulder_abduction_right=170.0, shoulder_abduction_left=100.0), FRONTAL)
        right = result.metrics["rom_shoulder_abduction_right"].value
        left = result.metrics["rom_shoulder_abduction_left"].value
        assert right == pytest.approx(170.0, abs=6.0)
        assert left == pytest.approx(100.0, abs=6.0)


class TestROMHonesty:
    def test_a_movement_captured_from_the_wrong_plane_is_withheld(self):
        """Abduction needs a frontal view; a side capture cannot see it."""
        m = _run(Pose(shoulder_abduction_right=160.0), ("leftside",)).metrics[
            "rom_shoulder_abduction_right"
        ]
        assert m.status == Status.INSUFFICIENT_DATA
        assert m.value is None
        assert "front" in (m.detail or "")

    def test_too_few_frames_is_insufficient_not_a_guess(self):
        m = _run(Pose(knee_flexion_right=90.0), SAGITTAL, n=3).metrics["rom_knee_flexion_right"]
        assert m.status == Status.INSUFFICIENT_DATA
        assert m.value is None

    def test_cervical_rotation_is_declared_unsupported_with_its_evidence(self):
        """
        Transverse-plane, so a single camera cannot measure it - the same wall head yaw
        hit at 25.5 degrees of error. The v1 implementation asked for a top-down camera
        this product never captures.
        """
        spec = next(s for s in ROM_METRICS if s.key == "rom_cervical_rotation")
        assert not spec.is_supported
        assert spec.unsupported_reason
        assert spec.normal_range is None
        m = _run(Pose(head_rotation=40.0), FRONTAL).metrics["rom_cervical_rotation"]
        assert m.status == Status.UNSUPPORTED
        assert m.value is None

    def test_no_supported_metric_lacks_an_implementation(self):
        for spec in supported_rom_metrics():
            assert spec.key in _IMPLEMENTATIONS, f"{spec.key} declared but not implemented"

    def test_every_graded_metric_cites_a_source(self):
        for spec in ROM_METRICS:
            if spec.normal_range is not None:
                assert spec.reference, f"{spec.key} grades patients against an uncited range"
