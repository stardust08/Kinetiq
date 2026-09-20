"""
Service-layer tests for the range-of-motion screening.

Same split as the gait service tests: the measurement maths is certified against
synthetic ground truth in app/core, and what is tested here is everything the service
does AROUND it - authorisation, credit accounting, and which metrics a given hold is
allowed to produce. Those are the failures that cost a patient a screening credit or
hand a clinician a number the patient never demonstrated.

The database is faked. These assertions are about branching and ordering.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from app.api.rom.service import MIN_FRAMES_PER_HOLD, MOVEMENTS, ROMAnalysisService
from app.core.exceptions import BadRequestException, UnauthorizedException
from app.core.metrics.rom_registry import supported_rom_metrics
from app.core.validation.camera import Camera, emit_pose_samples
from app.core.validation.harness import VIEW_AZIMUTH
from app.core.validation.skeleton import Pose, build_skeleton


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; these tests never touch a database."""
    yield


# ---------------------------------------------------------------------------
# Fake database
# ---------------------------------------------------------------------------


class FakeTable:
    def __init__(self, record: Optional[Any] = None):
        self.record = record
        self.created: List[Dict] = []
        self.updated: List[Dict] = []
        self.fail_on_create = False

    async def find_first(self, **kwargs):
        return self.record

    async def find_unique(self, **kwargs):
        return self.record

    async def find_many(self, **kwargs):
        return []

    async def create(self, data: Dict, **kwargs):
        if self.fail_on_create:
            raise RuntimeError("database unavailable")
        self.created.append(data)
        return SimpleNamespace(id=f"rec_{len(self.created)}")

    async def update(self, **kwargs):
        self.updated.append(kwargs)
        return SimpleNamespace(id="updated", remainingScreeningCount=2)


class FakeDB:
    def __init__(self, booking=None):
        self.booking = FakeTable(booking)
        self.romanalysis = FakeTable()


def a_booking(remaining: int = 3, used: int = 0, status: str = "CONFIRMED"):
    return SimpleNamespace(
        id="bk_1", userId="user_1", status=status,
        remainingScreeningCount=remaining, usedScreeningCount=used,
        totalScreeningCount=3,
    )


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB(booking=a_booking())
    monkeypatch.setattr("app.api.rom.service.db", fake, raising=False)
    return fake


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

WIDTH, HEIGHT, FOCAL = 1280, 720, 800

# What the patient is posed to do for each movement, so a hold produces a value a
# clinician would recognise rather than a limb at rest.
POSED = {
    "shoulder_abduction": {"shoulder_abduction_left": 170.0, "shoulder_abduction_right": 168.0},
    "cervical_lateral_flexion": {"head_tilt": 35.0},
    "shoulder_flexion_left": {"shoulder_flexion_left": 165.0},
    "shoulder_flexion_right": {"shoulder_flexion_right": 160.0},
    "elbow_flexion_left": {"elbow_flexion_left": 140.0},
    "elbow_flexion_right": {"elbow_flexion_right": 138.0},
    "hip_flexion_left": {"hip_flexion_left": 100.0},
    "hip_flexion_right": {"hip_flexion_right": 98.0},
    "knee_flexion_left": {"knee_flexion_left": 130.0},
    "knee_flexion_right": {"knee_flexion_right": 128.0},
}


def hold(movement: str, n_samples: int = 60, view: Optional[str] = None) -> Dict:
    """One movement's frames, shaped exactly as ROMCapture sends them."""
    pose = Pose(height_m=1.72, **POSED[movement])
    points = build_skeleton(pose)
    capture_view = view or MOVEMENTS[movement]["view"]
    cam = Camera(
        azimuth_deg=VIEW_AZIMUTH[MOVEMENTS[movement]["view"]], distance_m=3.2,
        target=(0.0, pose.height_m * 0.5, 0.0),
        image_width=WIDTH, image_height=HEIGHT, focal_px=FOCAL,
    )
    samples = []
    for raw in emit_pose_samples(points, cam, n_samples=n_samples, jitter_px=1.0,
                                 include_world=True):
        samples.append({
            "pose": {i: [v[0] / WIDTH, v[1] / HEIGHT, v[2], v[3]]
                     for i, v in raw["pose"].items()},
            "pose_world": {i: list(v) for i, v in raw["pose_world"].items()},
        })
    return {"view": capture_view, "samples": samples, "frameCount": len(samples)}


