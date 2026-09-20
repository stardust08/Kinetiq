"""
Monte-Carlo accuracy certification for every posture and gait metric.

Answers one question per metric: across a population of subjects and capture conditions
we would actually see, what fraction of the numbers we would SHIP land within that
metric's tolerance? A metric that clears the bar is certified. One that does not is
listed, with its measured error distribution, so it can be fixed, widened, or stopped
from carrying a verdict.

"Shipped" is the operative word. Values the pipeline itself withheld - insufficient
data, unsupported, out of physical range - are not counted as wrong, because nobody
ever saw them. They are counted separately as coverage: a metric that is always
suppressed is 100% accurate and 0% useful, and both numbers have to be on the table.

    python scripts/certify_accuracy.py                 # 60 subjects, ~2 min
    python scripts/certify_accuracy.py --trials 200    # tighter intervals
    python scripts/certify_accuracy.py --bar 0.96 --json cert.json

ANSWERING "WOULD A BETTER POSE MODEL HELP?"

--jitter pins 2-D landmark noise and --world-error pins world-landmark error, which
turns a procurement question into a measurement. Sweep them and read the error column:
if a metric is already inside its tolerance at the noise level you have, a more accurate
detector moves it further inside a band it already clears and buys nothing.

Measured on this pipeline (p95 error, degrees):

    2-D landmark noise      0.25 px   1.0 px   2.0 px   3.0 px    tolerance
    trunk_angle                0.65     0.68     0.75     0.81          2.0
    shoulder_obliquity         0.38     0.23     0.48     0.71          1.5
    left_knee_angle            0.56     0.81     1.70     2.44          3.0

A twelve-fold improvement in landmark precision changes nothing that matters, because
the in-plane metrics are limited by capture geometry - camera roll, subject yaw - which
is corrected by averaging opposing views, not by better landmarks.

    world-landmark error     15 mm     8 mm     3 mm     1 mm    tolerance
    head yaw                  131.2     33.3      6.7      2.1          8.0
    foot progression           30.5     13.4      5.0      1.7          8.0

The transverse plane is the opposite story, and doubling the model's accuracy does not
reach it: only real depth does. 15 mm is roughly MediaPipe today, 3 mm is stereo or a
depth camera.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.gait.calibration_v2 import GaitAnalyser
from app.core.metrics.gait_registry import GAIT_METRICS
from app.core.metrics.registry import POSTURE_METRICS, Status
from app.core.metrics.tolerances import GAIT_TOLERANCE, POSTURE_TOLERANCE, UNGRADEABLE
from app.core.pose.calibration_v2 import PostureCalibrator
from app.core.validation.camera import Camera, emit_gait_frames, emit_pose_samples
from app.core.validation.gait_sequence import WalkParams, generate_walk
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import PROPORTIONS, Pose, build_skeleton

SHIPPED = {Status.MEASURED, Status.LOW_CONFIDENCE}

# Capture frame rates to sample. Overridden by --fps to certify a single rate, which is
# how you find out what a frame-rate change actually buys before shipping it.
# What a 60 fps REQUEST actually delivers across real devices. The capture loop shares
# a thread with MediaPipe inference, so a browser asked for 60 lands anywhere from the
# high 30s upward depending on the machine. Certifying against the request rather than
# against this spread would certify a device nobody has.
FPS_POOL = [38, 45, 52, 60, 60]

# Set by --jitter / --world-error to hold a noise source fixed. Used to answer "how
# much would a better pose model actually help", which is a measurable question about
# this pipeline rather than a question about model leaderboards.
PIN_JITTER = None
PIN_WORLD = None


def draw_conditions(rng: np.random.Generator) -> dict:
    """
    One plausible capture. Ranges span what a real deployment sees, not a best case.

    Landmark jitter of 0.5-3 px is MediaPipe on a well-lit to mediocre capture at this
    framing; the camera distance and focal length are chosen together so the subject
    fills a realistic fraction of the frame, because pixel noise only means something
    relative to how large the subject is.
    """
    width, height = rng.choice([(1280, 720), (1920, 1080), (640, 480)])
    dist = float(rng.uniform(3.5, 6.0))
    # Keep the subject between roughly a third and two thirds of the frame height.
    focal = float(rng.uniform(0.35, 0.62) * height * dist / 1.70)
    return {
        "width": int(width),
        "height": int(height),
        "distance": dist,
        "focal": focal,
        "jitter": float(PIN_JITTER if PIN_JITTER is not None else rng.uniform(0.5, 3.0)),
        # World-landmark error, CALIBRATED AGAINST LIVE CAPTURES rather than taken from
        # a published benchmark.
        #
        # This started at 6-18 mm, from the few-centimetre figures quoted for BlazePose.
        # Then a live report showed forward head position - the one shipped metric that
        # reads world landmarks - disagreeing by 0.16 between the two side views of the
        # same subject. Sweeping the model against that observation puts the implied
        # error above 50 mm, three to six times what was assumed. Some of that gap is
        # the subject re-settling between two captures taken seconds apart rather than
        # landmark error, so the truth is somewhere in between, and 25-50 mm is the
        # honest bracket. It is deliberately pessimistic: a certification built on an
        # optimistic noise model certifies nothing.
        #
        # The practical consequence is narrow, because preferring 2-D landmarks for
        # everything they can measure already routed almost every metric away from this
        # axis - a decision this calibration retrospectively makes look far more
        # important than the 2x it was justified on.
        "world_bias": float(PIN_WORLD if PIN_WORLD is not None else rng.uniform(0.025, 0.050)),
        "world_jitter": float(
            (PIN_WORLD / 3.0) if PIN_WORLD is not None else rng.uniform(0.002, 0.008)
        ),
        "fps": int(FPS_POOL[rng.integers(len(FPS_POOL))]),
    }


def draw_posture_pose(rng: np.random.Generator) -> Pose:
    """A subject with clinically interesting, and known, deviations."""
    return Pose(
        height_m=float(rng.uniform(1.50, 1.95)),
        trunk_lean_sagittal=float(rng.uniform(-6, 20)),
        trunk_lean_lateral=float(rng.uniform(-8, 8)),
        knee_flexion_left=float(rng.uniform(0, 15)),
        knee_flexion_right=float(rng.uniform(0, 15)),
        head_tilt=float(rng.uniform(-10, 10)),
        head_rotation=float(rng.uniform(-25, 25)),
        foot_progression_left=float(rng.uniform(-10, 25)),
        foot_progression_right=float(rng.uniform(-10, 25)),
        shoulder_height_asymmetry=float(rng.uniform(-0.05, 0.05)),
        pelvis_height_asymmetry=float(rng.uniform(-0.04, 0.04)),
    )


def posture_truth(pose: Pose) -> dict:
    """
    Truth for one posed subject. Angles that depend on more than one posture knob are
    measured off the built skeleton rather than restated in closed form here - the hip
    angle is shoulder-hip-knee, so a raised shoulder tilts it, and hand-deriving it
    put a 3 degree bias into what the certification was calling correct.
    """
    lm = build_skeleton(pose)

    def interior(a, b, c) -> float:
        u, v = lm[a] - lm[b], lm[c] - lm[b]
        return float(np.degrees(np.arccos(np.clip(
            u @ v / (np.linalg.norm(u) * np.linalg.norm(v)), -1.0, 1.0))))

    def mid_shoulder_angle(hip_i: int, knee_i: int) -> float:
        """
        Trunk-to-thigh angle in the SAGITTAL plane, which is the plane the metric is
        defined in and the only one a side view can see. Computing it in full 3-D
        instead drags in the medio-lateral offset between the midline trunk axis and a
        hip that sits 8 cm to the side - a 12.7 degree difference that is real geometry
        but is not hip flexion.
        """
        mid = (lm[11] + lm[12]) / 2.0
        u = np.array([mid[2] - lm[hip_i][2], mid[1] - lm[hip_i][1]])
        v = np.array([lm[knee_i][2] - lm[hip_i][2], lm[knee_i][1] - lm[hip_i][1]])
        return float(np.degrees(np.arccos(np.clip(
            u @ v / (np.linalg.norm(u) * np.linalg.norm(v)), -1.0, 1.0))))

    def frontal_tilt(left_i: int, right_i: int) -> float:
        """
        Tilt of a left-right segment from horizontal, signed the way the pipeline signs
        it: negative when the subject's LEFT side is the high one.

        Measured off the skeleton rather than derived from the pose knobs, because more
        than one knob feeds it. Lateral trunk lean rotates the shoulder bar as well as
        raising one shoulder, so a closed form written around shoulder_height_asymmetry
        alone silently became wrong the moment the subject draw started varying lean -
        and scored the pipeline at 28% when nothing about the pipeline had changed.
        """
        a, b = lm[left_i], lm[right_i]
        # Vertical difference over the ABSOLUTE horizontal separation, matching the
        # implementation. Using the signed horizontal component instead makes the truth
        # depend on which side of the frame each landmark falls on, which is the exact
        # handedness assumption that produced ~178 degree readings in production.
        rise = float(b[1]) - float(a[1])                       # right minus left, y up
        run = float(np.hypot(b[0] - a[0], b[2] - a[2]))
        return float(np.degrees(np.arctan2(rise, run)))

    def lateral_shift_ratio() -> float:
        mid_sh = (lm[11] + lm[12]) / 2.0
        mid_hip = (lm[23] + lm[24]) / 2.0
        width = float(np.linalg.norm(lm[11] - lm[12]))
        return float((mid_sh[0] - mid_hip[0]) / width) if width > 1e-9 else 0.0

    h = pose.height_m
    sh_span = 2 * PROPORTIONS["shoulder_half_width"] * h
    hip_span = 2 * PROPORTIONS["hip_half_width"] * h
    deg = lambda o, a: math.degrees(math.atan2(o, a))
    return {
        "trunk_angle": (pose.trunk_lean_sagittal, "signed"),
        "left_knee_angle": (interior(23, 25, 27), "signed"),
        "right_knee_angle": (interior(24, 26, 28), "signed"),
        # Mid-shoulder, matching the implementation: hip flexion is measured against
        # the trunk's midline axis, not the shoulder on the same side.
        "left_hip_angle": (mid_shoulder_angle(23, 25), "signed"),
        "right_hip_angle": (mid_shoulder_angle(24, 26), "signed"),
        "shoulder_obliquity": (frontal_tilt(11, 12), "signed"),
        "pelvic_obliquity": (frontal_tilt(23, 24), "signed"),
        "head_lateral_flexion": (frontal_tilt(7, 8), "signed"),
        "shoulder_hip_width_ratio": (sh_span / hip_span, "signed"),
        "leg_length_asymmetry_ratio": (0.0, "signed"),
        "trunk_lateral_shift_ratio": (lateral_shift_ratio(), "signed"),
        "knee_varus_valgus": (0.0, "signed"),
        "head_rotation": (pose.head_rotation, "signed"),
        "foot_progression_angle_left": (pose.foot_progression_left, "signed"),
        "foot_progression_angle_right": (pose.foot_progression_right, "signed"),
    }


def run_posture_trial(rng: np.random.Generator) -> list:
    pose = draw_posture_pose(rng)
    cond = draw_conditions(rng)
    points = build_skeleton(pose)
    cal = PostureCalibrator(normalised_input=True, aspect_ratio=cond["width"] / cond["height"])
    for view in ("front", "leftside", "rightside", "back"):
        cam = Camera(
            azimuth_deg=VIEW_AZIMUTH[view], distance_m=cond["distance"],
            target=(0.0, pose.height_m * 0.5, 0.0),
            image_width=cond["width"], image_height=cond["height"], focal_px=cond["focal"],
        )
        for raw in emit_pose_samples(
            points, cam, n_samples=60, jitter_px=cond["jitter"], include_world=True,
            jitter_m=cond["world_jitter"], world_bias_m=cond["world_bias"], rng=rng,
        ):
            cal.add_sample(
                {
                    "pose": {i: [v[0] / cond["width"], v[1] / cond["height"], v[2], v[3]]
                             for i, v in raw["pose"].items()},
                    "pose_world": {i: list(v) for i, v in raw["pose_world"].items()},
                },
                view=view,
            )
    return score(cal.finalize("cert"), posture_truth(pose), POSTURE_TOLERANCE, POSTURE_METRICS)


def draw_walk(rng: np.random.Generator, fps: int) -> WalkParams:
    return WalkParams(
        cadence_spm=float(rng.uniform(90, 125)),
        stride_length_m=float(rng.uniform(0.95, 1.45)),
        duration_s=float(rng.uniform(5.0, 9.0)),
        fps=fps,
        height_m=float(rng.uniform(1.50, 1.95)),
        stance_fraction=float(rng.uniform(0.57, 0.64)),
        step_width_m=float(rng.uniform(0.05, 0.20)),
        lateral_sway_m=float(rng.uniform(0.01, 0.04)),
        trunk_lean=float(rng.uniform(0.0, 8.0)),
        right_stride_scale=float(rng.uniform(0.94, 1.06)),
    )


def gait_truth(truth: dict) -> dict:
    leg = truth["leg_length_m"]
    sym = 100.0 * min(
        truth["step_length_left_to_right_m"], truth["step_length_right_to_left_m"]
    ) / max(truth["step_length_left_to_right_m"], truth["step_length_right_to_left_m"])
    return {
        "cadence": (60.0 / truth["step_time_s"], "signed"),
        "stride_time_left": (truth["stride_time_s"], "signed"),
        "stride_time_right": (truth["stride_time_s"], "signed"),
        "stance_phase_percent": (truth["stance_percent"], "signed"),
        "swing_phase_percent": (truth["swing_percent"], "signed"),
        "double_support_percent": (truth["double_support_percent"], "signed"),
        "step_width_ratio": (truth["step_width_ratio"], "signed"),
        "trunk_lateral_sway_ratio": (truth["lateral_sway_ratio"], "signed"),
        "stride_length_ratio": (truth["stride_length_m"] / leg, "signed"),
        "walking_speed_ratio": (truth["walking_speed_mps"] / leg, "signed"),
        "knee_flexion_max": (truth["knee_flexion_max"], "signed"),
        "knee_flexion_rom": (truth["knee_flexion_rom"], "signed"),
        "hip_flexion_max": (truth["hip_flexion_max"], "signed"),
        "hip_extension_max": (truth["hip_extension_max"], "signed"),
        "hip_flexion_rom": (truth["hip_flexion_rom"], "signed"),
        "trunk_sagittal_lean": (truth["trunk_lean"], "abs"),
        "gait_symmetry_index": (sym, "signed"),
        "step_length_symmetry": (sym, "signed"),
        "stride_time_variability": (0.0, "signed"),
        "gait_cycle_count": (float(len(truth["left_heel_strikes"]) - 1), "signed"),
    }


def run_gait_trial(rng: np.random.Generator) -> list:
    cond = draw_conditions(rng)
    params = draw_walk(rng, cond["fps"])
    frames, truth = generate_walk(params)
    travel = truth["walking_speed_mps"] * params.duration_s
    analyser = GaitAnalyser(fps=params.fps, aspect_ratio=cond["width"] / cond["height"])
    # Pull the camera back far enough that the whole walk stays in frame, which is what
    # a real operator has to do too.
    dist = max(cond["distance"], cond["focal"] * travel / cond["width"] * 1.15)
    # Azimuth 0 puts the camera on the subject's RIGHT, not their left: the walk runs
    # along +X facing +X, and for a right-handed frame that subject's right is +Z.
    # Labelling it "leftside" fed every gait test a right-side capture under the wrong
    # name. It did not corrupt any metric - the analyser picks its view by frame count
    # and its leg by cycle count, never by the label - but it is exactly the
    # mislabelling the new orientation check exists to catch, so the harness must not
    # be committing it.
    for view, azimuth in (("rightside", 0.0), ("front", -90.0)):
        cam = Camera(
            azimuth_deg=azimuth, distance_m=dist, target=(travel / 2, 0.9, 0.0),
            image_width=cond["width"], image_height=cond["height"], focal_px=cond["focal"],
        )
        analyser.add_view(
            view,
            emit_gait_frames(frames, cam, fps=params.fps, jitter_px=cond["jitter"], rng=rng),
        )
    return score(analyser.finalize("cert"), gait_truth(truth), GAIT_TOLERANCE, GAIT_METRICS)


def score(result, truth: dict, tolerances: dict, specs) -> list:
    rows = []
    for spec in specs:
        m = result.metrics.get(spec.key)
        if m is None:
            continue
        shipped = m.status in SHIPPED and m.value is not None
        entry = {"key": spec.key, "shipped": shipped, "status": m.status.value}
        if shipped and spec.key in truth and spec.key in tolerances:
            expected, mode = truth[spec.key]
            err = (abs(m.value) - abs(expected)) if mode == "abs" else (m.value - expected)
            entry["error"] = float(err)
            entry["within"] = abs(err) <= tolerances[spec.key]
        rows.append(entry)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=60)
    ap.add_argument("--bar", type=float, default=0.96, help="required within-tolerance rate")
    ap.add_argument("--seed", type=int, default=20260919)
    ap.add_argument("--jitter", type=float, default=None,
                    help="pin 2-D landmark noise (px) instead of sampling, to measure "
                         "what a more accurate pose model would buy")
    ap.add_argument("--world-error", type=float, default=None,
                    help="pin world-landmark systematic error (m), to measure what real "
                         "depth sensing would buy")
    ap.add_argument("--fps", type=int, default=None,
                    help="pin every capture to this frame rate instead of sampling")
    ap.add_argument("--ignore-retired", action="store_true",
                    help="score metrics the registry has retired, to see if a change revives them")
    ap.add_argument("--force-2d", action="store_true",
                    help="ignore world landmarks, to compare 2-D and 3-D accuracy")
    ap.add_argument("--json", type=str, default=None)
    args = ap.parse_args()

    global FPS_POOL, PIN_JITTER, PIN_WORLD
    PIN_JITTER = args.jitter
    PIN_WORLD = args.world_error
    if args.fps:
        FPS_POOL = [args.fps]
    if args.ignore_retired:
        # Re-enable retired metrics for this run only. A retirement is a statement about
        # a measured capability, so it has to be re-testable when the capability changes.
        from dataclasses import replace as _replace
        import app.core.metrics.gait_registry as _gr
        revived = [
            _replace(spec, unsupported_reason=None) if spec.key in _gr._RETIRED else spec
            for spec in _gr.GAIT_METRICS
        ]
        _gr.GAIT_METRICS[:] = revived
        GAIT_METRICS[:] = revived

    if args.force_2d:
        import app.core.pose.calibration_v2 as _pc
        _orig = _pc.PostureCalibrator._per_frame
        _pc.PostureCalibrator._per_frame = lambda self, spec, sample, view: _orig(
            self, spec, {**sample, "world": {}}, view
        )

    rng = np.random.default_rng(args.seed)
    stats = defaultdict(lambda: {"n": 0, "shipped": 0, "scored": 0, "within": 0, "errors": []})

    for i in range(args.trials):
        for rows in (run_posture_trial(rng), run_gait_trial(rng)):
            for r in rows:
                st = stats[r["key"]]
                st["n"] += 1
                st["shipped"] += int(r["shipped"])
                if "within" in r:
                    st["scored"] += 1
                    st["within"] += int(r["within"])
                    st["errors"].append(r["error"])
        if (i + 1) % 10 == 0:
            print(f"  ... {i + 1}/{args.trials} subjects", file=sys.stderr)

    tol = {**POSTURE_TOLERANCE, **GAIT_TOLERANCE}
    order = [s.key for s in POSTURE_METRICS] + [s.key for s in GAIT_METRICS]

    head = (f"{'metric':<30}{'shipped':>9}{'within tol':>12}{'bias':>9}"
            f"{'p95|err|':>10}{'tol':>8}  verdict")
    print(f"\n{'=' * 96}\nACCURACY CERTIFICATION - {args.trials} subjects, "
          f"bar = {args.bar:.0%} within tolerance\n{'=' * 96}")
    print(head + "\n" + "-" * 96)

    certified, failed, unscored = [], [], []
    payload = {}
    for key in order:
        st = stats.get(key)
        if not st or st["n"] == 0:
            continue
        ship_rate = st["shipped"] / st["n"]
        if st["scored"] == 0:
            print(f"{key:<30}{ship_rate:>8.0%}{'-':>12}{'-':>9}{'-':>10}{'-':>8}  NO GROUND TRUTH"
                  if st["shipped"] else
                  f"{key:<30}{ship_rate:>8.0%}{'-':>12}{'-':>9}{'-':>10}{'-':>8}  never shipped")
            unscored.append(key)
            continue
        errs = np.array(st["errors"])
        rate = st["within"] / st["scored"]
        bias = float(np.median(errs))
        p95 = float(np.percentile(np.abs(errs), 95))
        ok = rate >= args.bar
        (certified if ok else failed).append(key)
        payload[key] = {"shipped_rate": ship_rate, "within_rate": rate, "bias": bias,
                        "p95_abs_error": p95, "tolerance": tol[key], "n": st["scored"]}
        print(f"{key:<30}{ship_rate:>8.0%}{rate:>11.0%}{bias:>+9.2f}{p95:>10.2f}"
              f"{tol[key]:>8.2f}  {'CERTIFIED' if ok else 'BELOW BAR'}")

    print("-" * 96)
    print(f"  CERTIFIED at >={args.bar:.0%}   {len(certified):>3}  {', '.join(certified)}")
    print(f"  BELOW BAR             {len(failed):>3}  {', '.join(failed) or '-'}")
    print(f"  no ground truth       {len(unscored):>3}  {', '.join(unscored) or '-'}")

    print(f"\n{'=' * 96}\nGRADING SAFETY - metrics whose tolerance is wider than their "
          f"normal range\n{'=' * 96}")
    for key, why in UNGRADEABLE.items():
        print(f"  {key:<28} {why}")
    print("  These must be shown as numbers without a normal/abnormal badge: the verdict")
    print("  would be decided by measurement error rather than by the patient.")

    if args.json:
        Path(args.json).write_text(json.dumps(payload, indent=2))
        print(f"\nwrote {args.json}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
