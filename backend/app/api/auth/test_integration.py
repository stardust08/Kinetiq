"""
Integration tests for authentication endpoints.

These drive the real stack against a REAL DATABASE: they create users, OTP rows and
tokens, and exercise the full send-otp -> verify-otp -> me -> logout flow.

They are OPT-IN, and that is not caution for its own sake. They were running by default
against whatever DATABASE_URL pointed at - in practice the shared Neon instance holding
live accounts - and they create users with HARDCODED phone numbers and never delete
them. So the first run wrote those users to production, every run after it failed on the
unique phone constraint, and the failures were read as "the auth tests are broken"
rather than as "the test suite is writing to production". Thirty of the forty user rows
in that database were left there by this file.

To run them, point DATABASE_URL at a disposable database and set:

    RUN_DB_INTEGRATION_TESTS=1 python -m pytest app/api/auth/test_integration.py

The phone numbers are now unique per run and the users are deleted afterwards, so the
suite is re-runnable - but it still needs a database it is allowed to write to.

Coverage that does NOT need a database lives in test_routes.py (the HTTP contract) and
test_service.py (the OTP logic); both run by default.
"""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from datetime import datetime, timedelta
from app.main import app
from app.db.client import db
from app.core.security import TokenService

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION_TESTS") != "1",
    reason=(
        "Writes users and OTPs to DATABASE_URL. Set RUN_DB_INTEGRATION_TESTS=1 and "
        "point DATABASE_URL at a disposable database to run."
    ),
)

# Unique per run, so a second run does not collide with the rows the first one left.
#
# Digits only, and short enough to pass validation: the schema requires
# ^\+?[1-9]\d{9,14}$ with max_length 15, so a hex run id produced an 18-character
# phone with letters in it and every request came back 422.
RUN_ID = f"{uuid.uuid4().int % 1000:03d}"

# Every phone this run hands out, so cleanup can delete exactly these and nothing else.
# Matching on "contains RUN_ID" instead would be three digits wide against a table of
# real accounts - the sort of cleanup that quietly deletes a patient.
_ISSUED: set = set()


def a_phone(slot: str) -> str:
    """A test phone number that is unique to this run."""
    phone = f"+1{RUN_ID}{slot[-9:]}"
    _ISSUED.add(phone)
    return phone


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _remove_rows_this_run_created():
    """
    Delete everything this run created, whatever happened during it.

    Without this the suite is single-use: the users it creates hold the phone numbers
    the next run needs, and every test that registers one fails on the unique
    constraint. That is how thirty test users came to be sitting in the production
    database - each run added more and none removed any.
    """
    yield
    if not db.is_connected():
        return
    if not _ISSUED:
        return
    try:
        # Exactly the phones this run issued. Never a pattern match.
        await db.otp.delete_many(where={"phoneNo": {"in": sorted(_ISSUED)}})
        await db.user.delete_many(where={"phone": {"in": sorted(_ISSUED)}})
    except Exception as exc:  # noqa: BLE001 - cleanup must not mask a test failure
        print(f"[WARNING] could not clean up rows for run {RUN_ID}: {exc}")


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_database():
    """Connect to database before tests and disconnect after."""
    # The project-wide autouse fixture in conftest.py has already connected, and
    # connecting a second time raises AlreadyConnectedError - which errored every
    # test in this file at setup. Disconnecting here is wrong for the same reason:
    # the connection is shared, so tearing it down strands every test that runs
    # afterwards.
    if not db.is_connected():
        await db.connect()
    yield


@pytest_asyncio.fixture
async def client():
    """Create async HTTP client for testing."""
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