def rom_payload(movements=None, **overrides) -> Dict:
    names = movements if movements is not None else list(MOVEMENTS)
    return {
        "movements": {name: hold(name) for name in names},
        "coordinateSpace": "normalized",
        "imageWidth": WIDTH,
        "imageHeight": HEIGHT,
        **overrides,
    }


def stored_payload(db) -> Dict:
    raw = db.romanalysis.created[0].get("metricsJson")
    return getattr(raw, "data", raw) or {}


def stored_flags(db) -> Dict:
    raw = db.romanalysis.created[0].get("qualityFlags")
    return getattr(raw, "data", raw) or {}


def stored_metrics(db) -> Dict:
    return stored_payload(db).get("metrics", {})


async def finalize(db, payload, user="user_1", booking="bk_1"):
    return await ROMAnalysisService.finalize_analysis(
        user_id=user, booking_id=booking, session_id="sess_1", rom_data=payload
    )


# ---------------------------------------------------------------------------
# Authorisation and credit accounting
# ---------------------------------------------------------------------------


class TestAuthorisationAndCredits:
    async def test_booking_owned_by_another_user_is_rejected(self, db):
        db.booking.record = None
        with pytest.raises(UnauthorizedException):
            await finalize(db, rom_payload(["knee_flexion_left"]))
        assert db.romanalysis.created == []

    async def test_exhausted_screening_count_is_rejected_before_any_work(self, db):
        db.booking.record = a_booking(remaining=0, used=3)
        with pytest.raises(BadRequestException, match="remaining screening"):
            await finalize(db, rom_payload(["knee_flexion_left"]))
        assert db.romanalysis.created == []
        assert db.booking.updated == []

    async def test_a_successful_analysis_consumes_exactly_one_credit(self, db):
        await finalize(db, rom_payload())
        assert len(db.booking.updated) == 1
        data = db.booking.updated[0]["data"]
        assert data["usedScreeningCount"] == {"increment": 1}
        assert data["remainingScreeningCount"] == {"decrement": 1}

    async def test_a_capture_with_nothing_measurable_costs_no_credit(self, db):
        """
        The failure this exists to prevent: a patient pays a screening for a capture
        that produced no measurement, and is handed an empty report.
        """
        payload = rom_payload(["knee_flexion_left"])
        # Landmarks present but degenerate - every joint collapsed onto one point, which
        # is what a capture of an empty room or a badly occluded subject amounts to.
        for movement in payload["movements"].values():
            for sample in movement["samples"]:
                sample["pose"] = {i: [0.5, 0.5, 0.0, 0.9] for i in sample["pose"]}
                sample["pose_world"] = {i: [0.0, 0.0, 0.0, 0.9] for i in sample["pose_world"]}
        with pytest.raises(BadRequestException, match="not been counted"):
            await finalize(db, payload)
        assert db.booking.updated == []

    async def test_a_failed_save_does_not_consume_a_credit(self, db):
        db.romanalysis.fail_on_create = True
        with pytest.raises(BadRequestException, match="No screening count was deducted"):
            await finalize(db, rom_payload())
        assert db.booking.updated == []


# ---------------------------------------------------------------------------
# Capture validation
# ---------------------------------------------------------------------------


class TestCaptureValidation:
    async def test_an_empty_capture_is_rejected(self, db):
        with pytest.raises(BadRequestException, match="No movement data"):
            await finalize(db, {"movements": {}, "imageWidth": WIDTH, "imageHeight": HEIGHT})

    async def test_a_hold_too_short_to_be_steady_is_rejected(self, db):
        payload = {
            "movements": {"knee_flexion_left": hold("knee_flexion_left",
                                                   n_samples=MIN_FRAMES_PER_HOLD - 1)},
            "coordinateSpace": "normalized",
            "imageWidth": WIDTH, "imageHeight": HEIGHT,
        }
        with pytest.raises(BadRequestException, match="Too few frames"):
            await finalize(db, payload)
        assert db.booking.updated == []

    async def test_an_unknown_movement_is_rejected(self, db):
        payload = rom_payload(["knee_flexion_left"])
        payload["movements"]["cervical_rotation"] = payload["movements"]["knee_flexion_left"]
        with pytest.raises(BadRequestException, match="Unknown movement"):
            await finalize(db, payload)


