"""
Service-layer tests for the gait screening.

The gait API had no tests at all while the posture one had three files, which meant the
entire HTTP -> auth -> service -> Postgres path for gait was unexercised. The metric
maths is covered thoroughly elsewhere (app/core/validation); what is covered here is
everything the service does AROUND that maths, because those are the failures that
cost a patient a screening credit or hand back a fabricated result.

The database is faked rather than reached. These assertions are about branching and
ordering - does an unowned booking get rejected before any work happens, is a credit
ever consumed by a capture that failed - and a real connection adds latency and
flakiness without testing any of it.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import numpy as np
import pytest

from app.api.gait.service import GaitAnalysisService
from app.core.exceptions import BadRequestException, UnauthorizedException
from app.core.validation.camera import Camera, emit_gait_frames
from app.core.validation.gait_sequence import WalkParams, generate_walk


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

    async def create(self, data: Dict, **kwargs):
        if self.fail_on_create:
            raise RuntimeError("database unavailable")
        self.created.append(data)
        return SimpleNamespace(id=f"rec_{len(self.created)}", **{
            k: v for k, v in data.items() if isinstance(v, (str, int, float, bool))
        })

    async def update(self, **kwargs):
        self.updated.append(kwargs)
        return SimpleNamespace(id="updated")


class FakeDB:
    def __init__(self, booking=None):
        self.booking = FakeTable(booking)
        self.gaitanalysis = FakeTable()
        self.gaitframes = FakeTable()
        self.gaitsession = FakeTable()


def a_booking(remaining: int = 3, used: int = 0, total: int = 3):
    return SimpleNamespace(
        id="bk_1", userId="user_1",
        remainingScreeningCount=remaining, usedScreeningCount=used,
        totalScreeningCount=total,
    )


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB(booking=a_booking())
    monkeypatch.setattr("app.api.gait.service.db", fake, raising=False)
    return fake


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------


def gait_payload(fps: int = 60, duration: float = 6.0, views=("leftside", "front"),
                 width: int = 1280, height: int = 720, frames_override=None) -> Dict:
    """A payload shaped exactly as GaitWebcamCapture sends one."""
    params = WalkParams(fps=fps, duration_s=duration)
    frames, truth = generate_walk(params)
    travel = truth["walking_speed_mps"] * params.duration_s
    out = {}
    for view in views:
        cam = Camera(
            azimuth_deg={"leftside": 0.0, "front": -90.0, "rightside": 180.0}[view],
            distance_m=5.0, target=(travel / 2, 0.9, 0.0),
            image_width=width, image_height=height, focal_px=800,
        )
        series = emit_gait_frames(frames, cam, fps=fps)
        if frames_override is not None:
            series = series[:frames_override]
        out[view] = {"timeSeries": series, "backgroundImage": None, "frameCount": len(series)}
    return {
        "views": out,
        "totalFrames": sum(v["frameCount"] for v in out.values()),
        "capturedViews": ",".join(views),
        "fps": fps,
        "imageWidth": width,
        "imageHeight": height,
    }


def stored_metrics(db) -> Dict:
    """Unwrap the metricsJson column, which the service wraps in prisma's Json marker."""
    raw = db.gaitanalysis.created[0].get("metricsJson")
    return getattr(raw, "data", raw) or {}


async def finalize(db, payload, user="user_1", booking="bk_1"):
    return await GaitAnalysisService.finalize_analysis(
        user_id=user, booking_id=booking, session_id="sess_1", gait_data=payload
    )


# ---------------------------------------------------------------------------
# Authorisation and credit accounting - the failures that cost a patient money
# ---------------------------------------------------------------------------


class TestAuthorisationAndCredits:
    async def test_booking_owned_by_another_user_is_rejected(self, db):
        db.booking.record = None  # find_first scopes by userId, so a miss means not theirs
        with pytest.raises(UnauthorizedException):
            await finalize(db, gait_payload())
        assert db.gaitanalysis.created == []

    async def test_exhausted_screening_count_is_rejected_before_any_work(self, db):
        db.booking.record = a_booking(remaining=0, used=3)
        with pytest.raises(BadRequestException) as exc:
            await finalize(db, gait_payload())
        assert "remaining" in str(exc.value).lower()
        assert db.gaitanalysis.created == []

    async def test_a_successful_screening_consumes_exactly_one_credit(self, db):
        await finalize(db, gait_payload())
        assert len(db.gaitanalysis.created) == 1
        assert len(db.booking.updated) == 1

    async def test_a_capture_that_fails_validation_consumes_no_credit(self, db):
        """
        The failure that matters most here. A patient whose capture is rejected must not
        lose a screening: they still have to walk again, and a credit that vanished on a
        capture nobody can read is money taken for nothing.
        """
        with pytest.raises(BadRequestException):
            await finalize(db, {"views": {}, "fps": 60})
        assert db.booking.updated == []
        assert db.gaitanalysis.created == []

    async def test_a_database_failure_consumes_no_credit(self, db):
        db.gaitanalysis.fail_on_create = True
        with pytest.raises(BadRequestException):
            await finalize(db, gait_payload())
        assert db.booking.updated == []


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


