"""
Score the pipeline against human reference measurements.

Everything else in this repo validates the pipeline against SYNTHETIC ground truth: a
skeleton posed at known angles, projected through a known camera. That proves the
arithmetic is right given correct landmarks. It cannot prove MediaPipe puts landmarks
in the right place on a real body, because there is no real body in it. Clothing, body
shape, lighting and skin tone all move landmarks, and no amount of synthetic testing
sees any of that.

This script closes that gap, given data. You supply paired measurements - what a
clinician measured with a goniometer or tape, and what the app reported for the same
subject on the same day - and it reports whether the two agree well enough to act on.

    python scripts/clinical_validation.py --template validation.csv   # blank sheet
    python scripts/clinical_validation.py --data validation.csv       # score it

WHAT IT REPORTS, AND WHY THESE STATISTICS

  bias        mean(app - reference). A systematic offset. Correctable: if the app reads
              3 degrees high on every subject, subtract 3. Correlation does NOT reveal
              this - a metric reading exactly double the truth correlates perfectly.
  LoA         95% limits of agreement (Bland-Altman): bias +/- 1.96 * SD of the
              differences. The range within which a single patient's app measurement
              will sit relative to their true value, 95% of the time. This is the
              number to quote, and the number to compare against the metric's clinical
              tolerance.
  ICC(2,1)    agreement, not correlation. Pearson's r is the wrong statistic here and
              is the one usually reported: it is insensitive to both bias and scale.
  n           subjects. Below about 15 the limits of agreement are too wide to mean
              much; report the interval, not just the point estimate.

The verdict compares the limits of agreement against the same tolerance the synthetic
certification uses, so a metric certified there and validated here is held to one
standard rather than two.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.metrics.gait_registry import GAIT_METRICS
from app.core.metrics.registry import POSTURE_METRICS
from app.core.metrics.tolerances import GAIT_TOLERANCE, POSTURE_TOLERANCE

COLUMNS = [
    "subject_id", "session_date", "metric_key", "reference_value", "app_value",
    "rater_id", "reference_method", "notes",
]

# Metrics a clinician can actually measure by hand, and how. Anything not on this list
# either has no bedside reference (ratios normalised to leg length) or needs equipment
# a validation visit will not have (force plate, motion capture).
REFERENCE_METHODS = {
    "trunk_angle": "Goniometer, lateral view: trunk segment vs vertical, subject standing relaxed",
    "left_knee_angle": "Goniometer: greater trochanter - lateral femoral epicondyle - lateral malleolus",
    "right_knee_angle": "Goniometer: greater trochanter - lateral femoral epicondyle - lateral malleolus",
    "left_hip_angle": "Goniometer: mid-trunk - greater trochanter - lateral femoral epicondyle",
    "right_hip_angle": "Goniometer: mid-trunk - greater trochanter - lateral femoral epicondyle",
    "shoulder_obliquity": "Tape: acromion height difference, converted to degrees over acromion span",
    "pelvic_obliquity": "Tape: iliac crest height difference, converted over ASIS span",
    "head_lateral_flexion": "Goniometer: inter-ear line vs horizontal, or inclinometer at C7",
    "knee_varus_valgus": "Goniometer, frontal: ASIS - patella centre - ankle mortise centre",
    "leg_length_asymmetry_ratio": "Tape: ASIS to medial malleolus, both sides, supine",
    "cadence": "Stopwatch: count steps over 30 s of steady walking, x2",
    "stride_time_left": "Derived from cadence; or instrumented walkway if available",
    "stride_time_right": "Derived from cadence; or instrumented walkway if available",
    "stride_length_ratio": "Tape: distance over 10 strides / 10, divided by measured leg length",
    "walking_speed_ratio": "Stopwatch over a measured 10 m, divided by measured leg length",
    "step_width_ratio": "Chalk or ink footprints over 10 m, divided by measured leg length",
    "knee_flexion_max": "Requires 2-D video with manual digitisation, or motion capture",
    "hip_flexion_max": "Requires 2-D video with manual digitisation, or motion capture",
    "stance_phase_percent": "Requires a pressure mat or force plate - not a bedside measure",
    "swing_phase_percent": "Requires a pressure mat or force plate - not a bedside measure",
    "double_support_percent": "Requires a pressure mat or force plate - not a bedside measure",
}


def write_template(path: Path) -> None:
    rows = []
    for key, method in REFERENCE_METHODS.items():
        rows.append({
            "subject_id": "", "session_date": "", "metric_key": key,
            "reference_value": "", "app_value": "", "rater_id": "",
            "reference_method": method, "notes": "",
        })
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote a blank sheet to {path}\n")
    print("One row per (subject, metric). Fill reference_value and app_value; leave a")
    print("row blank to skip that metric for that subject. Copy the block per subject.\n")
    print("Protocol notes that change the result more than the statistics do:")
    print("  - Measure the reference BEFORE the app run, and have the rater blind to the")
    print("    app's output. A rater who has seen the number will move toward it.")
    print("  - Two raters on at least a third of subjects, so inter-rater disagreement")
    print("    can be separated from app error. A goniometer is not ground truth either.")
    print("  - Do not reposition the subject between the two measurements.")
    print("  - Record failures. A capture the app refused is a result, not a dropout:")
    print("    excluding them reports the accuracy of the captures that happened to work.")


def icc_2_1(reference: np.ndarray, app: np.ndarray) -> float:
    """Two-way random, single measure, absolute agreement."""
    mat = np.column_stack([reference, app])
    n, k = mat.shape
    grand = mat.mean()
    ms_rows = k * np.sum((mat.mean(axis=1) - grand) ** 2) / (n - 1)
    ms_cols = n * np.sum((mat.mean(axis=0) - grand) ** 2) / (k - 1)
    residual = mat - mat.mean(axis=1)[:, None] - mat.mean(axis=0)[None, :] + grand
    ms_err = np.sum(residual ** 2) / ((n - 1) * (k - 1))
    denom = ms_rows + (k - 1) * ms_err + k * (ms_cols - ms_err) / n
    return float((ms_rows - ms_err) / denom) if denom > 0 else 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", type=str, help="write a blank data-collection sheet")
    ap.add_argument("--data", type=str, help="score a completed sheet")
    ap.add_argument("--min-subjects", type=int, default=15)
    args = ap.parse_args()

    if args.template:
        write_template(Path(args.template))
        return 0
    if not args.data:
        ap.error("pass --template to start a study or --data to score one")

    path = Path(args.data)
    if not path.exists():
        print(f"No such file: {path}", file=sys.stderr)
        return 2

    paired = defaultdict(list)
    skipped = 0
    with path.open() as fh:
        for row in csv.DictReader(fh):
            try:
                ref = float(row["reference_value"])
                app = float(row["app_value"])
            except (TypeError, ValueError):
                skipped += 1
                continue
            paired[row["metric_key"].strip()].append((ref, app))

    if not paired:
        print("No completed rows found. Fill reference_value and app_value and re-run.")
        return 1

    tol = {**POSTURE_TOLERANCE, **GAIT_TOLERANCE}
    order = [s.key for s in POSTURE_METRICS] + [s.key for s in GAIT_METRICS]

    print(f"\n{'=' * 104}\nCLINICAL VALIDATION vs HUMAN REFERENCE\n{'=' * 104}")
    print(f"{skipped} incomplete row(s) skipped\n")
    head = (f"{'metric':<28}{'n':>4}{'bias':>9}{'LoA low':>10}{'LoA high':>10}"
            f"{'ICC':>7}{'tol':>8}  verdict")
    print(head + "\n" + "-" * 104)

    agree, disagree, underpowered = [], [], []
    for key in order:
        pairs = paired.get(key)
        if not pairs:
            continue
        ref = np.array([p[0] for p in pairs], dtype=float)
        app = np.array([p[1] for p in pairs], dtype=float)
        diff = app - ref
        bias = float(diff.mean())
        sd = float(diff.std(ddof=1)) if diff.size > 1 else 0.0
        lo, hi = bias - 1.96 * sd, bias + 1.96 * sd
        icc = icc_2_1(ref, app) if diff.size > 2 else float("nan")
        limit = tol.get(key)

        if diff.size < args.min_subjects:
            verdict = f"UNDERPOWERED (n<{args.min_subjects})"
            underpowered.append(key)
        elif limit is not None and max(abs(lo), abs(hi)) <= limit:
            verdict = "AGREES"
            agree.append(key)
        else:
            verdict = "EXCEEDS TOLERANCE"
            disagree.append(key)

        print(f"{key:<28}{diff.size:>4}{bias:>+9.2f}{lo:>10.2f}{hi:>10.2f}"
              f"{icc:>7.2f}{(limit if limit else float('nan')):>8.2f}  {verdict}")

    print("-" * 104)
    print(f"  AGREES with reference   {len(agree):>3}  {', '.join(agree) or '-'}")
    print(f"  EXCEEDS TOLERANCE       {len(disagree):>3}  {', '.join(disagree) or '-'}")
    print(f"  UNDERPOWERED            {len(underpowered):>3}  {', '.join(underpowered) or '-'}")
    print("\n  Only metrics marked AGREES may be described as clinically validated.")
    print("  A large bias is correctable; wide limits of agreement are not.")
    return 1 if disagree else 0


if __name__ == "__main__":
    raise SystemExit(main())
