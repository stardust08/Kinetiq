"""
Offline accuracy report for every posture and gait metric we ship.

Poses a synthetic subject at KNOWN angles, projects it through a KNOWN camera in the
exact payload shape the browser sends, runs the PRODUCTION calibrators
(PostureCalibrator / GaitAnalyser), and prints value-vs-truth for every metric in the
registries.

Unlike the pytest suite - which asserts a handful of metrics - this prints the WHOLE
registry, so a metric that is never scored against ground truth shows up as
"UNVALIDATED" instead of silently passing. That list is the honest coverage gap.

No database, no HTTP, no MediaPipe needed. Just numpy + scipy.

    python scripts/metric_accuracy_report.py
    python scripts/metric_accuracy_report.py --jitter 4.0     # detector-noise sweep
    python scripts/metric_accuracy_report.py --json out.json  # machine-readable
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.gait.calibration_v2 import GaitAnalyser
from app.core.metrics.gait_registry import GAIT_METRICS
from app.core.metrics.registry import POSTURE_METRICS, Status
from app.core.pose.calibration_v2 import PostureCalibrator
from app.core.validation.camera import Camera, emit_gait_frames, emit_pose_samples
from app.core.validation.gait_sequence import WalkParams, generate_walk
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import PROPORTIONS, Pose, build_skeleton

WIDTH, HEIGHT = 1280, 720
FPS = 30
H = 1.70

# --- the subject we pose -----------------------------------------------------
# Deliberately asymmetric and off-neutral: a subject standing perfectly straight
# cannot expose a sign error, and a zero expected value cannot expose a scale error.
TRUTH_POSE = Pose(
    height_m=H,
    trunk_lean_sagittal=12.0,
    knee_flexion_right=20.0,
    knee_flexion_left=0.0,
    head_tilt=5.0,
    shoulder_height_asymmetry=0.03,   # subject's LEFT shoulder 3 cm high
    pelvis_height_asymmetry=0.02,     # subject's LEFT hip 2 cm high
)
TRUTH_WALK = WalkParams(cadence_spm=110.0, duration_s=6.0, fps=FPS, height_m=H)

SHOULDER_SPAN = 2 * PROPORTIONS["shoulder_half_width"] * H
HIP_SPAN = 2 * PROPORTIONS["hip_half_width"] * H
EAR_SPAN = 2 * PROPORTIONS["ear_half_width"] * H
LEG_LEN = (PROPORTIONS["thigh"] + PROPORTIONS["shank"]) * H


def _deg(opposite: float, adjacent: float) -> float:
    return math.degrees(math.atan2(opposite, adjacent))


# key -> (expected value, comparison mode, tolerance)
#   "signed" compares value directly; "abs" compares magnitude only, because the
#   sign convention for that family is asserted separately in test_harness.py.
POSTURE_TRUTH = {
    "trunk_angle":          (TRUTH_POSE.trunk_lean_sagittal, "signed", 2.0),
    "left_knee_angle":      (180.0 - TRUTH_POSE.knee_flexion_left, "signed", 2.0),
    "right_knee_angle":     (180.0 - TRUTH_POSE.knee_flexion_right, "signed", 2.0),
    # Interior shoulder-hip-knee angle: trunk lean closes it by the lean angle.
    "left_hip_angle":       (180.0 - TRUTH_POSE.trunk_lean_sagittal - TRUTH_POSE.hip_flexion_left, "signed", 3.0),
    "right_hip_angle":      (180.0 - TRUTH_POSE.trunk_lean_sagittal - TRUTH_POSE.hip_flexion_right, "signed", 3.0),
    "shoulder_obliquity":   (_deg(TRUTH_POSE.shoulder_height_asymmetry, SHOULDER_SPAN), "abs", 1.5),
    "pelvic_obliquity":     (_deg(TRUTH_POSE.pelvis_height_asymmetry, HIP_SPAN), "abs", 1.5),
    "head_lateral_flexion": (TRUTH_POSE.head_tilt, "abs", 2.0),
    "shoulder_hip_width_ratio": (SHOULDER_SPAN / HIP_SPAN, "signed", 0.1),
    "leg_length_asymmetry_ratio": (0.0, "signed", 0.02),
    "trunk_lateral_shift_ratio": (0.0, "signed", 0.05),
    "knee_varus_valgus":    (0.0, "signed", 2.0),
    "head_rotation":        (TRUTH_POSE.head_rotation, "abs", 3.0),
    # thoracic_kyphosis_angle and forward_head_ratio are surface proxies with no
    # closed-form truth in this skeleton: the neck is a straight segment, so there is
    # no curvature to recover. They are reported but NOT scored - see the gap list.
}

def gait_truth(truth: dict) -> dict:
    """
    key -> (expected, comparison mode, tolerance), sourced from the generator.

    Everything here now comes from the walk's own ground truth rather than being
    re-derived by hand, so the generator is the single source of truth and the two
    cannot drift apart. The four temporal metrics at the top only became scoreable
    once gait_sequence gained a foot-contact schedule.
    """
    return {
        "cadence":                (TRUTH_WALK.cadence_spm, "signed", 4.0),
        "stride_time_left":       (truth["stride_time_s"], "signed", 0.08),
        "stride_time_right":      (truth["stride_time_s"], "signed", 0.08),
        "stance_phase_percent":   (truth["stance_percent"], "signed", 4.0),
        "swing_phase_percent":    (truth["swing_percent"], "signed", 4.0),
        "double_support_percent": (truth["double_support_percent"], "signed", 5.0),
        "step_width_ratio":       (truth["step_width_ratio"], "signed", 0.05),
        "trunk_lateral_sway_ratio": (truth["lateral_sway_ratio"], "signed", 0.08),
        "stride_length_ratio":    (truth["stride_length_m"] / truth["leg_length_m"], "signed", 0.25),
        "walking_speed_ratio":    (truth["walking_speed_mps"] / truth["leg_length_m"], "signed", 0.25),
        "knee_flexion_max":       (truth["knee_flexion_max"], "signed", 4.0),
        "knee_flexion_rom":       (truth["knee_flexion_rom"], "signed", 5.0),
        "hip_flexion_max":        (truth["hip_flexion_max"], "signed", 4.0),
        "hip_extension_max":      (truth["hip_extension_max"], "signed", 4.0),
        "hip_flexion_rom":        (truth["hip_flexion_rom"], "signed", 5.0),
        "trunk_sagittal_lean":    (truth["trunk_lean"], "abs", 3.0),
        "gait_symmetry_index":    (100.0, "signed", 6.0),
        "step_length_symmetry":   (100.0, "signed", 6.0),
        "stride_time_variability": (0.0, "signed", 3.0),
        "gait_cycle_count":       (float(len(truth["left_heel_strikes"]) - 1), "signed", 1.5),
        "foot_progression_angle_left":  (0.0, "abs", 8.0),
        "foot_progression_angle_right": (0.0, "abs", 8.0),
    }


def run_posture(jitter_px: float, n: int = 60) -> "PostureResult":
    points = build_skeleton(TRUTH_POSE)
    rng = np.random.default_rng(42)
    cal = PostureCalibrator(normalised_input=True, aspect_ratio=WIDTH / HEIGHT)
    for view in ("front", "leftside", "rightside", "back"):
        cam = Camera(
            azimuth_deg=VIEW_AZIMUTH[view],
            image_width=WIDTH, image_height=HEIGHT, focal_px=min(WIDTH, HEIGHT),
        )
        for raw in emit_pose_samples(
            points, cam, n_samples=n, jitter_px=jitter_px, include_world=True,
            jitter_m=jitter_px * 0.002, rng=rng,
        ):
            cal.add_sample(
                {
                    "pose": {i: [v[0] / WIDTH, v[1] / HEIGHT, v[2], v[3]] for i, v in raw["pose"].items()},
                    "pose_world": {i: list(v) for i, v in raw["pose_world"].items()},
                },
                view=view,
            )
    return cal.finalize(person_id="accuracy-report")


def run_gait(jitter_px: float):
    frames, truth = generate_walk(TRUTH_WALK)
    travel = TRUTH_WALK.walking_speed_mps * TRUTH_WALK.duration_s
    rng = np.random.default_rng(7)
    analyser = GaitAnalyser(fps=FPS, aspect_ratio=WIDTH / HEIGHT)
    # Azimuth 0 puts the camera on the subject's RIGHT, not their left: the walk runs
    # along +X facing +X, and for a right-handed frame that subject's right is +Z.
    # Labelling it "leftside" fed every gait test a right-side capture under the wrong
    # name. It did not corrupt any metric - the analyser picks its view by frame count
    # and its leg by cycle count, never by the label - but it is exactly the
    # mislabelling the new orientation check exists to catch, so the harness must not
    # be committing it.
    for view, azimuth in (("rightside", 0.0), ("front", -90.0)):
        cam = Camera(
            azimuth_deg=azimuth, distance_m=10.0, target=(travel / 2, 0.9, 0.0),
            image_width=WIDTH, image_height=HEIGHT, focal_px=min(WIDTH, HEIGHT),
        )
        analyser.add_view(view, emit_gait_frames(frames, cam, fps=FPS, jitter_px=jitter_px, rng=rng))
    return analyser.finalize(person_id="accuracy-report"), truth


def report(title, metrics_result, specs, truth_map):
    rows, buckets = [], {"PASS": [], "FAIL": [], "UNVALIDATED": [], "NO VALUE": []}
    print(f"\n{'=' * 104}\n{title}\n{'=' * 104}")
    head = (f"{'metric':<30}{'status':<19}{'value':>10}{'expected':>10}"
            f"{'err':>9}{'spread':>8}  {'view':<10}  verdict")
    print(head + "\n" + "-" * 104)

    for spec in specs:
        m = metrics_result.metrics.get(spec.key)
        value = m.value if m else None
        status = m.status.value if m else "absent"
        spread = m.spread if m else None
        view = (m.view_used or "-") if m else "-"

        expected = err = None
        if spec.key in truth_map and value is not None:
            expected, mode, tol = truth_map[spec.key]
            err = (abs(value) - abs(expected)) if mode == "abs" else (value - expected)
            verdict = "PASS" if abs(err) <= tol else f"FAIL (tol {tol})"
        elif value is None:
            verdict = "NO VALUE"
        else:
            verdict = "UNVALIDATED"

        bucket = "FAIL" if verdict.startswith("FAIL") else verdict
        buckets[bucket].append(spec.key)
        rows.append({
            "key": spec.key, "status": status, "value": value,
            "expected": expected, "error": err, "spread": spread,
            "view": view, "verdict": verdict,
        })

        f = lambda v, w=10, p=2: (" " * (w - 1) + "-") if v is None else f"{v:>{w}.{p}f}"
        print(f"{spec.key:<30}{status:<19}{f(value)}{f(expected)}"
              f"{f(err, 9)}{f(spread, 8)}  {view:<10}  {verdict}")

    print("-" * 104)
    for name in ("PASS", "FAIL", "UNVALIDATED", "NO VALUE"):
        keys = buckets[name]
        print(f"  {name:<12} {len(keys):>2}  {', '.join(keys) if keys else '-'}")
    return rows, buckets


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jitter", type=float, default=1.5,
                    help="landmark noise in pixels (MediaPipe realistic: 1-3)")
    ap.add_argument("--json", type=str, default=None)
    args = ap.parse_args()

    print(f"Synthetic subject @ {WIDTH}x{HEIGHT}, {FPS} fps, landmark jitter {args.jitter} px")
    print(f"Posed: trunk {TRUTH_POSE.trunk_lean_sagittal} deg fwd, R knee "
          f"{TRUTH_POSE.knee_flexion_right} deg flexed, L shoulder "
          f"{TRUTH_POSE.shoulder_height_asymmetry * 100:.0f} cm high, head tilt {TRUTH_POSE.head_tilt} deg")
    print(f"Walk:  {TRUTH_WALK.cadence_spm} steps/min, stride {TRUTH_WALK.stride_length_m} m, "
          f"{TRUTH_WALK.duration_s} s")

    p_rows, p_buckets = report("POSTURE", run_posture(args.jitter), POSTURE_METRICS, POSTURE_TRUTH)
    gait_result, walk_truth = run_gait(args.jitter)
    g_rows, g_buckets = report("GAIT", gait_result, GAIT_METRICS, gait_truth(walk_truth))

    failures = p_buckets["FAIL"] + g_buckets["FAIL"]
    print(f"\n{'=' * 104}")
    print(f"TOTAL  scored-and-correct {len(p_buckets['PASS']) + len(g_buckets['PASS'])}"
          f" | wrong {len(failures)}"
          f" | measured-but-never-scored {len(p_buckets['UNVALIDATED']) + len(g_buckets['UNVALIDATED'])}"
          f" | no value {len(p_buckets['NO VALUE']) + len(g_buckets['NO VALUE'])}")
    if failures:
        print(f"WRONG: {', '.join(failures)}")

    if args.json:
        Path(args.json).write_text(json.dumps({"posture": p_rows, "gait": g_rows}, indent=2))
        print(f"wrote {args.json}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
