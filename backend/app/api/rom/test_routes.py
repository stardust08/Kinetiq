"""
HTTP-layer tests for the range-of-motion endpoints.

Distinct from test_service.py, which calls the service directly. What is covered here is
only what the route layer owns and the service cannot see: request-body validation,
authentication, the response envelope the browser client unwraps, and the mapping from a
domain exception to a status code.

That envelope is the part most likely to break silently. Every route wraps its result in
`{"data": ...}` and the frontend reaches through it - `response.data.data.analysis` - so
a route that returned the analysis directly would typecheck on both sides and hand the
report `undefined`.

Authentication is overridden rather than faked with a token, and the database is faked,
because neither is what these tests are about.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.rom.routes import rom_router
from app.core.dependencies import get_current_active_user
from app.core.exceptions import BadRequestException, UnauthorizedException


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; these tests never touch a database."""
    yield


class FakeTable:
    def __init__(self, record: Optional[Any] = None):
        self.record = record
        self.created: List[Dict] = []
        self.rows: List[Any] = []

    async def find_first(self, **kwargs):
        return self.record

    async def find_many(self, **kwargs):
        return self.rows

    async def create(self, data: Dict, **kwargs):
        self.created.append(data)
        return SimpleNamespace(id="rom_1")

    async def update(self, **kwargs):
        return SimpleNamespace(id="bk_1", remainingScreeningCount=2)


class FakeDB:
    def __init__(self, booking=None):
        self.booking = FakeTable(booking)
        self.romanalysis = FakeTable()


def a_booking(remaining: int = 3, status: str = "CONFIRMED"):
    return SimpleNamespace(
        id="bk_1", userId="user_1", status=status, remainingScreeningCount=remaining,
        usedScreeningCount=0, totalScreeningCount=3,
    )


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(rom_router, prefix="/api")

    # Domain exceptions carry their own status; the real app installs handlers for them
    # in middleware, so the same mapping is registered here.
    from fastapi.responses import JSONResponse

    @app.exception_handler(BadRequestException)
    async def _bad(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(UnauthorizedException)
    async def _unauth(request, exc):
        return JSONResponse(status_code=401, content={"detail": str(exc)})

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(
        id="user_1", status="ACTIVE"
    )
    fake = FakeDB(booking=a_booking())
    monkeypatch.setattr("app.api.rom.service.db", fake, raising=False)
    with TestClient(app) as c:
        c.fake_db = fake  # type: ignore[attr-defined]
        yield c


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------


class TestRequestValidation:
    def test_start_requires_a_booking_id(self, client):
        assert client.post("/api/rom/start-analysis", json={}).status_code == 422

    def test_finalize_requires_every_field(self, client):
        assert client.post(
            "/api/rom/finalize-analysis", json={"sessionId": "s"}
        ).status_code == 422

    def test_cancel_requires_a_session_id(self, client):
        assert client.post("/api/rom/cancel-analysis", json={}).status_code == 422

    def test_a_malformed_rom_payload_is_rejected_not_crashed(self, client):
        """A client bug must produce a 4xx, never a 500 with a stack trace."""
        response = client.post(
            "/api/rom/finalize-analysis",
            json={"sessionId": "s", "bookingId": "bk_1", "romData": {"movements": {}}},
        )
        assert response.status_code == 400
        assert "movement data" in response.json()["detail"].lower()

    def test_rom_data_must_be_an_object(self, client):
        response = client.post(
            "/api/rom/finalize-analysis",
            json={"sessionId": "s", "bookingId": "bk_1", "romData": "not an object"},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class TestAuthentication:
    @pytest.mark.parametrize(
        "method,path,body",
        [
            ("post", "/api/rom/start-analysis", {"bookingId": "bk_1"}),
            ("post", "/api/rom/finalize-analysis",
             {"sessionId": "s", "bookingId": "bk_1", "romData": {}}),
            ("post", "/api/rom/cancel-analysis", {"sessionId": "s"}),
            ("get", "/api/rom/my-analyses", None),
        ],
    )
    def test_every_endpoint_requires_a_user(self, method, path, body):
        """
        No override installed, so the real dependency runs and must refuse.

        A screening endpoint left unauthenticated would let anyone burn another
        patient's screening credits and read their measurements.
        """
        app = FastAPI()
        app.include_router(rom_router, prefix="/api")
        with TestClient(app, raise_server_exceptions=False) as c:
            response = getattr(c, method)(path, json=body) if body else getattr(c, method)(path)
        assert response.status_code in (401, 403), (
            f"{path} answered {response.status_code} with no authenticated user"
        )


# ---------------------------------------------------------------------------
# Response envelope
# ---------------------------------------------------------------------------


class TestResponseEnvelope:
    def test_start_returns_a_session_the_client_can_use(self, client):
        body = client.post("/api/rom/start-analysis", json={"bookingId": "bk_1"}).json()
        # The browser reads response.data.data.sessionId
        assert "data" in body
        assert body["data"]["sessionId"]
        assert body["data"]["bookingId"] == "bk_1"
        assert isinstance(body["data"]["movements"], list)

    def test_start_lists_exactly_the_movements_the_client_will_perform(self, client):
        from app.api.rom.service import MOVEMENTS

        body = client.post("/api/rom/start-analysis", json={"bookingId": "bk_1"}).json()
        assert set(body["data"]["movements"]) == set(MOVEMENTS)

    def test_start_is_refused_when_no_screenings_remain(self, client):
        client.fake_db.booking.record = a_booking(remaining=0)
        response = client.post("/api/rom/start-analysis", json={"bookingId": "bk_1"})
        assert response.status_code == 400

    def test_start_is_refused_for_a_booking_the_user_does_not_own(self, client):
        client.fake_db.booking.record = None
        response = client.post("/api/rom/start-analysis", json={"bookingId": "bk_1"})
        assert response.status_code == 401

    def test_cancel_deducts_nothing_and_says_so(self, client):
        body = client.post("/api/rom/cancel-analysis", json={"sessionId": "s"}).json()
        assert "data" in body
        assert "no screening count" in body["data"]["message"].lower()
        assert client.fake_db.romanalysis.created == []

    def test_my_analyses_returns_a_list_under_data(self, client):
        body = client.get("/api/rom/my-analyses").json()
        assert isinstance(body["data"], list)

    def test_my_analyses_passes_paging_through(self, client):
        assert client.get("/api/rom/my-analyses?limit=5&offset=10").status_code == 200
