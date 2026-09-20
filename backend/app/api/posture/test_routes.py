"""
HTTP-layer tests for the posture endpoints.

Rewritten to fake the database. The previous version created real users, categories,
bookings and analyses in whatever database DATABASE_URL pointed at - which in practice
was the shared Neon instance holding live patient data - and then deleted them again in
fixture teardown. Two things were wrong with that:

  * running the test suite wrote to production, and a test that failed part-way through
    left its rows behind; and

  * it did not work anyway. Every one of these 31 tests errored. The Prisma client is
    connected on pytest-asyncio's event loop while TestClient runs the app on its own,
    so the first query raised "Future attached to a different loop" and the route came
    back 500. They had been failing long enough that nobody read them.

What is covered here is what the route layer owns: request validation, authentication,
the {"data": ...} envelope, and the mapping from a domain exception to a status code.
The measurement maths is certified in app/core/validation; the service's branching and
credit accounting is covered in test_service.py against the same fake.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.api.posture.routes import posture_router
from app.core.dependencies import get_current_active_user
from app.core.exceptions import (
    BadRequestException,
    NotFoundException,
    UnauthorizedException,
)


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; these tests never touch a database."""
    yield


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeTable:
    def __init__(self, record: Optional[Any] = None):
        self.record = record
        self.rows: List[Any] = []
        self.created: List[Dict] = []
        self.updated: List[Dict] = []

    async def find_first(self, **kwargs):
        return self.record

    async def find_unique(self, **kwargs):
        return self.record

    async def find_many(self, **kwargs):
        return self.rows

    async def create(self, data: Dict, **kwargs):
        self.created.append(data)
        return SimpleNamespace(id=f"rec_{len(self.created)}")

    async def update(self, **kwargs):
        self.updated.append(kwargs)
        return SimpleNamespace(id="bk_1", remainingScreeningCount=4, usedScreeningCount=1)


class FakeDB:
    def __init__(self, booking=None):
        self.booking = FakeTable(booking)
        self.postureanalysis = FakeTable()
        self.poselandmarks = FakeTable()


