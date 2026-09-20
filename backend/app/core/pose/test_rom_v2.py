"""
Definitional tests for the ROM metrics.

The Monte Carlo certification in scripts/certify_rom.py proves these survive camera
projection and landmark noise, but it scores against truth derived by the SAME function
on clean landmarks. That catches noise and projection problems; it cannot catch a metric
whose definition is wrong in a self-consistent way. A sign inversion, in particular,
would certify at 100% while telling every clinician the patient bends the other way.

So these tests score against the POSED angle instead - the number a clinician would have
typed into a goniometer - and pin the sign and the reference frame independently.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.pose.rom_v2 import _IMPLEMENTATIONS
from app.core.validation.camera import world_landmarks
from app.core.validation.skeleton import Pose, build_skeleton


def _measure(key: str, **pose_kwargs) -> float:
    points = build_skeleton(Pose(**pose_kwargs))
    value = _IMPLEMENTATIONS[key](world_landmarks(points), True, "front")
    assert value is not None, f"{key} returned nothing on a clean skeleton"
    return float(value)


class TestCervicalLateralFlexion:
    KEY = "rom_cervical_lateral_flexion"

    def test_neutral_head_reads_zero(self):
        assert abs(_measure(self.KEY, head_tilt=0.0)) < 0.5

    @pytest.mark.parametrize("posed", [-40.0, -25.0, -10.0, 10.0, 25.0, 40.0])
    def test_tracks_the_posed_angle_in_both_directions(self, posed):
        """
        Sign AND magnitude against the posed tilt, not against itself.

        The pipeline's frontal sign convention is set by `_frontal_tilt`: negative when
        the subject's LEFT side is the high one. A head bending toward the left carries
        the left ear DOWN, so a leftward bend is positive - the opposite of the
        skeleton's head_tilt knob, which is positive toward the right. The inversion is
        deliberate and is what makes this metric read the same way as the posture
        registry's head_lateral_flexion on a single report; it is asserted rather than
        assumed because a silent flip here tells every clinician the wrong side.
        """
        measured = _measure(self.KEY, head_tilt=posed)
        assert np.sign(measured) == -np.sign(posed), (
            f"posed head_tilt {posed:+.0f} deg (toward the subject's "
            f"{'right' if posed > 0 else 'left'}), measured {measured:+.1f} deg - "
            "this no longer agrees with head_lateral_flexion"
        )
        assert measured == pytest.approx(-posed, abs=2.0)

    def test_trunk_lean_is_not_credited_as_neck_range(self):
        """
        Side-bending the whole trunk is a compensation, not cervical movement.

        A horizon-referenced measurement passes the lean through in full.
        """
        leaning = _measure(self.KEY, head_tilt=0.0, trunk_lean_lateral=12.0)
        assert abs(leaning) < 2.0, (
            f"12 deg of trunk lean leaked {leaning:+.1f} deg into cervical range"
        )

    def test_a_shrug_is_not_credited_as_neck_range(self):
        """
        The classic compensation on this test, and the reason the reference is the trunk
        axis rather than the shoulder line.

        Referencing the shoulders did not merely tolerate a shrug, it ADDED it - the
        shoulder line tilts the same way the ear line does, so subtracting it inflated
        a 20 degree bend to 25. Both halves are pinned: a shrug alone must read zero,
        and a shrug during a real bend must not change the answer.
        """
        shrug_only = _measure(self.KEY, head_tilt=0.0, shoulder_height_asymmetry=0.03)
        assert abs(shrug_only) < 2.0, (
            f"a raised shoulder alone reported {shrug_only:+.1f} deg of neck range"
        )

        clean = _measure(self.KEY, head_tilt=-20.0)
        with_shrug = _measure(self.KEY, head_tilt=-20.0, shoulder_height_asymmetry=0.03)
        assert with_shrug == pytest.approx(clean, abs=2.0), (
            f"a shrug moved a 20 deg bend from {clean:+.1f} to {with_shrug:+.1f}"
        )

    def test_pelvic_obliquity_does_not_leak_in(self):
        """
        The hip line supplies the lateral direction, so its own tilt must be flattened
        out first - 2 cm of obliquity otherwise passed through at nearly 1:1.
        """
        oblique = _measure(self.KEY, head_tilt=0.0, pelvis_height_asymmetry=0.02)
        assert abs(oblique) < 2.0, (
            f"pelvic obliquity leaked {oblique:+.1f} deg into cervical range"
        )


class TestFlexionMetricsAgreeWithThePosedAngle:
    """
    Spot-check the sign convention on the joint angles too.

    These are unsigned, so an inversion shows up as a complement - 140 reported as 40 -
    rather than as a negative number. Cheap to pin, and it fixes the definition of
    "flexion" as the angle the joint has MOVED THROUGH from anatomical zero, which is
    what a goniometer reads and the opposite of the included angle between the segments.
    """

    @pytest.mark.parametrize(
        "key,field,posed",
        [
            ("rom_knee_flexion_left", "knee_flexion_left", 120.0),
            ("rom_knee_flexion_right", "knee_flexion_right", 90.0),
            ("rom_elbow_flexion_left", "elbow_flexion_left", 140.0),
            ("rom_elbow_flexion_right", "elbow_flexion_right", 60.0),
        ],
    )
    def test_reports_travel_from_anatomical_zero(self, key, field, posed):
        measured = _measure(key, **{field: posed})
        assert measured == pytest.approx(posed, abs=2.0), (
            f"{key}: posed {posed:.0f} deg, measured {measured:.1f} deg "
            f"(complement would be {180 - posed:.0f})"
        )

    def test_a_straight_limb_reads_zero_flexion(self):
        assert _measure("rom_knee_flexion_left", knee_flexion_left=0.0) == pytest.approx(
            0.0, abs=1.0
        )
        assert _measure("rom_elbow_flexion_right", elbow_flexion_right=0.0) == pytest.approx(
            0.0, abs=1.0
        )
