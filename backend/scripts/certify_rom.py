"""
Accuracy certification for range of motion.

Separate from certify_accuracy.py because ROM is a different capture: one end-range hold
per movement, scored on its own, rather than one standing pose scored across every
metric at once. Bolting it onto the posture run would have meant certifying a subject
holding every joint at end range simultaneously - a scenario no clinic produces.

Same bar, same method: a randomised population of subjects and capture conditions, and a
non-zero exit when any metric fails to land within its tolerance often enough.

    python scripts/certify_rom.py --trials 120
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.metrics.pose_rom_shim import run_rom_trial
from app.core.metrics.rom_registry import ROM_METRICS
from app.core.metrics.tolerances import ROM_TOLERANCE


def draw_conditions(rng: np.random.Generator) -> dict:
    width, height = [(1280, 720), (1920, 1080), (640, 480)][rng.integers(3)]
    dist = float(rng.uniform(3.5, 6.0))
    return {
        "width": int(width),
        "height": int(height),
        "distance": dist,
        "focal": float(rng.uniform(0.35, 0.62) * height * dist / 1.70),
        "jitter": float(rng.uniform(0.5, 3.0)),
        # Calibrated against live captures, same as the posture run.
        "world_bias": float(rng.uniform(0.025, 0.050)),
        "world_jitter": float(rng.uniform(0.008, 0.017)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=60)
    ap.add_argument("--bar", type=float, default=0.96)
    ap.add_argument("--seed", type=int, default=20260920)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    stats = defaultdict(lambda: {"n": 0, "shipped": 0, "scored": 0, "within": 0, "errs": []})

    for i in range(args.trials):
        for row in run_rom_trial(rng, draw_conditions(rng)):
            s = stats[row["key"]]
            s["n"] += 1
            s["shipped"] += int(row["shipped"])
            if "error" in row:
                s["scored"] += 1
                s["errs"].append(row["error"])
                s["within"] += int(abs(row["error"]) <= ROM_TOLERANCE[row["key"]])
        if (i + 1) % 20 == 0:
            print(f"  ... {i + 1}/{args.trials} subjects", file=sys.stderr)

    print(f"\n{'=' * 88}\nROM CERTIFICATION - {args.trials} subjects, "
          f"bar = {args.bar:.0%} within tolerance\n{'=' * 88}")
    head = f"{'metric':<32}{'shipped':>9}{'within tol':>12}{'bias':>9}{'p95|err|':>10}{'tol':>7}  verdict"
    print(head + "\n" + "-" * 88)

    certified, failed = [], []
    for spec in ROM_METRICS:
        s = stats.get(spec.key)
        if not spec.is_supported:
            print(f"{spec.key:<32}{'-':>9}{'-':>12}{'-':>9}{'-':>10}{'-':>7}  UNSUPPORTED")
            continue
        if not s or not s["scored"]:
            print(f"{spec.key:<32}{'-':>9}{'-':>12}{'-':>9}{'-':>10}{'-':>7}  NOT EXERCISED")
            continue
        errs = np.array(s["errs"])
        rate = s["within"] / s["scored"]
        ok = rate >= args.bar
        (certified if ok else failed).append(spec.key)
        print(f"{spec.key:<32}{s['shipped'] / s['n']:>8.0%}{rate:>11.0%}"
              f"{float(np.median(errs)):>+9.2f}{float(np.percentile(np.abs(errs), 95)):>10.2f}"
              f"{ROM_TOLERANCE[spec.key]:>7.1f}  {'CERTIFIED' if ok else 'BELOW BAR'}")

    print("-" * 88)
    print(f"  CERTIFIED at >={args.bar:.0%}   {len(certified):>3}")
    print(f"  BELOW BAR             {len(failed):>3}  {', '.join(failed) or '-'}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