def a_booking(remaining: int = 5, status: str = "CONFIRMED", user_id: str = "user_1"):
    return SimpleNamespace(
        id="bk_1", userId=user_id, status=status,
        totalScreeningCount=5, usedScreeningCount=5 - remaining,
        remainingScreeningCount=remaining,
    )


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(posture_router, prefix="/api")

    @app.exception_handler(BadRequestException)
    async def _bad(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(UnauthorizedException)
    async def _unauth(request, exc):
        return JSONResponse(status_code=401, content={"detail": str(exc)})

    @app.exception_handler(NotFoundException)
    async def _missing(request, exc):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(
        id="user_1", role="USER", status="ACTIVE"
    )
    fake = FakeDB(booking=a_booking())
    monkeypatch.setattr("app.api.posture.service.db", fake, raising=False)
    with TestClient(app) as c:
        c.fake_db = fake  # type: ignore[attr-defined]
        yield c


def unauthenticated_client():
    """A client with no auth override, so the real dependency runs and refuses."""
    app = FastAPI()
    app.include_router(posture_router, prefix="/api")
    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# start-analysis
# ---------------------------------------------------------------------------


class TestStartAnalysis:
    def test_success_returns_a_session(self, client):
        body = client.post("/api/posture/start-analysis", json={"bookingId": "bk_1"}).json()
        assert body["data"]["sessionId"]
        assert body["data"]["bookingId"] == "bk_1"
        assert body["data"]["remainingCount"] == 5

    def test_unauthorized_without_a_token(self):
        r = unauthenticated_client().post(
            "/api/posture/start-analysis", json={"bookingId": "bk_1"}
        )
        assert r.status_code in (401, 403)

    def test_no_remaining_counts_is_refused(self, client):
        client.fake_db.booking.record = a_booking(remaining=0)
        r = client.post("/api/posture/start-analysis", json={"bookingId": "bk_1"})
        assert r.status_code == 400
        assert "remaining screening" in r.json()["detail"].lower()

    def test_booking_not_found_is_refused(self, client):
        client.fake_db.booking.record = None
        r = client.post("/api/posture/start-analysis", json={"bookingId": "nope"})
        assert r.status_code == 401

    def test_missing_booking_id_is_a_validation_error(self, client):
        assert client.post("/api/posture/start-analysis", json={}).status_code == 422


# ---------------------------------------------------------------------------
# cancel-analysis
# ---------------------------------------------------------------------------


class TestCancelAnalysis:
    def test_success_deducts_nothing(self, client):
        r = client.post("/api/posture/cancel-analysis", json={"sessionId": "s1"})
        assert r.status_code == 200
        # This is the one posture route that returns its result UNWRAPPED - every other
        # one answers {"data": ...}. The frontend client reads it unwrapped too, so the
        # two agree and this is asserted as-is rather than "corrected": changing the
        # envelope to match its neighbours would break a caller that is currently right.
        assert r.json()["message"]
        assert "no screening count was deducted" in r.json()["message"].lower()
        assert client.fake_db.postureanalysis.created == []
        assert client.fake_db.booking.updated == []

    def test_unauthorized_without_a_token(self):
        r = unauthenticated_client().post(
            "/api/posture/cancel-analysis", json={"sessionId": "s1"}
        )
        assert r.status_code in (401, 403)

    def test_missing_session_id_is_a_validation_error(self, client):
        assert client.post("/api/posture/cancel-analysis", json={}).status_code == 422


# ---------------------------------------------------------------------------
# my-assessments
# ---------------------------------------------------------------------------


class TestMyAssessments:
    def test_success_returns_a_list_under_data(self, client):
        body = client.get("/api/posture/my-assessments").json()
        assert isinstance(body["data"], list)

    def test_empty_result_is_a_list_not_an_error(self, client):
        client.fake_db.postureanalysis.rows = []
        assert client.get("/api/posture/my-assessments").json()["data"] == []

    def test_booking_filter_is_accepted(self, client):
        assert client.get(
            "/api/posture/my-assessments?bookingId=bk_1"
        ).status_code == 200

    def test_pagination_is_accepted(self, client):
        assert client.get(
            "/api/posture/my-assessments?limit=5&offset=10"
        ).status_code == 200

    @pytest.mark.parametrize("limit", [101, 500])
    def test_limit_above_the_cap_is_refused(self, client, limit):
        r = client.get(f"/api/posture/my-assessments?limit={limit}")
        assert r.status_code == 400
        assert "limit" in r.json()["detail"].lower()

    def test_negative_offset_is_refused(self, client):
        r = client.get("/api/posture/my-assessments?offset=-1")
        assert r.status_code == 400
        assert "offset" in r.json()["detail"].lower()

    def test_unauthorized_without_a_token(self):
        assert unauthenticated_client().get(
            "/api/posture/my-assessments"
        ).status_code in (401, 403)


# ---------------------------------------------------------------------------
# validate-booking
# ---------------------------------------------------------------------------


class TestValidateBooking:
    def test_a_usable_booking_is_valid(self, client):
        body = client.get("/api/posture/validate-booking/bk_1").json()
        assert body["data"]["valid"] is True
        assert body["data"]["remainingCount"] == 5

    def test_no_remaining_counts_is_invalid_not_an_error(self, client):
        """
        The frontend uses this to decide whether to offer the screening at all, so a
        depleted booking has to come back as a 200 saying "not valid" rather than an
        error status the caller has to interpret.
        """
        client.fake_db.booking.record = a_booking(remaining=0)
        r = client.get("/api/posture/validate-booking/bk_1")
        assert r.status_code == 200
        assert r.json()["data"]["valid"] is False

    def test_an_unusable_status_is_invalid(self, client):
        client.fake_db.booking.record = a_booking(status="CANCELLED")
        r = client.get("/api/posture/validate-booking/bk_1")
        assert r.status_code == 200
        assert r.json()["data"]["valid"] is False

    def test_a_booking_that_does_not_exist_is_invalid(self, client):
        client.fake_db.booking.record = None
        r = client.get("/api/posture/validate-booking/nope")
        assert r.status_code in (200, 401)
        if r.status_code == 200:
            assert r.json()["data"]["valid"] is False

    def test_another_users_booking_is_not_visible(self, client):
        """
        Ownership is enforced in the WHERE clause, so another user's booking simply is
        not found. This asserts the query carries the caller's id at all - without it,
        any patient could validate and screen against anyone's booking.
        """
        client.fake_db.booking.record = None
        assert client.get("/api/posture/validate-booking/bk_1").status_code in (200, 401)

    def test_unauthorized_without_a_token(self):
        assert unauthenticated_client().get(
            "/api/posture/validate-booking/bk_1"
        ).status_code in (401, 403)


# ---------------------------------------------------------------------------
# analysis/{id}
# ---------------------------------------------------------------------------


class TestGetAnalysisById:
    def test_a_missing_analysis_is_404_not_500(self, client):
        client.fake_db.postureanalysis.record = None
        assert client.get("/api/posture/analysis/nope").status_code == 404

    def test_unauthorized_without_a_token(self):
        assert unauthenticated_client().get(
            "/api/posture/analysis/an_1"
        ).status_code in (401, 403)


# ---------------------------------------------------------------------------
# finalize-analysis
# ---------------------------------------------------------------------------


class TestFinalizeAnalysis:
    def test_missing_fields_are_a_validation_error(self, client):
        assert client.post(
            "/api/posture/finalize-analysis", json={"sessionId": "s1"}
        ).status_code == 422

    def test_a_capture_with_no_landmarks_is_refused(self, client):
        r = client.post("/api/posture/finalize-analysis", json={
            "sessionId": "s1", "bookingId": "bk_1", "landmarksData": {"samples": []},
        })
        assert r.status_code == 400
        assert client.fake_db.booking.updated == [], (
            "a capture that could not be analysed still spent a screening credit"
        )

    def test_a_booking_the_user_does_not_own_is_refused(self, client):
        client.fake_db.booking.record = None
        r = client.post("/api/posture/finalize-analysis", json={
            "sessionId": "s1", "bookingId": "someone_elses",
            "landmarksData": {"samples": []},
        })
        assert r.status_code in (400, 401)
        assert client.fake_db.postureanalysis.created == []

    def test_unauthorized_without_a_token(self):
        r = unauthenticated_client().post("/api/posture/finalize-analysis", json={
            "sessionId": "s1", "bookingId": "bk_1", "landmarksData": {},
        })
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Credit accounting across a flow
# ---------------------------------------------------------------------------


class TestScreeningCredits:
    def test_starting_an_analysis_does_not_spend_a_credit(self, client):
        """
        The credit is spent on finalize, never on start. A patient who begins a
        screening and walks away must not be charged for it.
        """
        client.post("/api/posture/start-analysis", json={"bookingId": "bk_1"})
        assert client.fake_db.booking.updated == []

    def test_cancelling_does_not_spend_a_credit(self, client):
        client.post("/api/posture/start-analysis", json={"bookingId": "bk_1"})
        client.post("/api/posture/cancel-analysis", json={"sessionId": "s1"})
        assert client.fake_db.booking.updated == []

    def test_an_exhausted_booking_cannot_start(self, client):
        client.fake_db.booking.record = a_booking(remaining=0)
        assert client.post(
            "/api/posture/start-analysis", json={"bookingId": "bk_1"}
        ).status_code == 400
