"""
HTTP-layer tests for the authentication endpoints.

Rewritten to fake the service layer. The previous version drove the real OTPService
against the live database and failed for reasons that were properties of shared state
rather than defects: a second run collided on the unique phone constraint, and the OTP
rate limit blocked the suite as soon as two tests used the same number. It also built
its client from app.main at import time, so the TestClient context exiting fired the
app's shutdown event and DISCONNECTED the shared Prisma client - which broke every test
in every file that happened to run afterwards.

What is covered here is what the route layer owns: request validation, the shape of the
response the browser unwraps, and that an endpoint behind authentication refuses an
anonymous caller. The OTP logic itself is covered in test_service.py.
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.api.auth.routes import auth_router
from app.core.dependencies import get_current_active_user
from app.core.exceptions import BadRequestException, UnauthorizedException


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; these tests never touch a database."""
    yield


A_USER = SimpleNamespace(
    id="user_1", phone="+911234567890", name="A Patient",
    email="patient@example.com", role="USER", status="ACTIVE",
    # /me serialises these, so a fake user without them 500s on a route that works.
    createdAt=datetime(2026, 1, 1), updatedAt=datetime(2026, 1, 2),
)


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    @app.exception_handler(BadRequestException)
    async def _bad(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(UnauthorizedException)
    async def _unauth(request, exc):
        return JSONResponse(status_code=401, content={"detail": str(exc)})

    app.dependency_overrides[get_current_active_user] = lambda: A_USER

    # A local app, deliberately: building one from app.main would register its startup
    # and shutdown events, and the shutdown disconnects the shared Prisma client for
    # every test that runs after this file.
    with TestClient(app) as c:
        yield c


def anonymous_client():
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    # The real app maps these to status codes in its error middleware. Without them a
    # malformed token surfaces as a 500, which would have this test asserting that a
    # rejected credential looks exactly like a server crash.
    @app.exception_handler(UnauthorizedException)
    async def _unauth(request, exc):
        return JSONResponse(status_code=401, content={"detail": str(exc)})

    @app.exception_handler(BadRequestException)
    async def _bad(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    return TestClient(app, raise_server_exceptions=False)


PHONE = "+911234567890"


# ---------------------------------------------------------------------------
# send-otp
# ---------------------------------------------------------------------------


class TestSendOtp:
    def test_success(self, client, monkeypatch):
        async def fake_generate(phone, otp_type):
            return "123456"

        monkeypatch.setattr(
            "app.api.auth.routes.OTPService.generate_otp", fake_generate
        )
        r = client.post("/api/auth/send-otp", json={"phone": PHONE, "type": "LOGIN"})
        assert r.status_code == 200
        assert r.json()["message"]

    def test_rate_limited_requests_are_refused(self, client, monkeypatch):
        async def refuse(phone, otp_type):
            raise BadRequestException("Please wait before requesting new OTP")

        monkeypatch.setattr("app.api.auth.routes.OTPService.generate_otp", refuse)
        r = client.post("/api/auth/send-otp", json={"phone": PHONE, "type": "LOGIN"})
        assert r.status_code == 400
        assert "wait" in r.json()["detail"].lower()

    def test_a_missing_phone_is_a_validation_error(self, client):
        assert client.post(
            "/api/auth/send-otp", json={"type": "LOGIN"}
        ).status_code == 422

    @pytest.mark.parametrize("phone", ["", "not-a-number", "12"])
    def test_a_malformed_phone_is_refused(self, client, phone):
        r = client.post("/api/auth/send-otp", json={"phone": phone, "type": "LOGIN"})
        assert r.status_code in (400, 422), (
            f"{phone!r} was accepted as a phone number"
        )


# ---------------------------------------------------------------------------
# verify-otp
# ---------------------------------------------------------------------------


class TestVerifyOtp:
    def test_an_existing_user_receives_a_token(self, client, monkeypatch):
        async def verified(phone, otp):
            return A_USER, False

        monkeypatch.setattr("app.api.auth.routes.OTPService.verify_otp", verified)
        body = client.post(
            "/api/auth/verify-otp", json={"phone": PHONE, "otp": "123456"}
        ).json()
        assert body["token"]
        assert body["requiresProfileCompletion"] is False

    def test_a_new_user_is_asked_to_complete_their_profile_and_gets_no_token(
        self, client, monkeypatch
    ):
        """
        The token MUST be null here. The frontend briefly logged people in on this
        response, storing a null token and leaving the session in a state where every
        later request failed authentication.
        """
        async def new_user(phone, otp):
            return None, True

        monkeypatch.setattr("app.api.auth.routes.OTPService.verify_otp", new_user)
        body = client.post(
            "/api/auth/verify-otp", json={"phone": PHONE, "otp": "123456"}
        ).json()
        assert body["requiresProfileCompletion"] is True
        assert body["token"] is None
        assert body["user"] is None

    def test_an_invalid_code_is_refused(self, client, monkeypatch):
        async def refuse(phone, otp):
            raise UnauthorizedException("Invalid or expired OTP")

        monkeypatch.setattr("app.api.auth.routes.OTPService.verify_otp", refuse)
        r = client.post("/api/auth/verify-otp", json={"phone": PHONE, "otp": "000000"})
        assert r.status_code == 401

    def test_an_expired_code_is_refused(self, client, monkeypatch):
        async def refuse(phone, otp):
            raise UnauthorizedException("Invalid or expired OTP")

        monkeypatch.setattr("app.api.auth.routes.OTPService.verify_otp", refuse)
        assert client.post(
            "/api/auth/verify-otp", json={"phone": PHONE, "otp": "123456"}
        ).status_code == 401

    @pytest.mark.parametrize("otp", ["", "12", "abcdef", "1234567"])
    def test_a_malformed_code_is_refused(self, client, otp):
        r = client.post("/api/auth/verify-otp", json={"phone": PHONE, "otp": otp})
        assert r.status_code in (400, 401, 422), f"{otp!r} was accepted as an OTP"

    def test_missing_fields_are_a_validation_error(self, client):
        assert client.post(
            "/api/auth/verify-otp", json={"phone": PHONE}
        ).status_code == 422


# ---------------------------------------------------------------------------
# me / logout
# ---------------------------------------------------------------------------


class TestAuthenticatedEndpoints:
    def test_me_returns_the_caller(self, client):
        body = client.get("/api/auth/me").json()
        assert body["id"] == "user_1"
        assert body["phone"] == PHONE

    def test_me_refuses_an_anonymous_caller(self):
        assert anonymous_client().get("/api/auth/me").status_code in (401, 403)

    def test_me_refuses_a_bad_token(self):
        r = anonymous_client().get(
            "/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert r.status_code in (401, 403)

    def test_logout_succeeds_for_a_signed_in_caller(self, client):
        r = client.post("/api/auth/logout")
        assert r.status_code == 200
        assert r.json()["message"]

    def test_logout_refuses_an_anonymous_caller(self):
        assert anonymous_client().post("/api/auth/logout").status_code in (401, 403)