class TestSendOTPEndpoint:
    """Test suite for POST /api/auth/send-otp endpoint."""
    
    @pytest.mark.asyncio
    async def test_send_otp_login_success(self, client):
        """Test sending OTP for login with valid phone number."""
        response = await client.post(
            "/api/auth/send-otp",
            json={
                "phone": a_phone("2345678001"),
                "type": "LOGIN"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "OTP sent successfully"
        
        # Verify OTP was created in database
        otp_record = await db.otp.find_first(
            where={"phoneNo": a_phone("2345678001")},
            order={"createdAt": "desc"}
        )
        assert otp_record is not None
        assert otp_record.type == "LOGIN"
        assert otp_record.isUsed is False
        assert len(otp_record.otp) == 6
        assert otp_record.otp.isdigit()
    
    @pytest.mark.asyncio
    async def test_send_otp_signup_success(self, client):
        """Test sending OTP for signup with valid phone number."""
        response = await client.post(
            "/api/auth/send-otp",
            json={
                "phone": a_phone("2345678002"),
                "type": "SIGNUP"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "OTP sent successfully"
        
        # Verify OTP type is SIGNUP
        otp_record = await db.otp.find_first(
            where={"phoneNo": a_phone("2345678002")},
            order={"createdAt": "desc"}
        )
        assert otp_record is not None
        assert otp_record.type == "SIGNUP"
    
    @pytest.mark.asyncio
    async def test_send_otp_rate_limiting(self, client):
        """Test OTP rate limiting prevents multiple requests within 60 seconds."""
        phone = a_phone("2345678003")
        
        # First request should succeed
        response1 = await client.post(
            "/api/auth/send-otp",
            json={"phone": phone, "type": "LOGIN"}
        )
        assert response1.status_code == 200
        
        # Second request within 60 seconds should fail
        response2 = await client.post(
            "/api/auth/send-otp",
            json={"phone": phone, "type": "LOGIN"}
        )
        assert response2.status_code == 400
        error_msg = response2.json()["error"].lower()
        assert "wait" in error_msg or "rate" in error_msg
    
    @pytest.mark.asyncio
    async def test_send_otp_invalid_phone_format(self, client):
        """Test sending OTP with invalid phone number format."""
        response = await client.post(
            "/api/auth/send-otp",
            json={
                "phone": "invalid",
                "type": "LOGIN"
            }
        )
        
        assert response.status_code == 422
        assert "detail" in response.json()
    
    @pytest.mark.asyncio
    async def test_send_otp_missing_phone(self, client):
        """Test sending OTP without phone number."""
        response = await client.post(
            "/api/auth/send-otp",
            json={"type": "LOGIN"}
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_send_otp_invalid_type(self, client):
        """Test sending OTP with invalid type."""
        response = await client.post(
            "/api/auth/send-otp",
            json={
                "phone": a_phone("2345678004"),
                "type": "INVALID_TYPE"
            }
        )
        
        assert response.status_code == 422


class TestVerifyOTPEndpoint:
    """Test suite for POST /api/auth/verify-otp endpoint."""
    
    @pytest.mark.asyncio
    async def test_verify_otp_success_new_user(self, client):
        """Test successful OTP verification for a new user (signup flow)."""
        phone = a_phone("2345678010")
        otp = "123456"
        
        # Create OTP in database
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        await db.otp.create(
            data={
                "otp": otp,
                "phoneNo": phone,
                "type": "SIGNUP",
                "expiresAt": expires_at,
                "isUsed": False
            }
        )
        
        # Verify OTP
        response = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        
        assert response.status_code == 200
        data = response.json()

        # A phone with no account behind it does NOT get a token here. Verifying the
        # OTP proves the number; it does not create the user. The caller is sent to
        # complete-profile, and the token is issued there.
        #
        # This assertion used to expect a token and a populated user, which is the
        # contract from before profile completion existed.
        assert data["requiresProfileCompletion"] is True
        assert data["token"] is None
        assert data["user"] is None
        assert data["phone"] == phone

        # Completing the profile is what creates the account and issues the token.
        response = await client.post(
            "/api/auth/complete-profile",
            json={"phone": phone, "name": "A New Patient",
                  "email": f"new{RUN_ID}@example.com"},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 0

        user = data["user"]
        assert user["phone"] == phone
        assert user["role"] == "USER"
        assert user["status"] == "ACTIVE"
        assert "id" in user
        
        # Verify OTP was marked as used
        otp_record = await db.otp.find_first(
            where={"phoneNo": phone, "otp": otp}
        )
        assert otp_record.isUsed is True
        
        # Verify user was created in database
        db_user = await db.user.find_unique(where={"phone": phone})
        assert db_user is not None
        assert db_user.role == "USER"
        assert db_user.status == "ACTIVE"
    
    @pytest.mark.asyncio
    async def test_verify_otp_success_existing_user(self, client):
        """Test successful OTP verification for an existing user (login flow)."""
        phone = a_phone("2345678011")
        otp = "654321"
        
        # Create existing user
        existing_user = await db.user.create(
            data={
                "phone": phone,
                "role": "USER",
                "status": "ACTIVE"
            }
        )
        
        # Create OTP
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        await db.otp.create(
            data={
                "otp": otp,
                "phoneNo": phone,
                "type": "LOGIN",
                "expiresAt": expires_at,
                "isUsed": False
            }
        )
        
        # Verify OTP
        response = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify same user is returned
        assert data["user"]["id"] == existing_user.id
        assert data["user"]["phone"] == phone
    
    @pytest.mark.asyncio
    async def test_verify_otp_invalid_code(self, client):
        """Test OTP verification with invalid OTP code."""
        response = await client.post(
            "/api/auth/verify-otp",
            json={
                "phone": a_phone("2345678012"),
                "otp": "999999"
            }
        )
        
        assert response.status_code == 401
        error_msg = response.json()["error"].lower()
        assert "invalid" in error_msg or "expired" in error_msg
    
    @pytest.mark.asyncio
    async def test_verify_otp_expired(self, client):
        """Test OTP verification with expired OTP."""
        phone = a_phone("2345678013")
        otp = "111111"
        
        # Create expired OTP (expired 1 minute ago)
        expires_at = datetime.utcnow() - timedelta(minutes=1)
        await db.otp.create(
            data={
                "otp": otp,
                "phoneNo": phone,
                "type": "LOGIN",
                "expiresAt": expires_at,
                "isUsed": False
            }
        )
        
        # Try to verify expired OTP
        response = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        
        assert response.status_code == 401
        error_msg = response.json()["error"].lower()
        assert "expired" in error_msg or "invalid" in error_msg
    
    @pytest.mark.asyncio
    async def test_verify_otp_already_used(self, client):
        """Test OTP verification with already used OTP."""
        phone = a_phone("2345678014")
        otp = "222222"
        
        # Create used OTP
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        await db.otp.create(
            data={
                "otp": otp,
                "phoneNo": phone,
                "type": "LOGIN",
                "expiresAt": expires_at,
                "isUsed": True  # Already used
            }
        )
        
        # Try to verify used OTP
        response = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_verify_otp_invalid_format(self, client):
        """Test OTP verification with invalid OTP format."""
        # OTP with letters
        response = await client.post(
            "/api/auth/verify-otp",
            json={
                "phone": a_phone("2345678015"),
                "otp": "abc123"
            }
        )
        assert response.status_code == 422
        
        # OTP too short
        response = await client.post(
            "/api/auth/verify-otp",
            json={
                "phone": a_phone("2345678015"),
                "otp": "123"
            }
        )
        assert response.status_code == 422
        
        # OTP too long
        response = await client.post(
            "/api/auth/verify-otp",
            json={
                "phone": a_phone("2345678015"),
                "otp": "1234567"
            }
        )
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_verify_otp_missing_fields(self, client):
        """Test OTP verification with missing required fields."""
        # Missing phone
        response = await client.post(
            "/api/auth/verify-otp",
            json={"otp": "123456"}
        )
        assert response.status_code == 422
        
        # Missing OTP
        response = await client.post(
            "/api/auth/verify-otp",
            json={"phone": a_phone("2345678016")}
        )
        assert response.status_code == 422


class TestGetMeEndpoint:
    """Test suite for GET /api/auth/me endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_me_success(self, client):
        """Test getting current user info with valid token."""
        # Create test user
        user = await db.user.create(
            data={
                "phone": a_phone("2345678020"),
                "role": "USER",
                "status": "ACTIVE"
            }
        )
        
        # Generate valid token
        token = TokenService.create_access_token(user.id, user.role)
        
        # Get user info
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify user data
        assert data["id"] == user.id
        assert data["phone"] == a_phone("2345678020")
        assert data["role"] == "USER"
        assert data["status"] == "ACTIVE"
    
    @pytest.mark.asyncio
    async def test_get_me_no_token(self, client):
        """Test getting current user info without authentication token."""
        response = await client.get("/api/auth/me")
        
        # HTTPBearer returns 401 when no credentials provided
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_me_invalid_token(self, client):
        """Test getting current user info with invalid token."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_me_malformed_header(self, client):
        """Test getting current user info with malformed authorization header."""
        # Missing Bearer prefix
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "some_token"}
        )
        assert response.status_code == 401
        
        # Empty token
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer "}
        )
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_me_deleted_user(self, client):
        """Test getting current user info when user no longer exists."""
        # Create user and generate token
        user = await db.user.create(
            data={
                "phone": a_phone("2345678021"),
                "role": "USER",
                "status": "ACTIVE"
            }
        )
        token = TokenService.create_access_token(user.id, user.role)
        
        # Delete user
        await db.user.delete(where={"id": user.id})
        
        # Try to get user info with valid token but deleted user
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_me_inactive_user(self, client):
        """Test getting current user info when user is inactive."""
        # Create inactive user
        user = await db.user.create(
            data={
                "phone": a_phone("2345678022"),
                "role": "USER",
                "status": "INACTIVE"
            }
        )
        token = TokenService.create_access_token(user.id, user.role)
        
        # Try to get user info
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should be forbidden for inactive users
        assert response.status_code == 403


class TestLogoutEndpoint:
    """Test suite for POST /api/auth/logout endpoint."""
    
    @pytest.mark.asyncio
    async def test_logout_success(self, client):
        """Test successful logout with valid token."""
        # Create test user
        user = await db.user.create(
            data={
                "phone": a_phone("2345678030"),
                "role": "USER",
                "status": "ACTIVE"
            }
        )
        
        # Generate valid token
        token = TokenService.create_access_token(user.id, user.role)
        
        # Logout
        response = await client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Logged out successfully"
    
    @pytest.mark.asyncio
    async def test_logout_no_token(self, client):
        """Test logout without authentication token."""
        response = await client.post("/api/auth/logout")
        
        # HTTPBearer returns 401 when no credentials provided
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_logout_invalid_token(self, client):
        """Test logout with invalid token."""
        response = await client.post(
            "/api/auth/logout",
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_logout_inactive_user(self, client):
        """Test logout when user is inactive."""
        # Create inactive user
        user = await db.user.create(
            data={
                "phone": a_phone("2345678031"),
                "role": "USER",
                "status": "INACTIVE"
            }
        )
        token = TokenService.create_access_token(user.id, user.role)
        
        # Try to logout
        response = await client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should be forbidden for inactive users
        assert response.status_code == 403


class TestCompleteAuthenticationFlow:
    """Test suite for complete authentication flow scenarios."""
    
    @pytest.mark.asyncio
    async def test_complete_signup_flow(self, client):
        """Test complete signup flow: send OTP -> verify OTP -> access protected route."""
        phone = a_phone("2345678040")
        
        # Step 1: Send OTP
        response = await client.post(
            "/api/auth/send-otp",
            json={"phone": phone, "type": "SIGNUP"}
        )
        assert response.status_code == 200
        
        # Get OTP from database (simulating user receiving it)
        otp_record = await db.otp.find_first(
            where={"phoneNo": phone},
            order={"createdAt": "desc"}
        )
        assert otp_record is not None
        otp = otp_record.otp
        
        # Step 2: Verify OTP
        response = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        assert response.status_code == 200
        data = response.json()

        # A new phone is sent to complete-profile first; that is where the token comes
        # from. An existing one is signed straight in.
        if data["requiresProfileCompletion"]:
            response = await client.post(
                "/api/auth/complete-profile",
                json={"phone": phone, "name": "A Patient",
                      "email": f"flow{RUN_ID}@example.com"},
            )
            assert response.status_code == 200, response.text
            data = response.json()

        token = data["token"]
        user_id = data["user"]["id"]
        
        # Step 3: Access protected route
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.json()["id"] == user_id
        
        # Step 4: Logout
        response = await client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_complete_login_flow(self, client):
        """Test complete login flow for existing user."""
        phone = a_phone("2345678041")
        
        # Create existing user
        existing_user = await db.user.create(
            data={
                "phone": phone,
                "role": "USER",
                "status": "ACTIVE"
            }
        )
        
        # Step 1: Send OTP for login
        response = await client.post(
            "/api/auth/send-otp",
            json={"phone": phone, "type": "LOGIN"}
        )
        assert response.status_code == 200
        
        # Get OTP from database
        otp_record = await db.otp.find_first(
            where={"phoneNo": phone},
            order={"createdAt": "desc"}
        )
        otp = otp_record.otp
        
        # Step 2: Verify OTP
        response = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify same user is returned
        assert data["user"]["id"] == existing_user.id
        
        # Step 3: Access protected routes
        token = data["token"]
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.json()["id"] == existing_user.id
    
    @pytest.mark.asyncio
    async def test_otp_cannot_be_reused(self, client):
        """Test that OTP cannot be used twice."""
        phone = a_phone("2345678042")
        otp = "333333"
        
        # Create OTP
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        await db.otp.create(
            data={
                "otp": otp,
                "phoneNo": phone,
                "type": "LOGIN",
                "expiresAt": expires_at,
                "isUsed": False
            }
        )
        
        # First verification should succeed
        response1 = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        assert response1.status_code == 200
        
        # Second verification should fail
        response2 = await client.post(
            "/api/auth/verify-otp",
            json={"phone": phone, "otp": otp}
        )
        assert response2.status_code == 401
    
    @pytest.mark.asyncio
    async def test_token_works_across_multiple_requests(self, client):
        """Test that token can be used for multiple authenticated requests."""
        phone = a_phone("2345678043")
        
        # Create user and get token
        user = await db.user.create(
            data={
                "phone": phone,
                "role": "USER",
                "status": "ACTIVE"
            }
        )
        token = TokenService.create_access_token(user.id, user.role)
        
        # Make multiple requests with same token
        for _ in range(3):
            response = await client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 200
            assert response.json()["id"] == user.id
