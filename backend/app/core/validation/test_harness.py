"""
Ground-truth regression tests for clinical metric computation.

These tests are the reason the pipeline can now distinguish a correct metric from an
incorrect one. The previous suite asserted things like `result.fhd_pixels >= 0`, which
passes for every possible implementation including a broken one - and did in fact pass
while trunk angle returned ~180 degrees for an upright subject.

Every assertion here compares against a value that is known by construction.

Runs without mediapipe or opencv installed; only numpy and scipy are needed.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.gait.events import (
    annotate_phases,
    detect_events,
    progression_axis,
    valid_cycles,
)
from app.core.geometry import (
    frontal_segment_angle,
    interior_angle,
    sagittal_segment_angle,
    signed_angle_from_vertical,
)
from app.core.metrics.registry import Status
from app.core.pose.calibration_v2 import PostureCalibrator
from app.core.validation.camera import Camera, emit_gait_frames, emit_pose_samples
from app.core.validation.gait_sequence import WalkParams, generate_walk
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import (
    L_ELBOW,
    R_SHOULDER,
    L_HIP,
    L_KNEE,
    L_SHOULDER,
    R_ANKLE,
    R_ELBOW,
    R_KNEE,
    R_WRIST,
    Pose,
    build_skeleton,
)

ALL_VIEWS = ("front", "leftside", "rightside", "back")


# ---------------------------------------------------------------------------
# The harness must be correct before it can judge anything else.
# ---------------------------------------------------------------------------


class TestHarnessSelfConsistency:
    @pytest.mark.parametrize("flexion", [0, 15, 30, 45, 60, 90])
    def test_knee_flexion_produces_expected_interior_angle(self, flexion):
        lm = build_skeleton(Pose(knee_flexion_right=flexion))
        measured = interior_angle(lm[24], lm[R_KNEE], lm[R_ANKLE], use_3d=True)
        assert measured == pytest.approx(180.0 - flexion, abs=0.01)

    def test_segment_lengths_are_pose_invariant(self):
        neutral = build_skeleton(Pose())
        flexed = build_skeleton(Pose(knee_flexion_right=70, hip_flexion_right=40))
        for a, b in ((24, R_KNEE), (R_KNEE, R_ANKLE)):
            assert np.linalg.norm(neutral[a] - neutral[b]) == pytest.approx(
                np.linalg.norm(flexed[a] - flexed[b]), abs=1e-9
            )

    # Direction, not just magnitude. The absence of these checks is what allowed a
    # sign error to sit undetected in the generator itself.
    def test_hip_flexion_swings_thigh_anterior(self):
        n, f = build_skeleton(Pose()), build_skeleton(Pose(hip_flexion_right=30))
        assert f[R_KNEE][2] > n[R_KNEE][2] + 0.05

    def test_knee_flexion_lifts_ankle_posteriorly(self):
        n, k = build_skeleton(Pose()), build_skeleton(Pose(knee_flexion_right=60))
        assert k[R_ANKLE][2] < k[R_KNEE][2]
        assert k[R_ANKLE][1] > n[R_ANKLE][1] + 0.02

    def test_trunk_lean_moves_shoulders_anterior(self):
        n, t = build_skeleton(Pose()), build_skeleton(Pose(trunk_lean_sagittal=20))
        assert t[L_SHOULDER][2] > n[L_SHOULDER][2] + 0.05

    def test_shoulder_flexion_swings_wrist_anterior(self):
        n, s = build_skeleton(Pose()), build_skeleton(Pose(shoulder_flexion_right=45))
        assert s[R_WRIST][2] > n[R_WRIST][2] + 0.05

    def test_the_synthetic_subject_is_a_real_person_not_a_mirror_image(self):
        """
        A body facing +Z with up +Y has its right at -X: for a right-handed frame the
        right vector R satisfies R x U = -F, giving R = -X. Building it the other way
        produces a mirrored subject that projects perfectly and is left-right reversed
        against every real capture - which is what this harness did, and why three
        frontal metrics could ship reading 178 degrees without a single test failing.
        """
        lm = build_skeleton(Pose())
        assert lm[R_SHOULDER][0] < 0 < lm[L_SHOULDER][0]
        assert lm[24][0] < 0 < lm[L_HIP][0]          # 24 = right hip

    def test_front_view_matches_a_real_cameras_handedness(self):
        """
        An un-mirrored camera facing a subject sees the subject's LEFT on the image's
        RIGHT. If the harness disagrees, every left-right sign it validates is backwards.
        """
        lm = build_skeleton(Pose())
        front = Camera(azimuth_deg=VIEW_AZIMUTH["front"]).project(lm)
        back = Camera(azimuth_deg=VIEW_AZIMUTH["back"]).project(lm)
        assert front[L_SHOULDER][0] > front[R_SHOULDER][0]
        assert back[L_SHOULDER][0] < back[R_SHOULDER][0]

    def test_abduction_moves_each_elbow_to_its_own_side(self):
        """
        Each arm must swing to ITS OWN side. The subject faces +Z, so in a right-handed
        frame their right is -X and their left is +X - the opposite of what this test
        used to assert, back when the skeleton was built mirrored.
        """
        n = build_skeleton(Pose())
        assert build_skeleton(Pose(shoulder_abduction_right=45))[R_ELBOW][0] < n[R_ELBOW][0] - 0.05
        assert build_skeleton(Pose(shoulder_abduction_left=45))[L_ELBOW][0] > n[L_ELBOW][0] + 0.05


# ---------------------------------------------------------------------------
# Geometry primitives
# ---------------------------------------------------------------------------


class TestGeometry:
    def test_upright_segment_reads_zero_not_180(self):
        """The specific defect: an upright trunk previously measured ~180 degrees."""
        assert signed_angle_from_vertical((320, 300), (320, 180), y_down=True) == pytest.approx(0.0, abs=0.01)

    @pytest.mark.parametrize("lean", [0, 10, -10, 25, -25])
    def test_lean_sign_is_preserved_in_image_space(self, lean):
        r = np.radians(lean)
        b = (320 + 120 * np.sin(r), 300 - 120 * np.cos(r))
        assert signed_angle_from_vertical((320, 300), b, y_down=True) == pytest.approx(lean, abs=0.01)

    @pytest.mark.parametrize("lean", [0, 10, -10, 25])
    def test_world_sagittal_angle_recovers_trunk_lean(self, lean):
        lm = build_skeleton(Pose(trunk_lean_sagittal=lean))
        mid_hip = (lm[L_HIP] + lm[24]) / 2
        mid_sh = (lm[L_SHOULDER] + lm[12]) / 2
        assert sagittal_segment_angle(mid_hip, mid_sh) == pytest.approx(lean, abs=0.5)

    @pytest.mark.parametrize("lat", [0, 8, -8])
    def test_frontal_angle_recovers_lateral_lean(self, lat):
        lm = build_skeleton(Pose(trunk_lean_lateral=lat))
        mid_hip = (lm[L_HIP] + lm[24]) / 2
        mid_sh = (lm[L_SHOULDER] + lm[12]) / 2
        assert frontal_segment_angle(mid_hip, mid_sh) == pytest.approx(lat, abs=0.5)


# ---------------------------------------------------------------------------
# Posture pipeline
# ---------------------------------------------------------------------------


def _run_posture(pose: Pose, views=ALL_VIEWS, world=False, jitter_px=0.0, n=60):
    points = build_skeleton(pose)
    cal = PostureCalibrator()
    rng = np.random.default_rng(1234)
    for view in views:
        cam = Camera(azimuth_deg=VIEW_AZIMUTH[view])
        for sample in emit_pose_samples(
            points, cam, n_samples=n, jitter_px=jitter_px, include_world=world, rng=rng
        ):
            cal.add_sample(sample, view=view)
    return cal.finalize("test")


class TestPostureAccuracy:
    @pytest.mark.parametrize("lean", [0.0, 10.0, 20.0, -12.0])
    @pytest.mark.parametrize("world", [False, True])
    def test_trunk_angle_recovers_lean_with_sign(self, lean, world):
        m = _run_posture(Pose(trunk_lean_sagittal=lean), world=world).metrics["trunk_angle"]
        assert m.status == Status.MEASURED
        assert m.value == pytest.approx(lean, abs=1.0)

    @pytest.mark.parametrize("flexion", [0.0, 20.0, 45.0])
    @pytest.mark.parametrize("world", [False, True])
    def test_knee_angle_survives_multi_view_capture(self, flexion, world):
        """
        Regression: the previous calibrator averaged landmarks across all four views,
        which cancelled left against right and reported a 45-degree bent knee as
        179.8 degrees - a straight leg.
        """
        m = _run_posture(
            Pose(knee_flexion_right=flexion, knee_flexion_left=flexion), world=world
        ).metrics["right_knee_angle"]
        assert m.status == Status.MEASURED
        assert m.value == pytest.approx(180.0 - flexion, abs=1.5)

    def test_shoulder_obliquity_sign_follows_the_raised_side(self):
        raised_left = _run_posture(Pose(shoulder_height_asymmetry=0.03)).metrics["shoulder_obliquity"]
        assert raised_left.status == Status.MEASURED
        assert raised_left.value < -1.0  # subject's right shoulder is the low one

    def test_metrics_needing_an_absent_view_report_insufficient_data(self):
        """A front-only capture cannot yield a sagittal measurement."""
        m = _run_posture(Pose(trunk_lean_sagittal=15), views=("front",)).metrics["trunk_angle"]
        assert m.status == Status.INSUFFICIENT_DATA
        assert m.value is None
        assert "leftside" in (m.detail or "")

    def test_unmeasurable_metrics_are_reported_not_fabricated(self):
        result = _run_posture(Pose())
        for key in ("pelvic_tilt_angle", "q_angle_left", "pronation_supination_left"):
            m = result.metrics[key]
            assert m.status == Status.UNSUPPORTED
            assert m.value is None
            assert m.detail  # must explain why

    def test_too_few_frames_is_insufficient_not_a_guess(self):
        m = _run_posture(Pose(), views=("leftside",), n=3).metrics["trunk_angle"]
        assert m.status == Status.INSUFFICIENT_DATA
        assert m.value is None

    def test_spread_is_reported_and_grows_with_noise(self):
        clean = _run_posture(Pose(trunk_lean_sagittal=10), jitter_px=0.0).metrics["trunk_angle"]
        noisy = _run_posture(Pose(trunk_lean_sagittal=10), jitter_px=6.0).metrics["trunk_angle"]
        assert clean.spread is not None and noisy.spread is not None
        assert noisy.spread > clean.spread


# ---------------------------------------------------------------------------
# Gait event detection
# ---------------------------------------------------------------------------


def _walk_series(params: WalkParams):
    frames, truth = generate_walk(params)
    cam = Camera(azimuth_deg=0.0, distance_m=5.0, target=(2.0, 0.9, 0.0))
    ts = emit_gait_frames(frames, cam, fps=params.fps)
    series = {
        i: np.array([f["landmarks"][str(i)][0] for f in ts])
        for i in (23, 24, 27, 28, 29, 30, 31, 32)
    }
    return series, truth, len(ts)


class TestGaitEvents:
    @pytest.mark.parametrize("cadence", [95.0, 110.0, 125.0])
    def test_heel_strikes_match_ground_truth(self, cadence):
        """
        Regression: the ankle-Y-maximum detector found 10-11 strikes where 5 occurred,
        which drove cadence onto its 200 steps/min clamp.
        """
        series, truth, _ = _walk_series(WalkParams(cadence_spm=cadence))
        events, direction = detect_events(series, fps=30)
        assert direction != 0.0

        for foot, key in (("left", "left_heel_strikes"), ("right", "right_heel_strikes")):
            detected = events[foot].heel_strikes
            expected = truth[key]
            matched = sum(1 for e in expected if any(abs(d - e) <= 3 for d in detected))
            assert matched >= len(expected) - 1, f"{foot}: {detected} vs {expected}"
            assert len(detected) - matched <= 1, f"{foot} false positives: {detected}"

    def test_cycle_count_matches_truth(self):
        series, truth, _ = _walk_series(WalkParams())
        events, _ = detect_events(series, fps=30)
        cycles = valid_cycles(events["left"], fps=30)
        assert len(cycles) == pytest.approx(len(truth["left_heel_strikes"]) - 1, abs=1)

    def test_stride_time_recovered_from_detected_events(self):
        params = WalkParams(cadence_spm=110.0)
        series, truth, _ = _walk_series(params)
        events, _ = detect_events(series, fps=params.fps)
        strides = np.diff(events["left"].heel_strikes) / params.fps
        assert float(np.median(strides)) == pytest.approx(truth["stride_time_s"], abs=0.08)

    def test_no_translation_reports_no_direction_rather_than_guessing(self):
        """Walking on the spot or toward the camera must not yield invented events."""
        series, _, _ = _walk_series(WalkParams())
        static = {k: np.full_like(v, 0.5) for k, v in series.items()}
        events, direction = detect_events(static, fps=30)
        assert direction == 0.0
        assert events["left"].heel_strikes == []

    def test_progression_axis_detects_both_directions(self):
        assert progression_axis(np.linspace(0.1, 0.9, 60)) == 1.0
        assert progression_axis(np.linspace(0.9, 0.1, 60)) == -1.0
        assert progression_axis(np.full(60, 0.5)) == 0.0

    def test_phase_annotation_emits_swing_and_double_support(self):
        """
        Regression: the previous annotator documented four phases but only ever
        emitted stance_left, stance_right and unknown - it had no toe-off concept.
        """
        series, _, n = _walk_series(WalkParams())
        events, _ = detect_events(series, fps=30)
        phases = set(annotate_phases(events["left"], events["right"], n))
        assert "swing" in phases
        assert "double_support" in phases
        assert "unknown" not in phases


# ---------------------------------------------------------------------------
# Gait metric computation
# ---------------------------------------------------------------------------


def _run_gait(params: WalkParams, width=1280, height=720, views=("leftside",), jitter_px=0.0):
    from app.core.gait.calibration_v2 import GaitAnalyser

    frames, truth = generate_walk(params)
    travel = truth["walking_speed_mps"] * params.duration_s
    rng = np.random.default_rng(7)
    analyser = GaitAnalyser(fps=params.fps, aspect_ratio=width / height)
    for view in views:
        # Azimuth 0 puts the camera on the subject's RIGHT, not their left: the walk runs
        # along +X facing +X, and for a right-handed frame that subject's right is +Z.
        # Labelling it "leftside" fed every gait test a right-side capture under the wrong
        # name. It did not corrupt any metric - the analyser picks its view by frame count
        # and its leg by cycle count, never by the label - but it is exactly the
        # mislabelling the new orientation check exists to catch, so the harness must not
        # be committing it.
        azimuth = {"rightside": 0.0, "leftside": 180.0, "front": -90.0}[view]
        # Frame the subject the way a real capture does. At 10 m with focal = frame
        # height the subject is 122 px tall - 17% of the frame - and a pixel of landmark
        # jitter then subtends three times the angle it would in a real recording, so
        # every noise-sensitivity number measured here came out pessimistic. At 5 m with
        # a 1.1x focal the subject fills ~38% of the frame and the 6 m walk still fits.
        cam = Camera(
            azimuth_deg=azimuth,
            distance_m=5.0,
            target=(travel / 2, 0.9, 0.0),
            image_width=width,
            image_height=height,
            focal_px=1.1 * min(width, height),
        )
        analyser.add_view(
            view, emit_gait_frames(frames, cam, fps=params.fps, jitter_px=jitter_px, rng=rng)
        )
    return analyser.finalize("test"), truth


LEG_LENGTH_FRACTION = 0.245 + 0.246  # thigh + shank, as a fraction of height


class TestGaitMetrics:
    def test_kinematics_match_ground_truth(self):
        params = WalkParams(cadence_spm=110.0)
        result, truth = _run_gait(params)
        assert result.value("knee_flexion_max") == pytest.approx(truth["knee_flexion_max"], abs=2.0)
        assert result.value("cadence") == pytest.approx(truth["cadence_spm"], rel=0.05)
        assert result.value("stride_time_left") == pytest.approx(truth["stride_time_s"], abs=0.05)

    def test_spatial_metrics_are_leg_length_normalised(self):
        params = WalkParams(cadence_spm=110.0)
        result, truth = _run_gait(params)
        leg = LEG_LENGTH_FRACTION * params.height_m
        assert result.value("stride_length_ratio") == pytest.approx(
            truth["stride_length_m"] / leg, rel=0.05
        )

    @pytest.mark.parametrize("width,height", [(640, 480), (1280, 720), (1920, 1080), (640, 640)])
    def test_results_are_independent_of_capture_aspect_ratio(self, width, height):
        """
        Regression: MediaPipe normalises x by width and y by height, so normalised
        landmark space is anisotropic. Computing angles directly on it - as the previous
        implementation did - reported 41.9 degrees of peak knee flexion instead of 60 on
        a 16:9 capture, and under-reported stride length by 43%.
        """
        params = WalkParams(cadence_spm=110.0)
        result, truth = _run_gait(params, width=width, height=height)
        leg = LEG_LENGTH_FRACTION * params.height_m
        assert result.value("knee_flexion_max") == pytest.approx(truth["knee_flexion_max"], abs=2.0)
        assert result.value("stride_length_ratio") == pytest.approx(
            truth["stride_length_m"] / leg, rel=0.05
        )

    @pytest.mark.parametrize(
        "key,truth_key,tol",
        [
            # 5.0 and 4.0 are these metrics' certified tolerances
            # (core/metrics/tolerances.py), not numbers chosen to make a test pass.
            ("knee_flexion_max", "knee_flexion_max", 5.0),
            ("hip_flexion_max", "hip_flexion_max", 4.0),
            ("trunk_sagittal_lean", "trunk_lean", 3.0),
        ],
    )
    @pytest.mark.parametrize("jitter_px", [1.0, 2.0])
    def test_peak_metrics_survive_realistic_landmark_noise(
        self, key, truth_key, tol, jitter_px
    ):
        """
        Regression: peak metrics are an extremum over a per-frame angle series, and the
        extremum of a noisy signal is biased outward - noise can push a peak up but
        never down. Before the angle series were smoothed, 2 px of landmark jitter (an
        ordinary capture, not a bad one) inflated these peaks by 4 to 10 degrees, and
        the per-cycle IQR stayed narrow because the bias is systematic across every
        cycle, so the low-confidence gate never fired.

        The contract asserted is "never shipped and wrong", not "always shipped". Above
        the noise level a metric was certified at, the analyser withholds it rather than
        reporting a number nobody can stand behind - and whether a given capture crosses
        that line depends on framing as well as jitter, since the same 2 px moves a
        differently-sized subject by a different angle. A test demanding a value at a
        fixed jitter is testing the framing, not the estimator.

        Truth comes from the generator rather than being restated here, so a change to
        the walk model cannot leave a stale constant defining what "correct" means.
        """
        result, truth = _run_gait(WalkParams(cadence_spm=110.0), jitter_px=jitter_px)
        value = result.value(key)
        if value is None:
            metric = result.metrics[key]
            assert metric.detail, f"{key} withheld without saying why"
            return
        assert value == pytest.approx(truth[truth_key], abs=tol)

    def test_a_clean_capture_reports_its_peak_metrics(self):
        """The withholding above must be a response to noise, not a way to never answer."""
        result, truth = _run_gait(WalkParams(cadence_spm=110.0), jitter_px=0.0)
        for key, truth_key in (
            ("knee_flexion_max", "knee_flexion_max"),
            ("hip_flexion_max", "hip_flexion_max"),
        ):
            assert result.value(key) is not None, f"{key} withheld on a noiseless capture"
            assert result.value(key) == pytest.approx(truth[truth_key], abs=5.0)

    @pytest.mark.parametrize(
        "key,truth_key",
        [
            ("stance_phase_percent", "stance_percent"),
            ("swing_phase_percent", "swing_percent"),
            ("double_support_percent", "double_support_percent"),
        ],
    )
    def test_temporal_phase_metrics_track_the_contact_schedule(self, key, truth_key):
        """
        These three were unvalidated until the generator gained a foot-contact model -
        there was no true toe-off to score against, so nothing could distinguish a
        correct stance percentage from a wrong one. They are the metrics most at risk of
        a silent error, because their normal bands are only 2-4 points wide.

        The 5-point tolerance is not a target, it is a measurement: coordinate-based
        toe-off detection (Zeni) fires about a frame after the foot actually leaves,
        because the foot accelerates from rest and its pelvis-relative minimum lags.
        That bias is a property of the method and is why these metrics should not be
        graded against a 2-point-wide normal range.
        """
        result, truth = _run_gait(WalkParams(cadence_spm=110.0))
        value = result.value(key)
        assert value is not None
        assert value == pytest.approx(truth[truth_key], abs=5.0)

    def test_generator_places_every_foot_where_the_schedule_says(self):
        """
        The whole harness rests on feet landing exactly where the contact schedule puts
        them. When a target is out of reach the inverse kinematics shortens the leg and
        the foot slides off its contact point - silently, and the temporal ground truth
        becomes fiction. Assert it never happens, across capture settings.
        """
        for fps in (25, 30, 60):
            for duration in (3.0, 6.0, 10.0):
                for stride in (0.9, 1.3, 1.5):
                    _, truth = generate_walk(
                        WalkParams(fps=fps, duration_s=duration, stride_length_m=stride),
                        _refine_truth=False,
                    )
                    assert truth["ik_clamped_frames"] == 0, (
                        f"IK clamped at fps={fps} duration={duration} stride={stride}"
                    )

    def test_generated_walk_is_left_right_symmetric(self):
        """
        A symmetric contact schedule must produce a symmetric walk. It did not: driving
        the pelvis's lateral sway at step frequency instead of stride frequency gave two
        sway cycles per stride, which broke the mirror symmetry between the legs and put
        6.7 degrees of asymmetry into what the harness was calling ground truth.
        """
        for duration in (5.0, 6.0, 8.0):
            _, truth = generate_walk(WalkParams(duration_s=duration))
            assert truth["left_right_asymmetry_deg"] < 1.0

    def test_cycle_count_reported(self):
        result, truth = _run_gait(WalkParams())
        assert result.cycles_analysed == pytest.approx(len(truth["left_heel_strikes"]) - 1, abs=1)

    def test_missing_side_view_yields_insufficient_not_defaults(self):
        """
        Regression: the previous implementation returned stride_time 1.0, stride_length
        0.3, cadence clamped to [40,200] and stance 60/40 when detection failed, so a
        failed capture produced a complete and entirely fabricated metric set.
        """
        from app.core.gait.calibration_v2 import GaitAnalyser

        result = GaitAnalyser(fps=30).finalize("test")
        for key in ("cadence", "stride_time_left", "stride_length_ratio", "stance_phase_percent"):
            assert result.metrics[key].value is None
            assert result.metrics[key].status == Status.INSUFFICIENT_DATA
            assert result.metrics[key].detail

    def test_unsupported_gait_metrics_explain_themselves(self):
        result, _ = _run_gait(WalkParams())
        for key in ("foot_progression_angle_left", "pelvic_obliquity_range", "ankle_dorsiflexion_max"):
            m = result.metrics[key]
            assert m.status == Status.UNSUPPORTED
            assert m.value is None
            assert m.detail

    def test_aspect_assumption_is_surfaced_when_not_supplied(self):
        from app.core.gait.calibration_v2 import GaitAnalyser

        assert GaitAnalyser(fps=30).finalize("t").aspect_assumed is True
        assert GaitAnalyser(fps=30, aspect_ratio=16 / 9).finalize("t").aspect_assumed is False


# ---------------------------------------------------------------------------
# Database payload mapping
# ---------------------------------------------------------------------------


class TestLegacyMapping:
    def test_posture_payload_nulls_retired_columns(self):
        """
        Legacy columns whose meaning or unit changed must be NULL, not silently
        repurposed. Writing a dimensionless ratio into `fhdPixels`, or degrees into
        `pelvicObliquity` which held pixels, would corrupt every historical trend.
        """
        from app.core.metrics.legacy_mapping import POSTURE_LEGACY_RETIRED, posture_db_payload

        payload = posture_db_payload(_run_posture(Pose(trunk_lean_sagittal=15)))
        for column in POSTURE_LEGACY_RETIRED:
            assert payload[column] is None, f"{column} should be NULL"

    def test_posture_payload_carries_measured_values(self):
        from app.core.metrics.legacy_mapping import posture_db_payload

        payload = posture_db_payload(_run_posture(Pose(trunk_lean_sagittal=15)))
        assert payload["trunkAngle"] == pytest.approx(15.0, abs=1.5)
        assert payload["schemaVersion"] == 2
        assert payload["metricsJson"]["metrics"]["trunk_angle"]["status"] == "measured"

    def test_posture_payload_nulls_unmeasured_rather_than_zero(self):
        """
        Regression: the old service coerced every missing value to 0.0 via safe(),
        making an unmeasurable metric indistinguishable from a genuine zero.
        """
        from app.core.metrics.legacy_mapping import posture_db_payload

        payload = posture_db_payload(_run_posture(Pose(), views=("front",)))
        assert payload["trunkAngle"] is None  # sagittal metric, no side view captured
        assert payload["metricsJson"]["metrics"]["trunk_angle"]["status"] == "insufficient_data"

    def test_gait_payload_shape(self):
        from app.core.metrics.legacy_mapping import GAIT_LEGACY_RETIRED, gait_db_payload

        result, truth = _run_gait(WalkParams(cadence_spm=110.0))
        payload = gait_db_payload(result)
        assert payload["cadence"] == pytest.approx(truth["cadence_spm"], rel=0.05)
        assert payload["schemaVersion"] == 2
        assert isinstance(payload["gaitCycleCount"], int)
        for column in GAIT_LEGACY_RETIRED:
            assert payload[column] is None, f"{column} should be NULL"

    def test_quality_flags_surface_the_aspect_assumption(self):
        from app.core.gait.calibration_v2 import GaitAnalyser
        from app.core.metrics.legacy_mapping import gait_db_payload

        flags = gait_db_payload(GaitAnalyser(fps=30).finalize("t"))["qualityFlags"]
        assert "aspectRatioAssumed" in flags
        assert "statusCounts" in flags

    def test_every_mapped_column_exists_in_the_prisma_schema(self):
        """The mapping must not reference a column that does not exist."""
        import pathlib
        import re

        from app.core.metrics.legacy_mapping import (
            GAIT_LEGACY_MAP,
            GAIT_LEGACY_RETIRED,
            POSTURE_LEGACY_MAP,
            POSTURE_LEGACY_RETIRED,
        )

        schema = pathlib.Path(__file__).resolve().parents[3] / "prisma" / "schema.prisma"
        text = schema.read_text()

        def columns(model: str) -> set:
            block = text[text.index(f"model {model} {{"):]
            block = block[: block.index("\n}")]
            return set(re.findall(r"^\s+(\w+)\s+\w+", block, flags=re.M))

        posture_cols = columns("PostureAnalysis")
        for col in list(POSTURE_LEGACY_MAP) + list(POSTURE_LEGACY_RETIRED):
            assert col in posture_cols, f"PostureAnalysis has no column {col}"

        gait_cols = columns("GaitAnalysis")
        for col in list(GAIT_LEGACY_MAP) + list(GAIT_LEGACY_RETIRED):
            assert col in gait_cols, f"GaitAnalysis has no column {col}"

    def test_mapped_columns_are_nullable_in_the_schema(self):
        """A NULL-able column is required for honest 'not measured' storage."""
        import pathlib
        import re

        from app.core.metrics.legacy_mapping import POSTURE_LEGACY_MAP, POSTURE_LEGACY_RETIRED

        schema = pathlib.Path(__file__).resolve().parents[3] / "prisma" / "schema.prisma"
        text = schema.read_text()
        block = text[text.index("model PostureAnalysis {"):]
        block = block[: block.index("\n}")]
        nullable = set(re.findall(r"^\s+(\w+)\s+\w+\?", block, flags=re.M))
        for col in list(POSTURE_LEGACY_MAP) + list(POSTURE_LEGACY_RETIRED):
            assert col in nullable, f"{col} must be nullable to store 'not measured'"


# ---------------------------------------------------------------------------
# Pinned defects in the superseded implementation
# ---------------------------------------------------------------------------


class TestSupersededBehaviourIsPinned:
    """
    Documents why the v1 calibrators were replaced, and fails loudly if anyone
    reintroduces their approach. These assert the OLD, WRONG behaviour on purpose - if
    one of these starts failing because someone 'fixed' the legacy module in place,
    that module should be deleted rather than repaired.
    """

    def test_legacy_angle_helper_reads_180_for_an_upright_trunk(self):
        from app.core.pose.calibration import BodyCalibrator

        cal = BodyCalibrator()
        upright = cal._angle_vs_vertical((320, 300, 0, 0.9), (320, 180, 0, 0.9))
        assert upright == pytest.approx(180.0, abs=0.1), (
            "Legacy helper measured against the downward axis. If this now returns 0, "
            "the legacy module was modified - delete it instead, callers use geometry.py."
        )

    def test_legacy_angle_helper_cannot_distinguish_forward_from_backward_lean(self):
        from app.core.pose.calibration import BodyCalibrator

        cal = BodyCalibrator()
        r = np.radians(15)
        fwd = (320 + 120 * np.sin(r), 300 - 120 * np.cos(r), 0, 0.9)
        back = (320 - 120 * np.sin(r), 300 - 120 * np.cos(r), 0, 0.9)
        hip = (320, 300, 0, 0.9)
        assert cal._angle_vs_vertical(hip, fwd) == pytest.approx(
            cal._angle_vs_vertical(hip, back), abs=0.1
        ), "Legacy helper was unsigned; the replacement in geometry.py is signed."

    def test_legacy_calibrator_discards_the_view_argument(self):
        from app.core.pose.calibration import BodyCalibrator

        cal = BodyCalibrator()
        sample = {"pose": {i: (320, 240, 0.0, 0.9) for i in range(33)}}
        import contextlib
        import io

        with contextlib.redirect_stdout(io.StringIO()):
            cal.add_calibration_sample(sample, view="front")
            cal.add_calibration_sample(sample, view="leftside")

        # Everything lands in one flat list with no record of which view it came from.
        assert len(cal.samples) == 2
        assert not hasattr(cal, "samples_by_view")


class TestNoDuplicateMetrics:
    """
    Two differently-named metrics must not be the same computation.

    The v1 code shipped three such pairs - cervical_angle/head_lateral_flexion,
    pelvic_obliquity/hip_height_diff, and q_angle/knee_varus_valgus - which inflated the
    advertised metric count and implied clinical information that was not there. This
    check caught a fourth (rounded_shoulder_angle duplicating trunk_angle) during the
    rewrite, so it earns its place.
    """

    def test_supported_posture_metrics_are_distinct(self):
        poses = [
            Pose(trunk_lean_sagittal=12),
            Pose(knee_flexion_right=25, knee_flexion_left=10),
            Pose(shoulder_height_asymmetry=0.03, pelvis_height_asymmetry=0.02),
            Pose(trunk_lean_lateral=9, head_tilt=6),
        ]
        signatures: dict = {}
        for pose in poses:
            result = _run_posture(pose, world=True)
            for key, metric in result.metrics.items():
                if metric.value is None:
                    continue
                signatures.setdefault(key, []).append(round(metric.value, 4))

        seen: dict = {}
        for key, signature in signatures.items():
            if len(signature) < len(poses):
                continue  # not measurable in every pose; cannot compare fairly
            if len(set(signature)) == 1:
                # Constant across every pose - usually a metric none of these poses
                # perturbs (both correctly zero). Uninformative, not duplicative.
                continue
            fingerprint = tuple(signature)
            if fingerprint in seen:
                raise AssertionError(
                    f"'{key}' produces identical values to '{seen[fingerprint]}' across "
                    f"{len(poses)} different poses ({fingerprint}). Two names for one "
                    f"computation - either differentiate it or mark one unsupported."
                )
            seen[fingerprint] = key

    def test_every_supported_metric_has_an_implementation(self):
        from app.core.pose.calibration_v2 import _IMPLEMENTATIONS
        from app.core.metrics.registry import supported_posture_metrics

        for spec in supported_posture_metrics():
            assert spec.key in _IMPLEMENTATIONS, f"{spec.key} is declared but not implemented"

    def test_every_implementation_has_a_spec(self):
        """
        No orphan implementations. An implementation may belong to an UNSUPPORTED spec -
        head yaw and foot progression are both implemented and exact on clean landmarks,
        and both are retired because a single camera cannot measure the transverse plane
        well enough to grade anyone. That is a statement about the sensor, and the code
        stays so a depth camera or second view makes them reportable without new maths.

        What must not exist is an implementation with no spec at all: that is dead code
        wearing a metric's name, and it is how a metric ends up computed, stored and
        never reported.
        """
        from app.core.pose.calibration_v2 import _IMPLEMENTATIONS
        from app.core.metrics.registry import POSTURE_METRICS

        by_key = {s.key: s for s in POSTURE_METRICS}
        for key in _IMPLEMENTATIONS:
            assert key in by_key, f"{key} is implemented but has no spec at all"

    def test_an_implemented_but_retired_metric_says_why(self):
        """A retirement is a claim, and a claim with no evidence cannot be reviewed."""
        from app.core.pose.calibration_v2 import _IMPLEMENTATIONS
        from app.core.metrics.registry import POSTURE_METRICS

        by_key = {s.key: s for s in POSTURE_METRICS}
        for key in _IMPLEMENTATIONS:
            spec = by_key[key]
            if not spec.is_supported:
                assert spec.unsupported_reason, f"{key} is retired without a reason"

    def test_every_metric_with_a_normal_range_cites_a_source(self):
        from app.core.metrics.gait_registry import GAIT_METRICS
        from app.core.metrics.registry import POSTURE_METRICS

        for spec in list(POSTURE_METRICS) + list(GAIT_METRICS):
            if spec.normal_range is not None:
                assert spec.reference, (
                    f"{spec.key} grades patients against {spec.normal_range} with no citation"
                )


# ---------------------------------------------------------------------------
# End-to-end: the exact payload the browser sends
# ---------------------------------------------------------------------------


def _browser_payload(pose: Pose, width: int, height: int, n: int = 60):
    """
    Reproduce what PostureAnalysisPage sends: normalised 0-1 landmarks under "pose",
    metric world landmarks under "pose_world", per capture view.
    """
    points = build_skeleton(pose)
    rng = np.random.default_rng(5)
    poses: dict = {}
    for view in ALL_VIEWS:
        cam = Camera(
            azimuth_deg=VIEW_AZIMUTH[view],
            image_width=width,
            image_height=height,
            focal_px=min(width, height),
        )
        samples = []
        for raw in emit_pose_samples(points, cam, n_samples=n, include_world=True, rng=rng):
            samples.append(
                {
                    # Normalised, exactly as MediaPipe hands them to the browser.
                    "pose": {
                        i: [v[0] / width, v[1] / height, v[2], v[3]]
                        for i, v in raw["pose"].items()
                    },
                    "pose_world": raw["pose_world"],
                }
            )
        poses[view] = {"samples": samples, "frameCount": len(samples)}
    return poses


class TestBrowserPayloadEndToEnd:
    @pytest.mark.parametrize("width,height", [(640, 480), (1280, 720), (1920, 1080)])
    def test_normalised_browser_payload_recovers_truth_at_any_resolution(self, width, height):
        """
        The posture path sends browser-computed normalised landmarks, so it is subject
        to the same anisotropy that skewed gait: x is divided by width, y by height.
        Declaring the coordinate space and the true frame size must make the result
        resolution-independent.
        """
        cal = PostureCalibrator(normalised_input=True, aspect_ratio=width / height)
        for view, bucket in _browser_payload(Pose(trunk_lean_sagittal=14), width, height).items():
            for sample in bucket["samples"]:
                assert cal.add_sample(sample, view=view)
        result = cal.finalize("browser-test")

        assert result.metrics["trunk_angle"].value == pytest.approx(14.0, abs=1.5)
        assert result.metrics["right_knee_angle"].value == pytest.approx(180.0, abs=1.5)
        assert result.aspect_assumed is False

    def test_world_landmarks_are_not_aspect_scaled(self):
        """
        World landmarks are already metric and isotropic. Applying the 2D aspect
        correction to them would corrupt them, so the scaling must touch `pose` only.
        """
        payload = _browser_payload(Pose(trunk_lean_sagittal=14), 1920, 1080)
        cal = PostureCalibrator(normalised_input=True, aspect_ratio=16 / 9)
        sample = payload["leftside"]["samples"][0]
        cal.add_sample(sample, view="leftside")
        stored = cal.samples_by_view["leftside"][0]
        original = sample["pose_world"][23]
        assert stored["world"][23][0] == pytest.approx(original[0])

    def test_missing_dimensions_flags_the_assumption(self):
        cal = PostureCalibrator(normalised_input=True)  # no aspect_ratio supplied
        for view, bucket in _browser_payload(Pose(), 1280, 720).items():
            for sample in bucket["samples"]:
                cal.add_sample(sample, view=view)
        assert cal.finalize("t").aspect_assumed is True


class TestConfidenceFlagsAreMeaningful:
    """
    A confidence flag is only useful if it fires on real problems. Metrics that are
    inherently single-valued - a cycle count, or a percentage already reduced to a
    median across cycles - were being flagged low confidence purely for carrying one
    number, which put 8 of 24 gait metrics under a warning on a perfectly good capture.
    """

    def test_single_valued_metrics_are_not_flagged_on_a_good_capture(self):
        result, _ = _run_gait(WalkParams(cadence_spm=110.0))
        for key in ("gait_cycle_count", "gait_symmetry_index", "step_length_symmetry",
                    "stride_time_variability"):
            metric = result.metrics[key]
            if metric.value is None:
                continue
            assert metric.status != Status.LOW_CONFIDENCE, (
                f"{key} flagged low confidence on a clean {result.cycles_analysed}-cycle "
                f"capture: {metric.detail}"
            )

    def test_low_confidence_message_reports_the_real_cycle_count(self):
        result, _ = _run_gait(WalkParams(cadence_spm=110.0))
        for metric in result.metrics.values():
            if metric.status == Status.LOW_CONFIDENCE and metric.detail:
                assert "only 1 gait cycle" not in metric.detail, (
                    f"{metric.key} claims 1 cycle but {result.cycles_analysed} were analysed"
                )


class TestDeclaredSourceMatchesReality:
    """
    The registry is only a source of truth if it describes what the code actually does.

    The gait registry initially declared WORLD_3D for its kinematic metrics while the
    gait client sends 2D landmarks only and GaitAnalyser reads nothing else - a
    declaration claiming data the pipeline never receives.
    """

    def test_gait_metrics_do_not_claim_world_landmarks(self):
        from app.core.gait.calibration_v2 import GaitAnalyser
        from app.core.metrics.gait_registry import supported_gait_metrics
        from app.core.metrics.registry import Source
        import inspect

        source = inspect.getsource(GaitAnalyser)
        consumes_world = "pose_world" in source or '"world"' in source

        for spec in supported_gait_metrics():
            if spec.source == Source.WORLD_3D:
                assert consumes_world, (
                    f"{spec.key} declares WORLD_3D but GaitAnalyser never reads world "
                    f"landmarks. Either send them from GaitWebcamCapture and use them, "
                    f"or declare IMAGE_2D."
                )

    def test_posture_world_declarations_are_backed_by_the_calibrator(self):
        from app.core.pose.calibration_v2 import PostureCalibrator
        import inspect

        # PostureCalibrator does consume world landmarks when the client sends them.
        assert "pose_world" in inspect.getsource(PostureCalibrator)

    def test_posture_calibrator_prefers_world_when_present(self):
        with_world = _run_posture(Pose(trunk_lean_sagittal=18), world=True)
        without = _run_posture(Pose(trunk_lean_sagittal=18), world=False)
        # Both should be close to truth, but the world path is the one declared in the
        # registry and must actually be exercised.
        assert with_world.metrics["trunk_angle"].value == pytest.approx(18.0, abs=1.0)
        assert without.metrics["trunk_angle"].value == pytest.approx(18.0, abs=1.5)