# ---------------------------------------------------------------------------
# Which metrics a hold is allowed to produce
# ---------------------------------------------------------------------------


class TestMetricAttribution:
    async def test_a_one_sided_hold_does_not_report_the_other_side(self, db):
        """
        The defect this pins. Metrics were selected by substring - "does
        'shoulder_flexion' appear in this key" - which attributed BOTH sides to a
        single-sided hold. The right-arm hold therefore also wrote a LEFT shoulder
        flexion value, measured off an arm hanging at the patient's side and occluded
        behind their body by the very view the hold requires.

        With both holds captured the later one overwrote the fabrication and nothing
        looked wrong. With the left hold dropped - a failed orientation check, a short
        hold, a patient who stopped - the hanging arm was the reported result, and that
        reads as a near-total loss of range in a limb that is fine.
        """
        await finalize(db, rom_payload(["shoulder_flexion_right"]))
        keys = set(stored_metrics(db))
        assert "rom_shoulder_flexion_right" in keys
        assert "rom_shoulder_flexion_left" not in keys, (
            "a right-side hold reported a left shoulder measurement"
        )

    @pytest.mark.parametrize("movement", sorted(MOVEMENTS))
    async def test_each_movement_reports_only_its_declared_metrics(
        self, movement, monkeypatch
    ):
        fake = FakeDB(booking=a_booking())
        monkeypatch.setattr("app.api.rom.service.db", fake, raising=False)
        await finalize(fake, rom_payload([movement]))
        declared = set(MOVEMENTS[movement]["metrics"])
        reported = set(stored_metrics(fake))
        assert reported <= declared, (
            f"{movement} reported {sorted(reported - declared)}, which it does not "
            "measure"
        )

    async def test_the_movement_map_covers_every_supported_metric(self):
        """
        A metric in the registry that no movement captures is a row that can only ever
        be blank; a movement declaring a metric the registry does not support is a key
        the report cannot render. Neither shows up in a capture test.
        """
        declared = {k for spec in MOVEMENTS.values() for k in spec["metrics"]}
        supported = {s.key for s in supported_rom_metrics()}
        assert declared == supported

    async def test_a_client_supplied_view_cannot_override_the_server(self, db):
        """
        The client sends the frames; it does not also get to say what they prove. A hold
        mislabelled as the opposite side would have the far limb measured through the
        near one and reported as the patient's range.
        """
        payload = rom_payload(["knee_flexion_left"])
        payload["movements"]["knee_flexion_left"]["view"] = "rightside"
        await finalize(db, payload)
        assert "rom_knee_flexion_left" in stored_metrics(db)


# ---------------------------------------------------------------------------
# Payload shape the report depends on
# ---------------------------------------------------------------------------


class TestStoredPayload:
    async def test_metrics_carry_the_fields_the_report_renders(self, db):
        await finalize(db, rom_payload(["knee_flexion_left"]))
        metric = stored_metrics(db)["rom_knee_flexion_left"]
        for field in ("value", "status", "unit", "clinicalName", "normalRange"):
            assert field in metric, f"missing {field}"

    async def test_rom_metrics_carry_a_minimal_detectable_change(self, db):
        """
        ROM is the modality clinicians track visit to visit, so a delta without an MDC
        beside it is the one number this product must not show. Every ROM metric fell
        through to "does not track change" until the repeatability study covered them.
        """
        await finalize(db, rom_payload(["knee_flexion_left", "shoulder_abduction"]))
        for key, metric in stored_metrics(db).items():
            assert metric.get("mdc95") is not None, f"{key} has no MDC95"

    async def test_the_capture_records_which_movements_were_performed(self, db):
        await finalize(db, rom_payload(["knee_flexion_left", "hip_flexion_left"]))
        created = db.romanalysis.created[0]
        assert set(created["capturedMovements"].split(",")) == {
            "knee_flexion_left", "hip_flexion_left"
        }
        assert created["totalFrames"] == 120


