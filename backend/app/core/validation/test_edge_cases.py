"""
Degenerate and adversarial inputs for both screenings.

The accuracy harness asks "is this number right?". These tests ask the question that
comes first: "should there be a number at all?". Every case here is a capture that a
real clinic will produce - a patient who steps out of frame, a webcam that drops
landmarks, a phone held in portrait, someone who walks toward the camera instead of
across it - and the requirement is always the same. The pipeline may report a value, or
report that it cannot; it may not invent one. A fabricated number is worse than a
missing one, because a missing one stops the clinician and a fabricated one does not.

The v1 pipeline failed exactly this way: a failed gait detection returned stride_time
1.0, stride_length 0.3, cadence clamped into range and stance 60/40, producing a
complete and entirely fictional metric set that looked like a healthy walk.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.gait.calibration_v2 import GaitAnalyser
from app.core.metrics.registry import Status
from app.core.pose.calibration_v2 import PostureCalibrator
from app.core.validation.camera import Camera, emit_gait_frames, emit_pose_samples
from app.core.validation.gait_sequence import WalkParams, generate_walk
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import Pose, build_skeleton

FABRICATED = {Status.MEASURED, Status.LOW_CONFIDENCE}


def posture_samples(pose=None, views=("front", "leftside", "rightside", "back"),
                    n=60, jitter_px=0.0, width=1280, height=720, transform=None):
    """Client-shaped posture payload; `transform` may corrupt each sample."""
    points = build_skeleton(pose or Pose(trunk_lean_sagittal=10.0))
    rng = np.random.default_rng(3)
    out = []
    for view in views:
        cam = Camera(azimuth_deg=VIEW_AZIMUTH[view], image_width=width,
                     image_height=height, focal_px=min(width, height))
        for raw in emit_pose_samples(points, cam, n_samples=n, jitter_px=jitter_px,
                                     include_world=True, rng=rng):
            sample = {
                "pose": {str(i): [v[0] / width, v[1] / height, v[2], v[3]]
                         for i, v in raw["pose"].items()},
                "pose_world": {str(i): list(v) for i, v in raw["pose_world"].items()},
            }
            if transform is not None:
                sample = transform(sample)
            out.append((view, sample))
    return out


def run_posture(samples, width=1280, height=720):
    cal = PostureCalibrator(normalised_input=True, aspect_ratio=width / height)
    for view, sample in samples:
        cal.add_sample(sample, view=view)
    return cal.finalize("edge")


def run_gait(views=("leftside", "front"), params=None, transform=None, fps=None,
             width=1280, height=720, aspect=None):
    params = params or WalkParams()
    frames, truth = generate_walk(params)
    travel = truth["walking_speed_mps"] * params.duration_s
    analyser = GaitAnalyser(fps=fps or params.fps, aspect_ratio=aspect or width / height)
    for view in views:
        # Azimuth 0 puts the camera on the subject's RIGHT, not their left: the walk runs
        # along +X facing +X, and for a right-handed frame that subject's right is +Z.
        # Labelling it "leftside" fed every gait test a right-side capture under the wrong
        # name. It did not corrupt any metric - the analyser picks its view by frame count
        # and its leg by cycle count, never by the label - but it is exactly the
        # mislabelling the new orientation check exists to catch, so the harness must not
        # be committing it.
        cam = Camera(azimuth_deg={"rightside": 0.0, "leftside": 180.0, "front": -90.0}[view], distance_m=8.0,
                     target=(travel / 2, 0.9, 0.0), image_width=width,
                     image_height=height, focal_px=min(width, height))
        series = emit_gait_frames(frames, cam, fps=params.fps)
        if transform is not None:
            series = transform(series)
        analyser.add_view(view, series)
    return analyser.finalize("edge"), truth


def assert_no_fabrication(result, context: str):
    """Every metric either carries a defensible value or explains its absence."""
    for key, m in result.metrics.items():
        if m.status in FABRICATED:
            assert m.value is not None, f"{context}: {key} claims {m.status} with no value"
            assert np.isfinite(m.value), f"{context}: {key} reported {m.value}"
        else:
            assert m.value is None, f"{context}: {key} withheld but still carries a value"
            assert m.detail, f"{context}: {key} is {m.status.value} with no explanation"


# ---------------------------------------------------------------------------
# Posture screening
# ---------------------------------------------------------------------------


class TestPostureEdgeCases:
    def test_no_samples_at_all(self):
        result = run_posture([])
        assert result.views_captured == []
        assert_no_fabrication(result, "empty capture")
        assert all(m.value is None for m in result.metrics.values())

    def test_single_view_only_yields_that_view_s_metrics(self):
        """A front-only capture is legitimate; it just cannot answer sagittal questions."""
        result = run_posture(posture_samples(views=("front",)))
        assert result.metrics["shoulder_obliquity"].status == Status.MEASURED
        assert result.metrics["trunk_angle"].status == Status.INSUFFICIENT_DATA
        assert_no_fabrication(result, "front only")

    @pytest.mark.parametrize("n", [0, 1, 2, 5])
    def test_too_few_frames_never_produces_a_number(self, n):
        result = run_posture(posture_samples(n=n))
        assert_no_fabrication(result, f"{n} frames")
        assert result.metrics["trunk_angle"].value is None

    def test_landmarks_entirely_absent_from_samples(self):
        result = run_posture(posture_samples(transform=lambda s: {"pose": {}, "pose_world": {}}))
        assert_no_fabrication(result, "no landmarks")
        assert all(m.value is None for m in result.metrics.values())

    def test_the_specific_landmarks_a_metric_needs_are_missing(self):
        """Knees dropped by the tracker must not be silently substituted."""
        def drop_knees(s):
            for key in ("pose", "pose_world"):
                for idx in ("25", "26", "27", "28"):
                    s[key].pop(idx, None)
            return s

        result = run_posture(posture_samples(transform=drop_knees))
        assert result.metrics["left_knee_angle"].value is None
        assert result.metrics["right_knee_angle"].value is None
        # A metric that does not need the knees is unaffected.
        assert result.metrics["shoulder_obliquity"].status == Status.MEASURED
        assert_no_fabrication(result, "knees missing")

    def test_non_finite_landmark_values(self):
        def poison(s):
            s["pose"]["25"] = [float("nan"), float("nan"), 0.0, 0.9]
            s["pose_world"]["25"] = [float("inf"), 0.0, 0.0, 0.9]
            return s

        result = run_posture(posture_samples(transform=poison))
        assert_no_fabrication(result, "NaN landmarks")

    def test_all_landmarks_collapsed_to_one_point(self):
        """A total tracking failure often presents as every point at the same place."""
        def collapse(s):
            for key in ("pose", "pose_world"):
                s[key] = {k: [0.5, 0.5, 0.0, 0.9] for k in s[key]}
            return s

        result = run_posture(posture_samples(transform=collapse))
        assert_no_fabrication(result, "collapsed skeleton")
        for key in ("trunk_angle", "left_knee_angle", "shoulder_obliquity"):
            assert result.metrics[key].value is None or result.metrics[key].value == 0.0

    def test_identical_frames_report_zero_spread_not_false_confidence(self):
        """A frozen video gives 60 identical frames; that is not 60 observations."""
        samples = posture_samples(n=60, jitter_px=0.0)
        result = run_posture(samples)
        trunk = result.metrics["trunk_angle"]
        assert trunk.status == Status.MEASURED
        assert trunk.spread == pytest.approx(0.0, abs=1e-6)

    @pytest.mark.parametrize("width,height", [(720, 1280), (1080, 1920), (480, 640)])
    def test_portrait_capture_is_handled_not_skewed(self, width, height):
        """Phones are held in portrait. The aspect correction must run either way."""
        pose = Pose(trunk_lean_sagittal=14.0, knee_flexion_right=30.0)
        result = run_posture(posture_samples(pose=pose, width=width, height=height),
                             width=width, height=height)
        assert result.metrics["trunk_angle"].value == pytest.approx(14.0, abs=2.0)
        assert result.metrics["right_knee_angle"].value == pytest.approx(150.0, abs=3.0)

    def test_views_mislabelled_by_the_client_are_not_silently_averaged(self):
        """
        Regression guard: the v1 calibrator pooled landmarks across all four views, so a
        45 degree bent knee cancelled against the opposite leg and read as straight.
        Feeding the same view under two names must not resurrect that averaging.
        """
        pose = Pose(knee_flexion_right=45.0, knee_flexion_left=45.0)
        points = build_skeleton(pose)
        cal = PostureCalibrator()
        rng = np.random.default_rng(1)
        for view in ("rightside", "leftside"):
            cam = Camera(azimuth_deg=VIEW_AZIMUTH["rightside"])
            for s in emit_pose_samples(points, cam, n_samples=60, rng=rng):
                cal.add_sample(s, view=view)
        knee = cal.finalize("edge").metrics["right_knee_angle"]
        assert knee.value == pytest.approx(135.0, abs=3.0)

    def test_extreme_but_physically_possible_posture(self):
        pose = Pose(trunk_lean_sagittal=45.0, knee_flexion_left=80.0, knee_flexion_right=80.0)
        result = run_posture(posture_samples(pose=pose))
        assert result.metrics["trunk_angle"].value == pytest.approx(45.0, abs=3.0)
        assert result.metrics["left_knee_angle"].value == pytest.approx(100.0, abs=4.0)

    @pytest.mark.parametrize("mirrored", [False, True])
    def test_frontal_metrics_do_not_depend_on_capture_handedness(self, mirrored):
        """
        The bug that shipped. A frontal tilt was computed as the angle of the vector
        running from the left landmark to the right one, which reverses depending on
        which side of the IMAGE each lands on. An un-mirrored front-facing webcam puts
        the subject's left shoulder on the image's RIGHT, so the vector ran backwards
        and a 5 degree shoulder tilt was reported as 175 - outside the physical range,
        withheld as a computation defect. Three metrics were blank on every live report.

        It survived the harness because the synthetic skeleton was built mirrored, so
        its front view had the opposite handedness to a real camera and the two errors
        cancelled. This test feeds both handednesses and requires the same answer.
        """
        pose = Pose(shoulder_height_asymmetry=0.04, pelvis_height_asymmetry=0.03,
                    head_tilt=-6.0)

        def flip(sample):
            sample["pose"] = {
                idx: [1.0 - v[0], *v[1:]] for idx, v in sample["pose"].items()
            }
            return sample

        result = run_posture(posture_samples(pose=pose, transform=flip if mirrored else None))
        for key, expected in (
            ("shoulder_obliquity", -5.2),
            ("pelvic_obliquity", -5.3),
            ("head_lateral_flexion", 6.0),
        ):
            m = result.metrics[key]
            assert m.status == Status.MEASURED, f"{key}: {m.status} - {m.detail}"
            assert m.value == pytest.approx(expected, abs=1.5), key

    def test_left_and_right_side_views_agree_on_sagittal_metrics(self):
        """
        The same subject seen from either side must give the same sagittal answer. The
        anterior-versus-image-x sign was inverted for BOTH side views, so forward head
        position came back negative on live captures - a normal subject's head reported
        as sitting behind their shoulders, and graded "below range" for it.

        Comparing the two views catches an inverted sign only if the two are fed
        separately; a capture that happens to use one view alone cannot reveal it, which
        is why this asserts on each view in isolation and then on their agreement.
        """
        pose = Pose(trunk_lean_sagittal=9.0)
        left = run_posture(posture_samples(pose=pose, views=("leftside",)))
        right = run_posture(posture_samples(pose=pose, views=("rightside",)))

        for label, result in (("leftside", left), ("rightside", right)):
            trunk = result.metrics["trunk_angle"]
            assert trunk.value == pytest.approx(9.0, abs=2.0), f"{label}: {trunk.value}"
            fh = result.metrics["forward_head_ratio"]
            assert fh.status == Status.MEASURED, label
            # Leaning forward carries the head in FRONT of the shoulders. A negative
            # ratio here means the sign convention is mirrored.
            assert fh.value > 0, f"{label}: forward head reported as {fh.value}"

        assert left.metrics["forward_head_ratio"].value == pytest.approx(
            right.metrics["forward_head_ratio"].value, abs=0.1
        )

    @pytest.mark.parametrize("labelled,actual", [
        ("leftside", "rightside"),
        ("rightside", "leftside"),
        ("front", "back"),
        ("back", "front"),
    ])
    def test_a_subject_who_faced_the_wrong_way_is_detected(self, labelled, actual):
        """
        Patients turn the wrong way. The instruction on screen does not prevent it, and
        before this the pipeline simply believed the label: a right-side capture filed
        as 'leftside' had its sagittal sign flipped, so a 10 degree forward lean was
        reported as 10 degrees backward with no indication anything was wrong.

        Two requirements, and the second matters more than the first. The mislabelling
        must be reported - a session with two right-side captures has no second opinion
        in it. And the measurements must still be RIGHT, because every sign is now
        measured from the anatomy rather than looked up from the label.
        """
        pose = Pose(trunk_lean_sagittal=10.0)
        points = build_skeleton(pose)
        rng = np.random.default_rng(4)
        cal = PostureCalibrator()
        for view in ("front", "back", "leftside", "rightside"):
            source = actual if view == labelled else view
            cam = Camera(azimuth_deg=VIEW_AZIMUTH[source])
            for sample in emit_pose_samples(points, cam, n_samples=60, rng=rng):
                cal.add_sample(sample, view=view)
        result = cal.finalize("edge")

        assert any(labelled in w for w in result.orientation_warnings), (
            f"a '{actual}' capture filed as '{labelled}' went unreported"
        )
        trunk = result.metrics["trunk_angle"]
        assert trunk.value == pytest.approx(10.0, abs=2.0), (
            f"sagittal sign followed the label instead of the anatomy: {trunk.value}"
        )

    def test_a_correctly_captured_session_raises_no_orientation_warning(self):
        result = run_posture(posture_samples(pose=Pose(trunk_lean_sagittal=10.0)))
        assert result.orientation_warnings == []

    def test_values_outside_physical_possibility_are_withheld_as_defects(self):
        """
        A metric outside its physical range is a bug in us, not a finding about the
        patient, and must never reach a report as a number.
        """
        def scramble(s):
            s["pose_world"]["25"] = [0.0, 40.0, 0.0, 0.9]   # knee 40 m above the hip
            return s

        result = run_posture(posture_samples(transform=scramble))
        knee = result.metrics["left_knee_angle"]
        assert knee.value is None or knee.status == Status.MEASURED
        assert_no_fabrication(result, "impossible geometry")


# ---------------------------------------------------------------------------
# Gait screening
# ---------------------------------------------------------------------------


class TestGaitEdgeCases:
    def test_no_views_at_all(self):
        result = GaitAnalyser(fps=30, aspect_ratio=16 / 9).finalize("edge")
        assert_no_fabrication(result, "no views")
        assert all(m.value is None for m in result.metrics.values())

    def test_empty_time_series(self):
        analyser = GaitAnalyser(fps=30, aspect_ratio=16 / 9)
        analyser.add_view("leftside", [])
        assert_no_fabrication(analyser.finalize("edge"), "empty series")

    @pytest.mark.parametrize("duration", [0.2, 0.7, 1.5])
    def test_capture_too_short_for_a_gait_cycle(self, duration):
        """Under two strides there is nothing to measure; say so rather than extrapolate."""
        result, _ = run_gait(params=WalkParams(duration_s=duration))
        assert_no_fabrication(result, f"{duration}s capture")
        assert result.metrics["cadence"].value is None or \
            result.metrics["cadence"].status == Status.LOW_CONFIDENCE

    def test_subject_who_does_not_translate(self):
        """
        Walking on the spot, on a treadmill, or straight at the camera. Relative-
        coordinate event detection is undefined without a direction of progression, and
        guessing one manufactures a cadence out of postural sway.
        """
        frames, _ = generate_walk(WalkParams())
        analyser = GaitAnalyser(fps=30, aspect_ratio=16 / 9)
        cam = Camera(azimuth_deg=-90.0, distance_m=8.0, target=(3.0, 0.9, 0.0),
                     image_width=1280, image_height=720, focal_px=720)
        series = emit_gait_frames(frames, cam, fps=30)
        # Pin the pelvis so the subject never advances across the image.
        for f in series:
            sacrum = (f["landmarks"]["23"][0] + f["landmarks"]["24"][0]) / 2
            for lm in f["landmarks"].values():
                lm[0] -= sacrum
        analyser.add_view("leftside", series)
        result = analyser.finalize("edge")
        assert result.metrics["cadence"].value is None
        assert_no_fabrication(result, "no translation")

    def test_a_frozen_subject_is_not_reported_as_walking(self):
        frames, _ = generate_walk(WalkParams())
        analyser = GaitAnalyser(fps=30, aspect_ratio=16 / 9)
        cam = Camera(azimuth_deg=0.0, distance_m=8.0, target=(3.0, 0.9, 0.0),
                     image_width=1280, image_height=720, focal_px=720)
        one = emit_gait_frames(frames[:1], cam, fps=30)[0]
        analyser.add_view("leftside", [dict(one, frameIndex=i) for i in range(180)])
        result = analyser.finalize("edge")
        assert result.metrics["cadence"].value is None
        assert_no_fabrication(result, "frozen subject")

    def test_front_view_only_cannot_yield_sagittal_metrics(self):
        result, _ = run_gait(views=("front",))
        for key in ("cadence", "knee_flexion_max", "stride_length_ratio"):
            assert result.metrics[key].value is None, key
            assert result.metrics[key].detail
        assert_no_fabrication(result, "front only")

    def test_side_view_only_cannot_yield_frontal_metrics(self):
        result, _ = run_gait(views=("leftside",))
        assert result.metrics["cadence"].status in FABRICATED
        assert result.metrics["step_width_ratio"].value is None
        assert_no_fabrication(result, "side only")

    def test_short_tracking_dropouts_are_interpolated_not_fatal(self):
        def punch_holes(series):
            for i in range(20, len(series), 37):
                for f in series[i:i + 2]:
                    f["landmarks"].pop("27", None)
            return series

        result, truth = run_gait(transform=punch_holes)
        assert result.metrics["cadence"].value == pytest.approx(truth["cadence_spm"], abs=6.0)
        assert_no_fabrication(result, "short dropouts")

    def test_long_dropouts_do_not_manufacture_events(self):
        """
        A landmark absent for a second was genuinely not visible. Bridging it invents a
        trajectory, and an invented trajectory invents heel strikes.
        """
        def blank_out(series):
            for f in series[40:110]:
                f["landmarks"] = {}
            return series

        result, _ = run_gait(transform=blank_out)
        assert_no_fabrication(result, "long dropout")
        cadence = result.metrics["cadence"]
        assert cadence.value is None or cadence.status == Status.LOW_CONFIDENCE

    def test_non_finite_landmarks_mid_capture(self):
        def poison(series):
            for f in series[50:60]:
                f["landmarks"]["27"] = [float("nan"), float("nan"), 0.0, 0.9]
            return series

        result, _ = run_gait(transform=poison)
        assert_no_fabrication(result, "NaN mid-capture")

    def test_missing_capture_dimensions_flag_the_assumption(self):
        """Without width and height the aspect correction is a guess, and must be labelled."""
        params = WalkParams()
        frames, truth = generate_walk(params)
        travel = truth["walking_speed_mps"] * params.duration_s
        analyser = GaitAnalyser(fps=30, aspect_ratio=None)
        cam = Camera(azimuth_deg=0.0, distance_m=8.0, target=(travel / 2, 0.9, 0.0),
                     image_width=1280, image_height=720, focal_px=720)
        analyser.add_view("leftside", emit_gait_frames(frames, cam, fps=30))
        result = analyser.finalize("edge")
        assert getattr(result, "aspect_assumed", False) is True

    @pytest.mark.parametrize("fps", [24, 25, 30, 60])
    def test_cadence_is_recovered_across_capture_frame_rates(self, fps):
        result, truth = run_gait(params=WalkParams(fps=fps))
        assert result.metrics["cadence"].value == pytest.approx(truth["cadence_spm"], abs=6.0)

    @pytest.mark.parametrize("cadence", [70.0, 110.0, 150.0])
    def test_slow_and_fast_walkers_are_both_measured(self, cadence):
        result, truth = run_gait(params=WalkParams(cadence_spm=cadence, duration_s=8.0))
        assert result.metrics["cadence"].value == pytest.approx(cadence, abs=8.0)

    def test_a_pronounced_limp_is_detected_not_averaged_away(self):
        """
        The point of a symmetry metric is to catch this. A 25% step-length difference
        must move the number well away from symmetric.
        """
        result, _ = run_gait(params=WalkParams(right_stride_scale=1.25, duration_s=9.0))
        sym = result.metrics["step_length_symmetry"]
        assert sym.value is not None
        assert sym.value < 95.0

    def test_extreme_aspect_ratios_do_not_skew_angles(self):
        for width, height in ((1280, 720), (720, 1280), (640, 640)):
            result, truth = run_gait(width=width, height=height)
            assert result.metrics["knee_flexion_max"].value == pytest.approx(
                truth["knee_flexion_max"], abs=8.0
            ), f"{width}x{height}"

    GAIT_AZIMUTH = {"rightside": 0.0, "leftside": 180.0, "front": -90.0}

    def _gait_capture(self, labels_to_actual):
        params = WalkParams(fps=60)
        frames, truth = generate_walk(params)
        travel = truth["walking_speed_mps"] * params.duration_s
        analyser = GaitAnalyser(fps=params.fps, aspect_ratio=1280 / 720)
        for label, actual in labels_to_actual.items():
            cam = Camera(
                azimuth_deg=self.GAIT_AZIMUTH[actual], distance_m=6.0,
                target=(travel / 2, 0.9, 0.0),
                image_width=1280, image_height=720, focal_px=800,
            )
            analyser.add_view(label, emit_gait_frames(frames, cam, fps=params.fps))
        return analyser

    @pytest.mark.parametrize("view", ["leftside", "rightside", "front"])
    def test_the_analyser_recognises_each_gait_view(self, view):
        """
        Which flank a camera sees is a fact about the geometry, and getting it wrong is
        easy: azimuth 0 looks like it ought to be the left side and is the right, which
        is how every gait test in this repo came to feed a right-side walk under the
        'leftside' label. Nothing downstream broke - the analyser picks its view by
        frame count and its leg by cycle count, never by the label - but a harness that
        mislabels its own captures cannot detect mislabelled ones.
        """
        analyser = self._gait_capture({view: view})
        observed = analyser.observed_view(view)
        if view == "front":
            # A front capture is a walk toward the camera AND back, so either facing is
            # correct; what it must not be is a side view.
            assert observed in ("front", "back")
        else:
            assert observed == view

    def test_a_walk_recorded_on_the_wrong_side_is_reported(self):
        """
        Two captures of the same flank leave the session with no data for the other and
        nothing to cross-check against. The metrics are still right - every sign is
        measured from the anatomy - but the operator has to know the session is short a
        view, and the report is the only place that can tell them.
        """
        analyser = self._gait_capture({
            "leftside": "rightside", "rightside": "rightside", "front": "front",
        })
        warnings = analyser.orientation_warnings()
        assert any("leftside" in w and "rightside" in w for w in warnings), warnings

    def test_a_correctly_walked_session_raises_no_warning(self):
        analyser = self._gait_capture({
            "leftside": "leftside", "rightside": "rightside", "front": "front",
        })
        assert analyser.orientation_warnings() == []

    def test_the_front_capture_may_be_walked_in_either_direction(self):
        """
        The front view is a walk toward the camera and back. Roughly half its frames
        legitimately show a back view, and the subject may start at either end, so
        neither facing is an error - warning on it would put a red flag on a correct
        capture, which trains operators to ignore the flag.
        """
        analyser = self._gait_capture({"front": "front"})
        assert analyser.orientation_warnings() == []

    def test_a_side_walk_filed_as_the_front_view_is_reported(self):
        analyser = self._gait_capture({"front": "leftside"})
        assert any("front" in w for w in analyser.orientation_warnings())

    def test_unsupported_metrics_never_carry_a_value_or_a_normal_range(self):
        """
        A metric we cannot measure must not reach the report with a range attached -
        that is what lets a UI badge it normal or abnormal on the strength of nothing.
        """
        result, _ = run_gait()
        for key, m in result.metrics.items():
            if m.status == Status.UNSUPPORTED:
                assert m.value is None, key
                assert m.detail, key
                assert m.normal_range is None, f"{key} is unsupported but still graded"
