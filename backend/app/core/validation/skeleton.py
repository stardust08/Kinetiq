"""
Parametric synthetic skeleton with known joint angles.

This is the ground-truth generator for the metric validation harness. We build a
skeleton at *known* joint angles, project it through a *known* camera, and hand the
resulting landmarks to the real pipeline. Whatever the pipeline reports can then be
compared against the angle we posed.

Coordinate system (anatomical, right-handed):
    +X = subject's right -> left    (medio-lateral)
    +Y = up                          (superior)
    +Z = the direction the subject faces (anterior)

The medio-lateral axis points to the subject's LEFT, and that is forced, not a taste.
For a right-handed frame, a body facing +Z with up +Y has right R satisfying
R x U = -F, which gives R = -X. Placing the subject's right at +X instead builds a
MIRRORED person: self-consistent, projecting cleanly, and left-right reversed against
every real capture. This harness did exactly that, so a front camera saw the subject's
left shoulder on the image's left, while a real un-mirrored webcam sees it on the
image's right. Every metric carrying a left-right sign was therefore validated against
a mirror, and three frontal metrics shipped reading ~178 degrees on live patients -
the angle of a shoulder line traversed backwards - and were withheld as physically
impossible.

Segment lengths follow Winter's anthropometric proportions expressed as fractions of
standing height. They do not need to be perfectly realistic - the harness only needs
the geometry to be *known*, not representative.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Tuple

import numpy as np

# MediaPipe Pose landmark indices we synthesise.
NOSE = 0
L_EAR, R_EAR = 7, 8
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28
L_HEEL, R_HEEL = 29, 30
L_FOOT, R_FOOT = 31, 32

# Winter's segment proportions as a fraction of standing height H.
PROPORTIONS = {
    "shoulder_height": 0.818,
    "hip_height": 0.530,
    "shoulder_half_width": 0.129,
    "hip_half_width": 0.095,
    "thigh": 0.245,
    "shank": 0.246,
    "upper_arm": 0.186,
    "forearm": 0.146,
    "foot_length": 0.152,
    "heel_behind_ankle": 0.039,
    "ankle_height": 0.039,
    "ear_height": 0.936,
    "ear_half_width": 0.070,
    "nose_height": 0.930,
    "nose_forward": 0.055,
}


def _rot_x(theta_deg: float) -> np.ndarray:
    """Rotation about the medio-lateral axis: positive = forward/anterior lean."""
    t = np.radians(theta_deg)
    c, s = np.cos(t), np.sin(t)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _rot_y(theta_deg: float) -> np.ndarray:
    """Rotation about the vertical axis: positive = turn toward subject's right."""
    t = np.radians(theta_deg)
    c, s = np.cos(t), np.sin(t)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _rot_z(theta_deg: float) -> np.ndarray:
    """Rotation about the antero-posterior axis: positive = lean toward subject's LEFT.

    Toward the left, because +X is the subject's left. Callers that want the documented
    "positive = toward the right" pass a negated angle.
    """
    t = np.radians(theta_deg)
    c, s = np.cos(t), np.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


@dataclass
class Pose:
    """
    The ground truth. Every field is an angle we impose on the skeleton, so every
    field is something the pipeline can be scored against.

    Sign conventions (these are the conventions the fixed pipeline must reproduce):
        trunk_lean_sagittal : + forward flexion, - backward extension
        trunk_lean_lateral  : + lean toward subject's right
        hip_flexion_*       : + thigh swings anterior
        hip_abduction_*     : + leg swings laterally away from the midline
                              (negative = adduction, foot tracks inside the hip)
        knee_flexion_*      : + heel toward buttock (0 = fully extended)
        shoulder_flexion_*  : + arm swings anterior
        shoulder_abduction_*: + arm swings laterally away from trunk
        foot_progression_*  : + toe-out, the foot rotated away from the midline
        head_tilt           : + head tilts toward subject's right
        head_rotation       : + head turns toward subject's right
    """

    height_m: float = 1.70

    trunk_lean_sagittal: float = 0.0
    trunk_lean_lateral: float = 0.0

    hip_flexion_left: float = 0.0
    hip_flexion_right: float = 0.0
    hip_abduction_left: float = 0.0
    hip_abduction_right: float = 0.0
    knee_flexion_left: float = 0.0
    knee_flexion_right: float = 0.0

    shoulder_flexion_left: float = 0.0
    shoulder_flexion_right: float = 0.0
    shoulder_abduction_left: float = 0.0
    shoulder_abduction_right: float = 0.0
    elbow_flexion_left: float = 0.0
    elbow_flexion_right: float = 0.0

    head_tilt: float = 0.0
    head_rotation: float = 0.0

    # Transverse-plane foot rotation. Positive = toe-out (the foot's long axis rotated
    # away from the midline), which is what a standing foot progression angle measures.
    foot_progression_left: float = 0.0
    foot_progression_right: float = 0.0

    # Postural asymmetries, in metres, applied directly to landmark positions.
    shoulder_height_asymmetry: float = 0.0  # + raises the subject's left shoulder
    pelvis_height_asymmetry: float = 0.0    # + raises the subject's left hip

    # Whole-body placement in the world.
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    facing: float = 0.0  # degrees; 0 = facing +Z


