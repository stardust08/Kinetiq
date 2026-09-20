"""
End-to-end screening check against a running API.

Drives the real HTTP endpoints with a synthetic subject posed at KNOWN angles, then
compares what the API stored against what we posed. Unlike the unit tests, this
exercises the full path: HTTP -> auth -> service -> calibrator -> Postgres -> response.

The subject is deliberately given a posture we can score:
    trunk lean          14 deg forward
    left shoulder high  ~4 deg  (0.03 m elevation)
    knees               straight (180 deg)
and a walk at a known cadence and stride length.

Usage:
    python scripts/e2e_screening_check.py --base-url http://127.0.0.1:8000 \
        --booking-id <id> --user-id <id>

Consumes one screening count per assessment, so point it at a booking you are happy
to spend counts from.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.validation.camera import Camera, emit_gait_frames, emit_pose_samples
from app.core.validation.gait_sequence import WalkParams, generate_walk
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import Pose, build_skeleton

WIDTH, HEIGHT = 1280, 720          # a 16:9 capture, where the aspect bug used to bite
FPS = 30

TRUTH_POSE = Pose(trunk_lean_sagittal=14.0, shoulder_height_asymmetry=0.03)
TRUTH_WALK = WalkParams(cadence_spm=110.0, stride_length_m=1.40, duration_s=6.0, fps=FPS)


def build_posture_payload(n_per_view: int = 60) -> dict:
    """The exact shape PostureAnalysisPage sends."""
    points = build_skeleton(TRUTH_POSE)
    rng = np.random.default_rng(42)
    poses = {}
    for view in ("front", "leftside", "rightside", "back"):
        cam = Camera(
            azimuth_deg=VIEW_AZIMUTH[view],
            image_width=WIDTH,
            image_height=HEIGHT,
            focal_px=min(WIDTH, HEIGHT),
        )
        samples = []
        for raw in emit_pose_samples(
            points, cam, n_samples=n_per_view, jitter_px=1.5, include_world=True, rng=rng
        ):
            samples.append(
                {
                    "pose": {
                        str(i): [v[0] / WIDTH, v[1] / HEIGHT, v[2], v[3]]
                        for i, v in raw["pose"].items()
                    },
                    "pose_world": {
                        str(i): list(v) for i, v in raw["pose_world"].items()
                    },
                }
            )
        poses[view] = {"samples": samples, "frameCount": len(samples)}

    return {
        "poses": poses,
        "totalFrames": sum(p["frameCount"] for p in poses.values()),
        "capturedPoses": "front,leftside,rightside,back",
        "coordinateSpace": "normalized",
        "imageWidth": WIDTH,
        "imageHeight": HEIGHT,
    }


def build_gait_payload() -> dict:
    """The exact shape GaitWebcamCapture sends."""
    frames, truth = generate_walk(TRUTH_WALK)
    travel = truth["walking_speed_mps"] * TRUTH_WALK.duration_s
    views = {}
    # Azimuth 0 puts the camera on the subject's RIGHT, not their left: the walk runs
    # along +X facing +X, and for a right-handed frame that subject's right is +Z.
    # Labelling it "leftside" fed every gait test a right-side capture under the wrong
    # name. It did not corrupt any metric - the analyser picks its view by frame count
    # and its leg by cycle count, never by the label - but it is exactly the
    # mislabelling the new orientation check exists to catch, so the harness must not
    # be committing it.
    for view, azimuth in (("rightside", 0.0), ("front", -90.0)):
        cam = Camera(
            azimuth_deg=azimuth,
            distance_m=10.0,
            target=(travel / 2, 0.9, 0.0),
            image_width=WIDTH,
            image_height=HEIGHT,
            focal_px=min(WIDTH, HEIGHT),
        )
        ts = emit_gait_frames(frames, cam, fps=FPS)
        views[view] = {"timeSeries": ts, "backgroundImage": None, "frameCount": len(ts)}

    return {
        "views": views,
        "totalFrames": sum(v["frameCount"] for v in views.values()),
        "capturedViews": ",".join(views),
        "fps": FPS,
        "imageWidth": WIDTH,
        "imageHeight": HEIGHT,
    }, truth


def check(label, actual, expected, tol, unit=""):
    if actual is None:
        print(f"  {label:<34} MISSING (expected ~{expected}{unit})")
        return False
    ok = abs(actual - expected) <= tol
    mark = "PASS" if ok else "FAIL"
    print(
        f"  {label:<34}{actual:9.2f}{unit}  expected {expected:.2f}{unit} "
        f"(+/-{tol}) [{mark}]"
    )
    return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--token", required=True)
    ap.add_argument("--booking-id", required=True)
    ap.add_argument("--skip-posture", action="store_true")
    ap.add_argument("--skip-gait", action="store_true")
    args = ap.parse_args()

    hdr = {"Authorization": f"Bearer {args.token}"}
    base = args.base_url.rstrip("/")
    ok = True

    if not args.skip_posture:
        print("\n=== POSTURE ===")
        r = requests.post(
            f"{base}/api/posture/start-analysis",
            json={"bookingId": args.booking_id},
            headers=hdr,
            timeout=60,
        )
        print("  start-analysis:", r.status_code)
        if r.status_code >= 400:
            print("   ", r.text[:400])
            return 1
        session_id = r.json()["data"]["sessionId"]

        payload = build_posture_payload()
        r = requests.post(
            f"{base}/api/posture/finalize-analysis",
            json={
                "sessionId": session_id,
                "bookingId": args.booking_id,
                "landmarksData": payload,
            },
            headers=hdr,
            timeout=180,
        )
        print("  finalize-analysis:", r.status_code)
        if r.status_code >= 400:
            print("   ", r.text[:800])
            return 1

        analysis = r.json()["data"]["analysis"]
        mj = analysis.get("metricsJson") or {}
        metrics = mj.get("metrics", {})
        print(f"  schemaVersion: {analysis.get('schemaVersion')}")
        print(f"  views captured: {mj.get('viewsCaptured')}")
        print(f"  aspect assumed: {mj.get('aspectAssumed')}")

        def val(k):
            m = metrics.get(k) or {}
            return m.get("value") if m.get("status") in ("measured", "low_confidence") else None

        ok &= check("trunk_angle", val("trunk_angle"), 14.0, 2.0, " deg")
        ok &= check("right_knee_angle", val("right_knee_angle"), 180.0, 2.0, " deg")
        ok &= check("shoulder_obliquity", val("shoulder_obliquity"), -3.9, 2.0, " deg")

        statuses = {}
        for m in metrics.values():
            statuses[m["status"]] = statuses.get(m["status"], 0) + 1
        print(f"  status counts: {statuses}")
        unsupported = [k for k, m in metrics.items() if m["status"] == "unsupported"]
        print(f"  reported as unsupported (not fabricated): {len(unsupported)}")

    if not args.skip_gait:
        print("\n=== GAIT ===")
        r = requests.post(
            f"{base}/api/gait/start-analysis",
            json={"bookingId": args.booking_id},
            headers=hdr,
            timeout=60,
        )
        print("  start-analysis:", r.status_code)
        if r.status_code >= 400:
            print("   ", r.text[:400])
            return 1
        session_id = r.json()["data"]["sessionId"]

        payload, truth = build_gait_payload()
        r = requests.post(
            f"{base}/api/gait/finalize-analysis",
            json={
                "sessionId": session_id,
                "bookingId": args.booking_id,
                "gaitData": payload,
            },
            headers=hdr,
            timeout=180,
        )
        print("  finalize-analysis:", r.status_code)
        if r.status_code >= 400:
            print("   ", r.text[:800])
            return 1

        analysis = r.json()["data"]["analysis"]
        mj = analysis.get("metricsJson") or {}
        metrics = mj.get("metrics", {})
        print(f"  schemaVersion: {analysis.get('schemaVersion')}")
        print(f"  cycles analysed: {mj.get('cyclesAnalysed')}")
        print(f"  aspect assumed: {mj.get('aspectAssumed')}")

        def gval(k):
            m = metrics.get(k) or {}
            return m.get("value") if m.get("status") in ("measured", "low_confidence") else None

        leg = (0.245 + 0.246) * TRUTH_WALK.height_m
        ok &= check("cadence", gval("cadence"), truth["cadence_spm"], 8.0, " spm")
        ok &= check("stride_time_left", gval("stride_time_left"), truth["stride_time_s"], 0.1, " s")
        ok &= check("knee_flexion_max", gval("knee_flexion_max"), truth["knee_flexion_max"], 4.0, " deg")
        ok &= check(
            "stride_length_ratio",
            gval("stride_length_ratio"),
            truth["stride_length_m"] / leg,
            0.15,
        )

        statuses = {}
        for m in metrics.values():
            statuses[m["status"]] = statuses.get(m["status"], 0) + 1
        print(f"  status counts: {statuses}")

    print("\n" + ("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