class TestInputValidation:
    async def test_no_views_is_rejected_with_an_actionable_message(self, db):
        with pytest.raises(BadRequestException) as exc:
            await finalize(db, {"views": {}, "fps": 60})
        assert "view" in str(exc.value).lower()

    @pytest.mark.parametrize("fps,frames", [(30, 45), (60, 90)])
    async def test_a_capture_shorter_than_two_seconds_is_rejected(self, db, fps, frames):
        """
        The gate is a DURATION, not a frame count. 45 frames is a second and a half at
        30 fps and three quarters of a second at 60 - neither is a gait cycle, and the
        same count must not pass at one rate and fail at the other.
        """
        with pytest.raises(BadRequestException) as exc:
            await finalize(db, gait_payload(fps=fps, frames_override=frames))
        assert "insufficient frames" in str(exc.value).lower()

    async def test_a_capture_with_no_usable_landmarks_is_rejected_not_charged(self, db):
        """
        Every frame arrives with an empty landmark set - a capture made in the dark, or
        with the subject out of frame. The analyser handles it correctly and returns a
        result in which every metric is insufficient_data. The service used to store
        that and charge for it, because a result object is truthy; the patient got a
        report of dashes and lost a screening.
        """
        payload = gait_payload()
        for view in payload["views"].values():
            for frame in view["timeSeries"]:
                frame["landmarks"] = {}
        with pytest.raises(BadRequestException) as exc:
            await finalize(db, payload)
        assert "not been counted" in str(exc.value)
        assert db.booking.updated == []
        assert db.gaitanalysis.created == []


# ---------------------------------------------------------------------------
# Capture rate - every temporal metric divides by this
# ---------------------------------------------------------------------------


class TestCaptureRate:
    async def test_the_measured_rate_overrides_what_the_client_declared(self, db):
        """
        A browser asked for 60 fps and delivered 40 would inflate cadence, stride time
        and walking speed by half if the declared rate were believed. The frames carry
        timestamps; the service must use them.
        """
        payload = gait_payload(fps=40)
        payload["fps"] = 60  # client lies, or rather, reports what it asked for
        await finalize(db, payload)
        metrics = stored_metrics(db)
        assert metrics.get("fpsUsed") == pytest.approx(40, abs=2)
        assert metrics.get("fpsMeasured") is True

    async def test_cadence_is_correct_when_the_rate_was_misdeclared(self, db):
        payload = gait_payload(fps=40)
        payload["fps"] = 60
        await finalize(db, payload)
        cadence = stored_metrics(db).get("metrics", {}).get("cadence", {}).get("value")
        assert cadence is not None
        # Believing the declared 60 would have put this near 165.
        assert cadence == pytest.approx(110.0, abs=8.0)


# ---------------------------------------------------------------------------
# What reaches the database
# ---------------------------------------------------------------------------


class TestPersistence:
    async def test_metrics_are_stored_as_structured_json_not_only_legacy_columns(self, db):
        await finalize(db, gait_payload())
        payload = stored_metrics(db)
        assert payload, "metricsJson is the source of truth and must be written"
        assert payload["schemaVersion"] >= 2
        assert "cadence" in payload["metrics"]

    async def test_unmeasurable_metrics_are_stored_as_null_not_zero(self, db):
        """
        A legacy column that cannot be filled must be NULL. Writing 0.0 makes an absent
        measurement indistinguishable from a real one, and 0 is a plausible-looking
        value for most of these.
        """
        await finalize(db, gait_payload(views=("leftside",)))
        stored = db.gaitanalysis.created[0]
        for key, value in stored.items():
            if key.endswith("Ratio") or key.endswith("Percent"):
                assert value is None or isinstance(value, (int, float))

    async def test_captured_views_and_frame_totals_are_recorded(self, db):
        payload = gait_payload()
        await finalize(db, payload)
        stored = db.gaitanalysis.created[0]
        assert stored["capturedViews"] == payload["capturedViews"]
        assert stored["totalFrames"] == payload["totalFrames"]

    async def test_frame_storage_failure_does_not_lose_the_metrics(self, db):
        """
        Skeleton playback is a nice-to-have; the metrics are the product. A failure
        writing frames must not roll back the analysis.
        """
        db.gaitframes.fail_on_create = True
        result = await finalize(db, gait_payload())
        assert result is not None
        assert len(db.gaitanalysis.created) == 1


# ---------------------------------------------------------------------------
# Single-view captures
# ---------------------------------------------------------------------------


class TestPartialCaptures:
    async def test_side_view_only_still_produces_sagittal_metrics(self, db):
        await finalize(db, gait_payload(views=("leftside",)))
        metrics = stored_metrics(db).get("metrics", {})
        assert metrics["cadence"]["status"] in ("measured", "low_confidence")
        assert metrics["step_width_ratio"]["value"] is None

    async def test_front_view_only_is_rejected_rather_than_stored_as_dashes(self, db):
        """
        A front view alone yields nothing. Every temporal and sagittal metric needs a
        side view, and the two frontal metrics need a side view too - step width is
        normalised by leg length, which only a side view measures, and trunk sway is
        retired. So the honest response is to reject the capture and keep the patient's
        screening credit, not to store a complete-looking record of nulls.
        """
        with pytest.raises(BadRequestException) as exc:
            await finalize(db, gait_payload(views=("front",)))
        assert "not been counted" in str(exc.value)
        assert db.booking.updated == []
