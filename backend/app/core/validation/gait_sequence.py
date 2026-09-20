"""
Synthetic walking sequence with known gait parameters and a real ground-contact model.

Generates a skeleton walking at a *known* cadence, stride length, stance fraction and
step width, so the gait pipeline's event detection and derived metrics can be scored
against ground truth. Every temporal event is exact by construction.

HOW IT WORKS - foot placement first, angles second
--------------------------------------------------
The previous generator drove joint angles from sinusoids and let the feet go wherever
the kinematics put them. The feet therefore slid along the ground, there was no instant
at which a foot stopped and started bearing weight, and so there was no true toe-off to
score stance, swing or double support against. Those three metrics could not be
validated at all.

This generator inverts the construction:

  1. Foot contacts are scheduled first. Each foot is PLANTED at a fixed world position
     for a known fraction of the gait cycle (`stance_fraction`), then swings forward to
     its next plant. Heel strike and toe-off are therefore exact frame indices, and
     stance / swing / double-support percentages follow arithmetically from the
     schedule rather than being measured off a waveform.
  2. Pelvis height follows a smooth sinusoid at twice the stride frequency - highest at
     mid-stance, lowest at double support, exactly as in real walking. Its mean is
     fitted so the curve passes UNDER the reach limit of whichever stance leg is most
     extended at every frame, which guarantees each frame is geometrically reachable
     without the pelvis having to ride on the straight-leg limit. Riding that limit is
     what an earlier version did, and it produced a pelvis that jumped several
     centimetres between consecutive frames each time the binding leg changed, injecting
     20-40 degrees of spurious frame-to-frame knee flexion. Letting the pelvis sit below
     the limit is also what gives the leading knee its loading-response flexion.
  3. Joint angles are then recovered by closed-form inverse kinematics from hip to
     ankle. The angles are outputs, not inputs - which is why the ankle lands exactly
     where the contact schedule says it should.

Because contact is scheduled rather than inferred, `truth` now carries exact values for
stance_percent, swing_percent, double_support_percent, step_width_m and toe-off frames,
none of which the previous generator could provide.

WHAT THIS STILL DOES NOT MODEL
------------------------------
This is a compass gait: no pelvic rotation, no pelvic obliquity, no ankle
plantarflexion. Those are three of the mechanisms by which real walkers take a
normal-length step without dropping the pelvis, so this model's pelvis rises and falls
about twice as far as a human's, and its knee flexes about twice as far during loading
response. The joint-angle MAGNITUDES here are therefore a property of the model, not
physiological targets - which is fine, because every metric is scored against this
model's own exact values, not against a textbook range. What it does mean is that you
cannot read a normal-range comparison on this subject as evidence about a real patient.


The foot is a rigid horizontal segment: it does not roll from heel to toe through
stance, and there is no ankle dorsi/plantarflexion. Heel strike is therefore a flat-foot
contact. This is sound for validating the event detector (which reads heel and toe
position relative to the pelvis, and whose extrema still land exactly on the scheduled
contacts) and for the temporal metrics, but it means ANKLE kinematics cannot be
validated here. `ankle_dorsiflexion_max` remains out of scope for this harness.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.core.validation.skeleton import PROPORTIONS, Pose, build_skeleton

# Never let the stance knee lock straight: 0.998 of full leg length leaves about
# 7 degrees of flexion at mid-stance, which is what a real knee carries.
MAX_LEG_EXTENSION = 0.998


@dataclass
class WalkParams:
    """Ground truth for a synthetic walk."""

    cadence_spm: float = 110.0       # steps per minute
    # 1.10 m is 1.32 leg lengths for a 1.70 m subject - mid-band for the 1.2-1.6
    # normal range, and short enough that the compass-gait geometry below yields
    # physiological hip and knee excursions.
    stride_length_m: float = 1.10    # one full cycle, both feet
    duration_s: float = 6.0
    fps: int = 30
    height_m: float = 1.70

    # Fraction of the gait cycle each foot spends on the ground. 0.60 is the textbook
    # normal value and is what stance_phase_percent is graded against.
    stance_fraction: float = 0.60
    # Lateral distance between the two feet. Normal walking is NARROWER than the
    # pelvis, so the legs adduct slightly; the generator solves for that automatically.
    step_width_m: float = 0.10
    # Peak ankle rise during swing. Sets how much the knee must flex to clear the
    # ground; 0.12 m puts peak knee flexion in the physiological 55-65 degree band.
    swing_lift_m: float = 0.12
    # Medio-lateral pelvis excursion amplitude. Real walking is ~0.02 m, and the pelvis
    # completes ONE lateral cycle per stride - it shifts toward the left leg while the
    # left leg carries, then toward the right. Driving it at step frequency instead
    # gives two cycles per stride, which destroys the left-right mirror symmetry of the
    # walk: it made the left knee bottom out 11 degrees short of the right.
    lateral_sway_m: float = 0.02
    # Peak-to-peak vertical pelvis excursion: highest at mid-stance, lowest at double
    # support. None derives it from the leg geometry, which is what keeps the knee and
    # hip angles physiological - see the note on compass gait in generate_walk.
    pelvis_excursion_m: Optional[float] = None

    trunk_lean: float = 3.0

    # Asymmetry knobs, for testing that the pipeline detects what it claims to.
    right_stride_scale: float = 1.0   # >1 lengthens the right step

    @property
    def step_time_s(self) -> float:
        return 60.0 / self.cadence_spm

    @property
    def stride_time_s(self) -> float:
        """One full gait cycle = two steps."""
        return 2.0 * self.step_time_s

    @property
    def walking_speed_mps(self) -> float:
        return self.stride_length_m / self.stride_time_s

    @property
    def n_frames(self) -> int:
        return int(round(self.duration_s * self.fps))

    @property
    def thigh_m(self) -> float:
        return PROPORTIONS["thigh"] * self.height_m

    @property
    def shank_m(self) -> float:
        return PROPORTIONS["shank"] * self.height_m

    @property
    def leg_length_m(self) -> float:
        return self.thigh_m + self.shank_m

    @property
    def ankle_height_m(self) -> float:
        return PROPORTIONS["ankle_height"] * self.height_m

    @property
    def double_support_fraction(self) -> float:
        """
        Fraction of the cycle with both feet down.

        Two stance intervals of `stance_fraction` offset by half a cycle overlap by
        2 * (stance_fraction - 0.5). At the textbook 0.60 that is 0.20 - and a
        stance fraction at or below 0.5 means a running gait with a flight phase.
        """
        return max(0.0, 2.0 * (self.stance_fraction - 0.5))


def _swing_lift_profile(s: np.ndarray) -> np.ndarray:
    """
    Normalised ankle rise across swing, peaking at 30% of the swing phase.

    Asymmetric on purpose: the ankle rises fast right after toe-off (when the knee
    flexes hardest) and descends slowly into heel strike. A symmetric bump would put
    peak knee flexion at mid-swing, which is not where it occurs.

    Both exponents must exceed 1. s^0.6 peaks in the right place but has an infinite
    derivative at s=0, so the ankle jumped 8 cm in the first frame of swing and put a
    ~20 degree one-frame step in the hip and knee traces - a discontinuity no real limb
    has, and one that no amount of smoothing downstream can be blamed for.
    """
    a, b = 1.5, 3.5  # peak at a/(a+b) = 0.30
    s = np.clip(s, 0.0, 1.0)
    raw = np.power(s, a) * np.power(1.0 - s, b)
    peak = (a ** a) * (b ** b) / ((a + b) ** (a + b))
    return raw / peak


_SWING_V0 = 0.6
_PELVIS_MARGIN_FRAC = 0.004


def _swing_advance(s: float) -> float:
    """
    Fraction of the stride the swinging foot has covered, as a function of swing
    progress. A cubic Hermite with end velocities chosen to match real foot motion.

    The end velocities matter more than the shape. A smoothstep - zero velocity at both
    ends - is the obvious choice and is wrong in a way that corrupts event scoring: if
    the foot leaves the ground at rest, the toe keeps falling behind the still-advancing
    pelvis after toe-off, so the toe's pelvis-relative minimum lands ~3% of a cycle late
    and the Zeni detector looks biased when it is the generator that is.

    Real feet are already travelling at toe-off (roughly 1.5x pelvis speed here) and are
    still creeping forward at heel strike (roughly 0.5x). Those are the h'(0) = 0.6 and
    h'(1) = 0.2 below, in units of stride per swing-phase.
    """
    v0, v1 = _SWING_V0, 0.2
    return v0 * s + (3.0 - 2.0 * v0 - v1) * s ** 2 + (v1 + v0 - 2.0) * s ** 3


def _foot_track(
    params: WalkParams, t: np.ndarray, phase_offset: float, lead_m: float,
) -> Tuple[np.ndarray, np.ndarray, List[int], List[int]]:
    """
    One foot's world trajectory under the contact schedule.

    Returns (progression_m, height_m, heel_strike_frames, toe_off_frames). Heel strike
    is the frame a plant begins; toe-off the frame it ends.

    `lead_m` is how far ahead of the pelvis the foot plants at heel strike. Both feet
    advance one full stride per cycle - that is what keeps the average foot speed equal
    to the pelvis speed - so step-length asymmetry is expressed as a difference in
    lead between the two feet, not as a difference in stride.
    """
    stride_t = params.stride_time_s
    stride_len = params.stride_length_m
    # Cycle index and position within the cycle for this foot.
    phase = t / stride_t - phase_offset

    prog = np.zeros_like(t)
    height = np.full_like(t, params.ankle_height_m)
    strikes: List[int] = []
    toe_offs: List[int] = []

    cycle = np.floor(phase)
    frac = phase - cycle

    for i in range(t.size):
        k = cycle[i]
        f = frac[i]
        # Plant position for cycle k: where the pelvis will be at this foot's heel
        # strike, plus the lead. Feet advance one stride per cycle.
        plant = (k + phase_offset) * stride_len + lead_m
        if f < params.stance_fraction:
            prog[i] = plant
            height[i] = params.ankle_height_m
        else:
            # Swing: travel from this plant to the next, easing in and out.
            s = (f - params.stance_fraction) / (1.0 - params.stance_fraction)
            prog[i] = plant + stride_len * _swing_advance(s)
            height[i] = params.ankle_height_m + params.swing_lift_m * _swing_lift_profile(s)

    # Exact events: a strike is where the fractional phase wraps past 0, a toe-off
    # where it crosses stance_fraction.
    for i in range(1, t.size):
        if cycle[i] > cycle[i - 1]:
            strikes.append(i)
        if frac[i - 1] < params.stance_fraction <= frac[i]:
            toe_offs.append(i)
    return prog, height, strikes, toe_offs


def _leg_ik(
    hip: Tuple[float, float, float],
    ankle: Tuple[float, float, float],
    thigh: float,
    shank: float,
    lat_sign: float,
) -> Tuple[float, float, float, bool]:
    """
    Closed-form inverse kinematics for one leg: returns (hip_flexion, hip_abduction,
    knee_flexion, clamped) with the angles in degrees, in the sign convention
    build_skeleton expects.

    `clamped` is True when the target was out of reach and the solution had to be
    shortened. A clamped frame silently moves the foot off its scheduled contact point,
    which is exactly the assumption the whole harness rests on, so the caller counts
    these and a test asserts the count is zero.

    Coordinates are the skeleton's local anatomical frame: +X medio-lateral toward the
    subject's right, +Y up, +Z anterior. lat_sign is -1 for the left leg, +1 for the
    right, matching build_skeleton.

    Both leg segments share the abduction rotation, so the ankle's medio-lateral offset
    from the hip is exactly -lat_sign * (thigh + shank) * sin(abduction). That inverts
    directly, and the remaining sagittal problem is an ordinary two-link reach with
    both segments foreshortened by cos(abduction).
    """
    dx = ankle[0] - hip[0]
    dy = ankle[1] - hip[1]
    dz = ankle[2] - hip[2]

    span = thigh + shank
    sin_abd = np.clip(lat_sign * dx / span, -0.999, 0.999)
    abd = float(np.arcsin(sin_abd))
    cos_abd = float(np.cos(abd))

    a = thigh * cos_abd
    b = shank * cos_abd
    d = float(np.hypot(dz, dy))
    # The lateral component is fully accounted for by abduction, so the sagittal reach
    # must fit within the foreshortened segments.
    limit = (a + b) * 0.99999
    clamped = d > limit
    d = min(d, limit)
    if d < 1e-9 or a < 1e-9 or b < 1e-9:
        return 0.0, float(np.degrees(abd)), 0.0, clamped

    cos_knee = np.clip((a * a + b * b - d * d) / (2 * a * b), -1.0, 1.0)
    knee_flex = 180.0 - float(np.degrees(np.arccos(cos_knee)))

    cos_alpha = np.clip((a * a + d * d - b * b) / (2 * a * d), -1.0, 1.0)
    alpha = float(np.arccos(cos_alpha))
    # Angle of the hip->ankle line from straight down, positive anterior.
    phi = float(np.arctan2(dz, -dy))
    # The knee bends posteriorly, so the thigh lies anterior of the hip->ankle line.
    hip_flex = float(np.degrees(phi + alpha))

    return hip_flex, float(np.degrees(abd)), knee_flex, clamped



def _strike_frames(params: WalkParams, phase_offset: float) -> List[int]:
    """Heel-strike frame indices for one foot, without building any geometry."""
    t = np.arange(params.n_frames) / params.fps
    cycle = np.floor(t / params.stride_time_s - phase_offset)
    return [i for i in range(1, t.size) if cycle[i] > cycle[i - 1]]


def _measure_kinematics(
    frames: List[Dict[int, np.ndarray]],
    strikes: Dict[str, List[int]],
) -> Dict[str, float]:
    """
    Sagittal knee and hip excursions, measured off the generated skeleton in 3-D.

    Aggregated exactly the way the pipeline aggregates: the statistic is taken WITHIN
    each gait cycle and the median across cycles is reported. Taking a peak-to-peak
    across the whole capture instead compares different quantities - the whole-capture
    range picks up the single best-sampled cycle, and scored the pipeline 25 degrees
    low on knee ROM purely from that mismatch.

    Both legs are measured and the two must agree: a symmetric contact schedule has to
    produce a symmetric walk, so a left-right discrepancy here is a defect in the
    generator, not a finding about the subject. `left_right_asymmetry_deg` exposes it
    so a test can assert on it rather than have it silently become the "truth" the
    pipeline is scored against.
    """
    from app.core.validation.skeleton import (
        L_ANKLE, L_HIP, L_KNEE, R_ANKLE, R_HIP, R_KNEE,
    )

    def interior(a, b, c) -> float:
        u, v = a - b, c - b
        nu, nv = np.linalg.norm(u), np.linalg.norm(v)
        if nu < 1e-12 or nv < 1e-12:
            return 180.0
        return float(np.degrees(np.arccos(np.clip(u @ v / (nu * nv), -1.0, 1.0))))

    per_cycle: Dict[str, Dict[str, float]] = {}
    for tag, hip_i, knee_i, ank_i in (
        ("left", L_HIP, L_KNEE, L_ANKLE), ("right", R_HIP, R_KNEE, R_ANKLE)
    ):
        knee = np.array([180.0 - interior(f[hip_i], f[knee_i], f[ank_i]) for f in frames])
        # Thigh angle from vertical; world +X is the direction of travel.
        hip = np.array([
            float(np.degrees(np.arctan2((f[knee_i] - f[hip_i])[0], -(f[knee_i] - f[hip_i])[1])))
            for f in frames
        ])
        hs = strikes.get(tag) or []
        cycles = list(zip(hs, hs[1:])) or [(0, len(frames))]

        def med(series: np.ndarray, fn) -> float:
            vals = [fn(series[a:b]) for a, b in cycles if b > a]
            return float(np.median(vals)) if vals else float("nan")

        per_cycle[tag] = {
            "knee_flexion_max": med(knee, np.max),
            "knee_flexion_rom": med(knee, np.ptp),
            "hip_flexion_max": med(hip, np.max),
            "hip_extension_max": med(hip, lambda s: -np.min(s)),
            "hip_flexion_rom": med(hip, np.ptp),
        }

    asym = max(
        abs(per_cycle["left"][k] - per_cycle["right"][k]) for k in per_cycle["left"]
    )
    # Report the left leg: the side-view camera in the harness sees the left side, and
    # a symmetric walk makes the choice immaterial.
    out = dict(per_cycle["left"])
    out["left_right_asymmetry_deg"] = float(asym)
    return out


def generate_walk(
    params: WalkParams, _refine_truth: bool = True
) -> Tuple[List[Dict[int, np.ndarray]], Dict]:
    """
    Build a walking sequence from a foot-contact schedule.

    Returns (frames, truth) where frames is a list of landmark dicts in world metres
    and truth carries the ground-truth gait parameters, including exact heel-strike and
    toe-off frame indices for each foot and the temporal percentages implied by the
    contact schedule.
    """
    n = params.n_frames
    t = np.arange(n) / params.fps

    half_width = params.step_width_m / 2.0
    hip_half = PROPORTIONS["hip_half_width"] * params.height_m
    shoulder_span = 2 * PROPORTIONS["shoulder_half_width"] * params.height_m

    # Left foot strikes at phase 0, right foot half a cycle later. The right foot is
    # planted half a stride ahead so the two feet alternate evenly.
    # Plant the foot half a stance-phase ahead of the pelvis, so stance is symmetric
    # about mid-stance and the leg is near full extension at both ends of it.
    base_lead = params.stance_fraction * 0.5 * params.stride_length_m
    # Step-length asymmetry: advancing the right foot's plant by delta lengthens the
    # left-to-right step and shortens the right-to-left one by the same amount, while
    # leaving both strides - and therefore the walking speed - untouched.
    delta = 0.5 * params.stride_length_m * (params.right_stride_scale - 1.0)
    l_prog, l_height, l_strikes, l_toe_offs = _foot_track(
        params, t, phase_offset=0.0, lead_m=base_lead
    )
    r_prog, r_height, r_strikes, r_toe_offs = _foot_track(
        params, t, phase_offset=0.5, lead_m=base_lead + delta
    )

    # Pelvis advances at constant speed; lateral sway oscillates once per step.
    pelvis_prog = params.walking_speed_mps * t
    # Negative in the first half-stride so the pelvis shifts toward the subject's LEFT
    # (-X) while the left leg is the stance leg, which is what real walkers do. The
    # stride-period sine also makes lat(t + T/2) == -lat(t), the antisymmetry that keeps
    # the two legs mirror images of each other.
    pelvis_lat = -params.lateral_sway_m * np.sin(2 * np.pi * t / params.stride_time_s)

    stance_f = params.stance_fraction
    l_frac = np.mod(t / params.stride_time_s, 1.0)
    r_frac = np.mod(t / params.stride_time_s - 0.5, 1.0)
    l_in_stance = l_frac < stance_f
    r_in_stance = r_frac < stance_f

    leg_max = params.leg_length_m * MAX_LEG_EXTENSION
    default_hip_y = PROPORTIONS["hip_height"] * params.height_m

    # --- pelvis height: a sinusoid fitted under the stance legs' reach limit --------
    # reach_bound[i] is the highest the pelvis could sit at frame i without asking a
    # stance leg to exceed its length.
    # BOTH feet constrain the pelvis, not just the stance ones. A swinging foot is
    # farthest from its hip in the frame or two before heel strike - marginally farther
    # than at the strike itself, because the pelvis has not yet caught up - and leaving
    # swing feet out let the pelvis sit a hair too high there, which made the inverse
    # kinematics clamp and slid the foot off its landing point.
    reach_bound = np.full(n, default_hip_y)
    for i in range(n):
        bounds = []
        for sign, foot_prog, foot_y in (
            (-1.0, l_prog[i], l_height[i]),
            (+1.0, r_prog[i], r_height[i]),
        ):
            dx = (sign * half_width) - (sign * hip_half + pelvis_lat[i])
            dz = foot_prog - pelvis_prog[i]
            reach_sq = leg_max ** 2 - dx ** 2 - dz ** 2
            bounds.append(foot_y + float(np.sqrt(reach_sq)) if reach_sq > 0 else foot_y)
        if bounds:
            reach_bound[i] = min(bounds)

    # Highest at mid-stance, lowest at double support. Left heel strike is t=0, so the
    # minima fall on cos(4*pi*t/T) = +1.
    wave = -np.cos(4 * np.pi * t / params.stride_time_s)
    # Fit the sinusoid on ONE steady-state stride in the middle of the capture, then
    # apply it everywhere. Fitting on the whole series lets the partial cycles at the
    # start and end - where a foot is mid-stance of a cycle that began before frame 0 -
    # set the amplitude, which shifts the pelvis trajectory by a few millimetres and
    # shows up as several degrees of spurious left-right asymmetry on any capture that
    # is not a whole number of strides.
    stride_frames = int(round(params.stride_time_s * params.fps))
    if n >= 2 * stride_frames > 0:
        lo = (n - stride_frames) // 2
        fit = slice(lo, lo + stride_frames)
    else:
        fit = slice(0, n)
    if params.pelvis_excursion_m is not None:
        amp = params.pelvis_excursion_m / 2.0
    else:
        # Derive the excursion from the geometry rather than imposing a physiological
        # 4-5 cm. This model is a compass gait: it has no pelvic rotation, no pelvic
        # obliquity and no ankle plantarflexion, and those are precisely the mechanisms
        # by which real walkers keep the pelvis flat while taking a normal-length step.
        # Forcing 4-5 cm here instead of the ~10 cm the geometry demands would push the
        # pelvis far below the reach limit and leave the knee flexed ~40 degrees through
        # mid-stance, which is far less physiological than an exaggerated pelvis bob.
        amp = float(reach_bound[fit].max() - reach_bound[fit].min()) / 2.0
    # Largest mean that keeps mean + amp*wave <= reach_bound across the fitted stride,
    # less a safety margin. Without the margin the sinusoid grazes the reach limit, and
    # on strides whose frames land differently against the grid it crosses it by a
    # fraction of a millimetre - enough for the IK to clamp, which yanks the foot off
    # its scheduled contact point and put a 12-degree one-frame spike in the hip trace.
    margin = _PELVIS_MARGIN_FRAC * params.leg_length_m
    headroom = float(np.min(reach_bound[fit] - amp * wave[fit])) - margin
    pelvis_y_series = headroom + amp * wave
    # The fitted stride does not see the partial cycles at the start and end of the
    # capture, where a foot may be mid-stance of a cycle that began before frame 0 and
    # the reach limit sits lower. Shift the whole curve down by any global violation
    # rather than clipping it: clipping would put a corner in the pelvis trajectory,
    # and a corner in the pelvis is a corner in every joint angle below it.
    violation = float(np.max(pelvis_y_series - (reach_bound - margin)))
    if violation > 0:
        pelvis_y_series = pelvis_y_series - violation

    frames: List[Dict[int, np.ndarray]] = []
    pelvis_heights: List[float] = []
    clamped_frames = 0

    for i in range(n):
        pelvis_y = float(pelvis_y_series[i])
        pelvis_heights.append(pelvis_y)

        # --- inverse kinematics for each leg ---------------------------------
        angles = {}
        for tag, sign, foot_prog, foot_y in (
            ("left", -1.0, l_prog[i], l_height[i]),
            ("right", +1.0, r_prog[i], r_height[i]),
        ):
            hip = (sign * hip_half + pelvis_lat[i], pelvis_y, 0.0)
            ankle = (sign * half_width, foot_y, foot_prog - pelvis_prog[i])
            angles[tag] = _leg_ik(hip, ankle, params.thigh_m, params.shank_m, sign)

        hf_l, abd_l, kf_l, clamp_l = angles["left"]
        hf_r, abd_r, kf_r, clamp_r = angles["right"]
        clamped_frames += int(clamp_l or clamp_r)

        pose = Pose(
            height_m=params.height_m,
            trunk_lean_sagittal=params.trunk_lean,
            hip_flexion_left=hf_l,
            hip_flexion_right=hf_r,
            hip_abduction_left=abd_l,
            hip_abduction_right=abd_r,
            knee_flexion_left=kf_l,
            knee_flexion_right=kf_r,
            # Arms swing in antiphase with the ipsilateral leg.
            shoulder_flexion_left=float(-0.4 * hf_l),
            shoulder_flexion_right=float(-0.4 * hf_r),
            # build_skeleton always places the pelvis at its nominal height, so the
            # solved bob is applied as a whole-body offset; the IK targets were
            # already expressed relative to the pelvis, so the feet land correctly.
            position=(
                float(pelvis_prog[i]),
                float(pelvis_y - default_hip_y),
                float(pelvis_lat[i]),
            ),
            facing=90.0,  # walk along +X, so a camera on +Z sees the subject's RIGHT side
        )
        frames.append(build_skeleton(pose))

    # Kinematic truth is measured off the BUILT skeleton, not off the angles fed into
    # it. Those differ whenever a leg is abducted - abduction is applied to both leg
    # segments, so the 3-D angle at the knee is not exactly the flexion parameter - and
    # measuring the output means the truth cannot drift from what the frames actually
    # contain, whatever the forward-kinematics code does.
    if _refine_truth:
        # Measure the kinematic truth from a high-rate rebuild of the same walk.
        #
        # Peak and range-of-motion truth must be the CONTINUOUS value, not the value
        # visible at the capture frame rate. The knee passes through its extension
        # minimum quickly, and a stride is rarely a whole number of frames, so at 30 fps
        # the sampled minimum lands somewhere different every cycle - here it wandered
        # over a 16 degree band. That wander is a real limit on what a 30 fps capture
        # can recover, and scoring against the continuous truth is what makes it visible
        # instead of baking it into the target.
        dense, _ = generate_walk(replace(params, fps=params.fps * 8), _refine_truth=False)
        dense_strikes = {
            "left": _strike_frames(replace(params, fps=params.fps * 8), 0.0),
            "right": _strike_frames(replace(params, fps=params.fps * 8), 0.5),
        }
        kin = _measure_kinematics(dense, dense_strikes)
        kin["sampled_at_capture_fps"] = _measure_kinematics(
            frames, {"left": l_strikes, "right": r_strikes}
        )
    else:
        kin = _measure_kinematics(frames, {"left": l_strikes, "right": r_strikes})

    stance_pct = params.stance_fraction * 100.0
    truth = {
        "cadence_spm": params.cadence_spm,
        "stride_time_s": params.stride_time_s,
        "step_time_s": params.step_time_s,
        "stride_length_m": params.stride_length_m,
        "walking_speed_mps": params.walking_speed_mps,
        "leg_length_m": params.leg_length_m,
        "left_heel_strikes": l_strikes,
        "right_heel_strikes": r_strikes,
        "left_toe_offs": l_toe_offs,
        "right_toe_offs": r_toe_offs,
        # Exact from the contact schedule - these are the three the old generator
        # could not supply at all.
        "stance_percent": stance_pct,
        "swing_percent": 100.0 - stance_pct,
        "double_support_percent": params.double_support_fraction * 100.0,
        "step_width_m": params.step_width_m,
        "step_length_left_to_right_m": 0.5 * params.stride_length_m + delta,
        "step_length_right_to_left_m": 0.5 * params.stride_length_m - delta,
        "step_width_ratio": params.step_width_m / params.leg_length_m,
        "lateral_sway_ratio": 2.0 * params.lateral_sway_m / shoulder_span,
        # Measured off the generated kinematics: the angles are IK outputs, so their
        # extrema are facts about this walk rather than parameters of it.
        "knee_flexion_max": kin["knee_flexion_max"],
        "knee_flexion_rom": kin["knee_flexion_rom"],
        "hip_flexion_max": kin["hip_flexion_max"],
        "hip_extension_max": kin["hip_extension_max"],
        "hip_flexion_rom": kin["hip_flexion_rom"],
        "left_right_asymmetry_deg": kin["left_right_asymmetry_deg"],
        # What a capture at params.fps can actually see of the above. The gap between
        # the two is the frame-rate sampling limit, not a pipeline defect.
        "sampled": kin.get("sampled_at_capture_fps"),
        "trunk_lean": params.trunk_lean,
        "pelvis_excursion_m": float(np.ptp(pelvis_heights)),
        # Must be zero: any clamped frame means a foot was moved off its scheduled
        # contact point, and every temporal metric's ground truth assumes it was not.
        "ik_clamped_frames": clamped_frames,
        "n_frames": n,
        "fps": params.fps,
    }
    return frames, truth