def build_skeleton(pose: Pose) -> Dict[int, np.ndarray]:
    """
    Forward kinematics: turn a Pose into 3D landmark positions in metres.

    Returns a dict of MediaPipe landmark index -> np.array([x, y, z]).
    """
    H = pose.height_m
    p = {k: v * H for k, v in PROPORTIONS.items()}

    lm: Dict[int, np.ndarray] = {}

    # --- Pelvis -------------------------------------------------------------
    # The pelvis is the root. Hips sit symmetrically about the vertical axis.
    hip_y = p["hip_height"]
    lm[L_HIP] = np.array([+p["hip_half_width"], hip_y + pose.pelvis_height_asymmetry, 0.0])
    lm[R_HIP] = np.array([-p["hip_half_width"], hip_y, 0.0])
    mid_hip = (lm[L_HIP] + lm[R_HIP]) / 2

    # --- Trunk --------------------------------------------------------------
    # Start from a unit "up" vector and apply sagittal then lateral lean.
    torso_len = p["shoulder_height"] - p["hip_height"]
    trunk_dir = _rot_z(pose.trunk_lean_lateral) @ _rot_x(pose.trunk_lean_sagittal) @ np.array([0.0, 1.0, 0.0])
    mid_shoulder = mid_hip + torso_len * trunk_dir

    # Shoulders sit on a medio-lateral bar carried by the trunk, so lateral lean
    # rotates the bar too.
    shoulder_bar = _rot_z(pose.trunk_lean_lateral) @ np.array([1.0, 0.0, 0.0])
    lm[L_SHOULDER] = mid_shoulder + p["shoulder_half_width"] * shoulder_bar
    lm[L_SHOULDER] = lm[L_SHOULDER] + np.array([0.0, pose.shoulder_height_asymmetry, 0.0])
    lm[R_SHOULDER] = mid_shoulder - p["shoulder_half_width"] * shoulder_bar

    # --- Head ---------------------------------------------------------------
    head_up = _rot_z(pose.head_tilt) @ trunk_dir
    neck_to_ear = p["ear_height"] - p["shoulder_height"]
    ear_center = mid_shoulder + neck_to_ear * head_up
    ear_bar = _rot_y(-pose.head_rotation) @ _rot_z(pose.head_tilt) @ np.array([1.0, 0.0, 0.0])
    lm[L_EAR] = ear_center + p["ear_half_width"] * ear_bar
    lm[R_EAR] = ear_center - p["ear_half_width"] * ear_bar
    nose_dir = _rot_y(-pose.head_rotation) @ np.array([0.0, 0.0, 1.0])
    lm[NOSE] = ear_center + p["nose_forward"] * nose_dir

    # --- Legs ---------------------------------------------------------------
    for side, hip_idx, knee_idx, ankle_idx, heel_idx, foot_idx, hip_flex, hip_abd, knee_flex, lat_sign in (
        ("L", L_HIP, L_KNEE, L_ANKLE, L_HEEL, L_FOOT,
         pose.hip_flexion_left, pose.hip_abduction_left, pose.knee_flexion_left, +1.0),
        ("R", R_HIP, R_KNEE, R_ANKLE, R_HEEL, R_FOOT,
         pose.hip_flexion_right, pose.hip_abduction_right, pose.knee_flexion_right, -1.0),
    ):
        hip = lm[hip_idx]
        # Thigh points down, abducted laterally, then rotated anteriorly by hip flexion.
        # Note the negated flexion angle: _rot_x(+theta) carries an UP vector anterior
        # but a DOWN vector posterior, so limb segments (which hang downward at rest)
        # need the opposite sign to make positive flexion mean anterior swing.
        # Abduction is applied first (closer to the body) so both leg segments share it,
        # which makes the ankle's medio-lateral offset exactly -lat_sign*(thigh+shank)*
        # sin(abduction) - the property the walk generator's inverse kinematics inverts.
        abd_rot = _rot_z(lat_sign * hip_abd)
        thigh_dir = _rot_x(-hip_flex) @ abd_rot @ np.array([0.0, -1.0, 0.0])
        knee = hip + p["thigh"] * thigh_dir
        # Knee flexion swings the shank posteriorly relative to the thigh.
        shank_dir = _rot_x(-(hip_flex - knee_flex)) @ abd_rot @ np.array([0.0, -1.0, 0.0])
        ankle = knee + p["shank"] * shank_dir
        lm[knee_idx] = knee
        lm[ankle_idx] = ankle
        # Foot: heel behind the ankle, toe in front, both at ground level. The toe is
        # rotated about the vertical axis by the foot progression angle - outward means
        # toward +X for the left foot and -X for the right, since +X is the subject's
        # left.
        progression = (
            pose.foot_progression_left if side == "L" else -pose.foot_progression_right
        )
        toe_dir = _rot_y(progression) @ np.array([0.0, 0.0, 1.0])
        lm[heel_idx] = ankle + np.array([0.0, -p["ankle_height"], -p["heel_behind_ankle"]])
        lm[foot_idx] = lm[heel_idx] + p["foot_length"] * toe_dir

    # --- Arms ---------------------------------------------------------------
    for side, sh_idx, el_idx, wr_idx, flex, abd, el_flex, lat_sign in (
        ("L", L_SHOULDER, L_ELBOW, L_WRIST, pose.shoulder_flexion_left,
         pose.shoulder_abduction_left, pose.elbow_flexion_left, +1.0),
        ("R", R_SHOULDER, R_ELBOW, R_WRIST, pose.shoulder_flexion_right,
         pose.shoulder_abduction_right, pose.elbow_flexion_right, -1.0),
    ):
        shoulder = lm[sh_idx]
        # Arm hangs down, abducted laterally, then flexed anteriorly. Angles are
        # negated for the same reason as the leg segments: these hang downward at rest.
        upper_dir = _rot_x(-flex) @ _rot_z(lat_sign * abd) @ np.array([0.0, -1.0, 0.0])
        elbow = shoulder + p["upper_arm"] * upper_dir
        fore_dir = _rot_x(-(flex + el_flex)) @ _rot_z(lat_sign * abd) @ np.array([0.0, -1.0, 0.0])
        wrist = elbow + p["forearm"] * fore_dir
        lm[el_idx] = elbow
        lm[wr_idx] = wrist

    # --- Whole-body placement ----------------------------------------------
    facing = _rot_y(pose.facing)
    offset = np.array(pose.position, dtype=float)
    return {idx: facing @ pt + offset for idx, pt in lm.items()}