# ---------------------------------------------------------------------------
# Capture quality the report depends on
# ---------------------------------------------------------------------------


class TestCaptureQuality:
    """
    All of this was computed and then dropped on the floor. The stored payload carried
    metrics and nothing else, and the qualityFlags column was never written at all - so
    a capture taken at an assumed aspect ratio, or one performed facing the wrong way,
    reached the clinician with no indication of either.
    """

    async def test_a_hold_facing_the_wrong_way_is_reported(self, db):
        payload = rom_payload(["knee_flexion_left"])
        # Performed with the RIGHT side to the camera, but submitted for the left-knee
        # movement, whose view the server fixes at 'leftside'.
        payload["movements"]["knee_flexion_left"] = hold(
            "knee_flexion_left", view="leftside"
        )
        payload["movements"]["knee_flexion_left"]["samples"] = hold(
            "knee_flexion_right"
        )["samples"]
        await finalize(db, payload)
        warnings = stored_payload(db)["orientationWarnings"]
        assert warnings, "a wrong-way hold was stored with no warning"
        assert "knee_flexion_left" in warnings[0]

    async def test_a_correct_capture_carries_no_warning(self, db):
        await finalize(db, rom_payload(["knee_flexion_left"]))
        assert stored_payload(db)["orientationWarnings"] == []

    async def test_missing_capture_dimensions_flag_the_assumption(self, db):
        """
        Normalised landmarks carry no aspect ratio, so one has to be assumed - and the
        assumption skews every angle. It must reach the report.
        """
        payload = rom_payload(["knee_flexion_left"])
        payload.pop("imageWidth")
        payload.pop("imageHeight")
        await finalize(db, payload)
        assert stored_payload(db)["aspectAssumed"] is True
        assert "aspectRatioAssumed" in stored_flags(db)

    async def test_a_dimensioned_capture_does_not_flag_it(self, db):
        await finalize(db, rom_payload(["knee_flexion_left"]))
        assert stored_payload(db)["aspectAssumed"] is False
        assert "aspectRatioAssumed" not in stored_flags(db)

    async def test_quality_flags_are_written_to_their_own_column(self, db):
        await finalize(db, rom_payload())
        flags = stored_flags(db)
        assert flags["statusCounts"], "no status breakdown stored"
        assert set(flags["viewsCaptured"]) == {"front", "leftside", "rightside"}

    async def test_the_frame_count_per_movement_is_recorded(self, db):
        await finalize(db, rom_payload(["knee_flexion_left", "shoulder_abduction"]))
        per_movement = stored_payload(db)["framesPerMovement"]
        assert per_movement == {"knee_flexion_left": 60, "shoulder_abduction": 60}


# ---------------------------------------------------------------------------
# The contract the report is typed against
# ---------------------------------------------------------------------------


