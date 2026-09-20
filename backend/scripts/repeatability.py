"""
Test-retest repeatability: how much does a metric move when nothing about the patient
has?

Accuracy says how close one measurement is to the truth. Repeatability says whether two
measurements of the same unchanged person agree - and that is the number the product
actually needs, because the feature clinicians use most is "compare to last visit". A
metric with a 6 degree accuracy but a 9 degree spread between sessions cannot support
that comparison at all: every patient will appear to change.

What this computes, per metric:

  SEM   standard error of measurement - the within-subject SD across repeat sessions
  MDC95 minimal detectable change = 1.96 * sqrt(2) * SEM
        The threshold a change must EXCEED before it means anything. Below it, the
        difference between two visits is indistinguishable from measuring twice.
  ICC   intraclass correlation (2,1), the share of total variance that is real
        between-subject difference rather than measurement error. Below ~0.75 the
        metric cannot rank patients reliably, whatever its accuracy.

        ICC is a property of the METRIC AND THE POPULATION, not of the metric alone. A
        metric measured on subjects who barely differ in it scores a low ICC however
        precise it is, because there is no between-subject signal for the error to be
        small relative to. Any metric the synthetic subject draw does not vary - it has
        no knee varus/valgus knob, for instance - will look unreliable here for that
        reason and that reason only. Read a low ICC as "check whether this population
        varies in it", not as a verdict. SEM and MDC95 do not have this problem: they
        are absolute, and are the numbers to act on.

Each "session" re-draws everything that changes between two real visits and nothing
that does not: same subject, same posture, new camera placement, new distance, new
lighting-driven noise level, new random seed. What it deliberately does NOT re-draw is
the subject - so all the variance measured here is measurement error.

    python scripts/repeatability.py                    # 30 subjects x 4 sessions
    python scripts/repeatability.py --subjects 60 --sessions 5 --json mdc.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.metrics.gait_registry import GAIT_METRICS
from app.core.metrics.registry import POSTURE_METRICS, Status
from app.core.metrics.tolerances import GAIT_TOLERANCE, POSTURE_TOLERANCE
from scripts.certify_accuracy import (
    SHIPPED,
    draw_conditions,
    draw_posture_pose,
    draw_walk,
    run_gait_trial,
    run_posture_trial,
)
from app.core.gait.calibration_v2 import GaitAnalyser
from app.core.pose.calibration_v2 import PostureCalibrator
from app.core.validation.camera import Camera, emit_gait_frames, emit_pose_samples
from app.core.validation.gait_sequence import generate_walk
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import Pose, build_skeleton


def posture_session(pose: Pose, rng: np.random.Generator) -> dict:
    """One posture screening of a fixed subject under freshly drawn capture conditions."""
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
    result = cal.finalize("retest")
    return {
        k: m.value for k, m in result.metrics.items()
        if m.status in SHIPPED and m.value is not None
    }


def gait_session(params, rng: np.random.Generator) -> dict:
    """One gait screening of a fixed walk under freshly drawn capture conditions."""
    cond = draw_conditions(rng)
    frames, truth = generate_walk(params)
    travel = truth["walking_speed_mps"] * params.duration_s
    analyser = GaitAnalyser(fps=params.fps, aspect_ratio=cond["width"] / cond["height"])
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
    result = analyser.finalize("retest")
    return {
        k: m.value for k, m in result.metrics.items()
        if m.status in SHIPPED and m.value is not None
    }


def icc_and_sem(by_subject: list) -> tuple:
    """
    ICC(2,1) and SEM from a subjects x sessions matrix of repeated measurements.

    One-way random effects decomposition: total variance splits into between-subject
    variance (the signal a screening tool is for) and within-subject variance (what it
    adds). Subjects measured in fewer than two sessions are dropped, since they say
    nothing about repeatability.
    """
    rows = [np.asarray(v, dtype=float) for v in by_subject if len(v) >= 2]
    if len(rows) < 3:
        return None, None, 0
    n = min(len(r) for r in rows)
    mat = np.array([r[:n] for r in rows])
    k, subjects = n, mat.shape[0]

    subject_means = mat.mean(axis=1)
    grand = mat.mean()
    ms_between = k * np.sum((subject_means - grand) ** 2) / (subjects - 1)
    ms_within = np.sum((mat - subject_means[:, None]) ** 2) / (subjects * (k - 1))

    sem = float(np.sqrt(ms_within))
    denom = ms_between + (k - 1) * ms_within
    icc = float((ms_between - ms_within) / denom) if denom > 0 else 0.0
    return max(-1.0, min(1.0, icc)), sem, subjects


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subjects", type=int, default=30)
    ap.add_argument("--sessions", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--json", type=str, default=None)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    repeats = defaultdict(list)

    for i in range(args.subjects):
        pose = draw_posture_pose(rng)
        walk = draw_walk(rng, int(rng.choice([45, 52, 60, 60])))
        per_metric = defaultdict(list)
        for _ in range(args.sessions):
            for key, value in {**posture_session(pose, rng), **gait_session(walk, rng)}.items():
                per_metric[key].append(value)
        for key, values in per_metric.items():
            repeats[key].append(values)
        if (i + 1) % 10 == 0:
            print(f"  ... {i + 1}/{args.subjects} subjects", file=sys.stderr)

    tol = {**POSTURE_TOLERANCE, **GAIT_TOLERANCE}
    order = [s.key for s in POSTURE_METRICS] + [s.key for s in GAIT_METRICS]

    print(f"\n{'=' * 100}\nTEST-RETEST REPEATABILITY - {args.subjects} subjects x "
          f"{args.sessions} sessions\n{'=' * 100}")
    head = f"{'metric':<30}{'ICC':>8}{'SEM':>9}{'MDC95':>9}{'tol':>8}  verdict"
    print(head + "\n" + "-" * 100)

    payload, usable, unusable = {}, [], []
    for key in order:
        rows = repeats.get(key)
        if not rows:
            continue
        icc, sem, n = icc_and_sem(rows)
        if icc is None:
            continue
        mdc = 1.96 * np.sqrt(2) * sem
        limit = tol.get(key)
        # A metric is usable for tracking change when repeat sessions agree well enough
        # to rank patients (ICC >= 0.75) and its MDC is inside its own accuracy budget.
        ok = icc >= 0.75 and (limit is None or mdc <= 2 * limit)
        (usable if ok else unusable).append(key)
        payload[key] = {"icc": icc, "sem": sem, "mdc95": float(mdc),
                        "tolerance": limit, "subjects": n}
        print(f"{key:<30}{icc:>8.2f}{sem:>9.3f}{mdc:>9.3f}"
              f"{(limit if limit is not None else float('nan')):>8.2f}  "
              f"{'TRACKS CHANGE' if ok else 'SINGLE READING ONLY'}")

    print("-" * 100)
    print(f"  TRACKS CHANGE        {len(usable):>3}  {', '.join(usable) or '-'}")
    print(f"  SINGLE READING ONLY  {len(unusable):>3}  {', '.join(unusable) or '-'}")
    print("\n  MDC95 is the change a follow-up must EXCEED to mean anything. Show it")
    print("  next to any visit-to-visit comparison; a smaller difference is noise.")
    print("  'SINGLE READING ONLY' metrics must not drive a progress claim at all.")

    if args.json:
        Path(args.json).write_text(json.dumps(payload, indent=2))
        print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