def ground_truth_angles(pose: Pose) -> Dict[str, float]:
    """
    The clinical quantities implied by a Pose, expressed the way the pipeline
    should report them. This is what the harness scores against.
    """
    return {
        # Interior hip-knee-ankle angle: 180 deg = fully extended leg.
        "left_knee_angle": 180.0 - pose.knee_flexion_left,
        "right_knee_angle": 180.0 - pose.knee_flexion_right,
        "left_knee_flexion": pose.knee_flexion_left,
        "right_knee_flexion": pose.knee_flexion_right,
        "left_hip_flexion": pose.hip_flexion_left,
        "right_hip_flexion": pose.hip_flexion_right,
        "left_hip_abduction": pose.hip_abduction_left,
        "right_hip_abduction": pose.hip_abduction_right,
        # Signed: + forward, - backward. An upright subject is 0.
        "trunk_angle": pose.trunk_lean_sagittal,
        "trunk_lean_lateral": pose.trunk_lean_lateral,
        "shoulder_flexion_left": pose.shoulder_flexion_left,
        "shoulder_flexion_right": pose.shoulder_flexion_right,
        "shoulder_abduction_left": pose.shoulder_abduction_left,
        "shoulder_abduction_right": pose.shoulder_abduction_right,
        "head_tilt": pose.head_tilt,
        "head_rotation": pose.head_rotation,
        "foot_progression_angle_left": pose.foot_progression_left,
        "foot_progression_angle_right": pose.foot_progression_right,
    }