class TestPayloadContract:
    """
    frontend/src/types/metrics.ts declares MetricsPayload and MetricResult, and the
    report is written against them. Nothing enforces the agreement at runtime: the
    payload arrives as JSON and is asserted into the type at the boundary, so a missing
    REQUIRED field typechecks on both sides and shows up as a blank in the report, or as
    a crash if a consumer forgets to guard.

    These pin the required fields by name. If the TypeScript interface gains one, this
    is where the backend finds out.
    """

    # Non-optional in MetricsPayload.
    REQUIRED_PAYLOAD = {
        "calibrationDate",
        "personId",
        "schemaVersion",
        "viewsCaptured",
        "metrics",
    }
    # Non-optional in MetricResult.
    REQUIRED_METRIC = {
        "key",
        "clinicalName",
        "value",
        "unit",
        "status",
        "spread",
        "nFrames",
        "viewUsed",
        "normalRange",
        "reference",
        "detail",
    }

    async def test_the_payload_carries_every_required_field(self, db):
        await finalize(db, rom_payload())
        missing = self.REQUIRED_PAYLOAD - set(stored_payload(db))
        assert not missing, f"MetricsPayload is missing {sorted(missing)}"

    async def test_every_metric_carries_every_required_field(self, db):
        await finalize(db, rom_payload())
        for key, metric in stored_metrics(db).items():
            missing = self.REQUIRED_METRIC - set(metric)
            assert not missing, f"{key} is missing {sorted(missing)}"

    async def test_views_captured_names_real_views(self, db):
        await finalize(db, rom_payload())
        assert set(stored_payload(db)["viewsCaptured"]) <= {
            "front", "back", "leftside", "rightside"
        }

    async def test_the_payload_is_json_serialisable(self, db):
        """
        It goes into a JSONB column and back out over HTTP. A numpy float or a datetime
        left in it raises at insert time, after the patient has done all ten movements.
        """
        import json

        await finalize(db, rom_payload())
        json.dumps(stored_payload(db))
        json.dumps(stored_flags(db))

    async def test_a_withheld_metric_carries_no_value_and_explains_itself(self, db):
        """The invariant the whole pipeline is built on: never shipped *and* wrong."""
        await finalize(db, rom_payload())
        for key, metric in stored_metrics(db).items():
            if metric["status"] in ("measured", "low_confidence"):
                assert metric["value"] is not None, f"{key} claims measured with no value"
            else:
                assert metric["value"] is None, f"{key} withheld but carries a value"
                assert metric["detail"], f"{key} withheld with no explanation"

    async def test_landmark_keys_arriving_as_strings_are_handled(self, db):
        """
        JSON object keys are always strings, so every landmark index reaches the service
        as "23" rather than 23. Python tests that build the payload in-process pass
        integers and would never notice a lookup that assumed them.
        """
        import json

        payload = json.loads(json.dumps(rom_payload(["knee_flexion_left"])))
        first = payload["movements"]["knee_flexion_left"]["samples"][0]["pose"]
        assert all(isinstance(k, str) for k in first), "test fixture is not JSON-shaped"
        await finalize(db, payload)
        assert stored_metrics(db)["rom_knee_flexion_left"]["value"] is not None


# ---------------------------------------------------------------------------
# Booking status
# ---------------------------------------------------------------------------


class TestBookingStatus:
    """
    A screening may only be started against a CONFIRMED or COMPLETED booking.

    The posture and gait services have always enforced this; ROM did not. So a
    cancelled booking - which keeps its screening count, because cancelling does not
    consume one - could start a ROM session that its siblings refused. The patient
    would perform all ten movements and only then be told.

    The booking picker offered those bookings too: it filtered on remaining count
    alone. That is fixed in frontend/src/lib/screenableBooking.ts, and asserted here so
    the server does not rely on the client getting it right.
    """

    @pytest.mark.parametrize("status", ["CANCELLED", "PENDING", "REFUNDED", "DRAFT"])
    async def test_an_unusable_booking_cannot_start_a_screening(self, db, status):
        db.booking.record = a_booking(status=status)
        with pytest.raises(BadRequestException, match="not valid for analysis"):
            await ROMAnalysisService.start_analysis("user_1", "bk_1")

    @pytest.mark.parametrize("status", ["CONFIRMED", "COMPLETED"])
    async def test_a_usable_booking_starts_normally(self, db, status):
        db.booking.record = a_booking(status=status)
        session = await ROMAnalysisService.start_analysis("user_1", "bk_1")
        assert session["sessionId"]

    async def test_a_booking_cancelled_mid_session_cannot_be_finalised(self, db):
        """
        The status is re-checked on finalize, not just on start.

        Without that, a session begun while the booking was valid could still be saved
        against it minutes later - and a screening credit spent on a booking the
        patient had since cancelled.
        """
        db.booking.record = a_booking(status="CANCELLED")
        with pytest.raises(BadRequestException, match="not valid for analysis"):
            await finalize(db, rom_payload(["knee_flexion_left"]))
        assert db.romanalysis.created == []
        assert db.booking.updated == []
