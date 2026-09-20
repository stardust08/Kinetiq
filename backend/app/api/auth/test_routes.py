"""
Unit tests for authentication routes.

Tests the FastAPI endpoints for OTP-based authentication including
send-otp, verify-otp, me, and logout endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
from app.main import app
from app.db.client import db
from app.core.security import TokenService

client = TestClient(app)


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Connect to database before tests and disconnect after."""
    await db.connect()
    yield
    await db.disconnect()


@pytest.mark.asyncio
async def test_send_otp_success():
    """Test successful OTP sending."""
    response = client.post(
        "/api/auth/send-otp",
        json={
            "phone": "+1234567890",
            "type": "LOGIN"
        }
    )
    
    assert response.status_code == 200
    assert response.json()["message"] == "OTP sent successfully"
    
    # Verify OTP was created in database
    otp_record = await db.otp.find_first(
        where={"phoneNo": "+1234567890"},
        order={"createdAt": "desc"}
    )
    assert otp_record is not None
    assert otp_record.type == "LOGIN"
    assert otp_record.isUsed is False


@pytest.mark.asyncio
async def test_send_otp_rate_limit():
    """Test OTP rate limiting."""
    phone = "+1234567891"
    
    # First request should succeed
    response1 = client.post(
        "/api/auth/send-otp",
        json={"phone": phone, "type": "LOGIN"}
    )
    assert response1.status_code == 200
    
    # Second request within 60 seconds should fail
    response2 = client.post(
        "/api/auth/send-otp",
        json={"phone": phone, "type": "LOGIN"}
    )
    assert response2.status_code == 400
    assert "wait" in response2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_otp_success():
    """Test successful OTP verification."""
    phone = "+1234567892"
    
    # Create OTP directly in database
    otp = "123456"
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
    response = client.post(
        "/api/auth/verify-otp",
        json={"phone": phone, "otp": otp}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert "user" in data
    assert data["user"]["phone"] == phone


@pytest.mark.asyncio
async def test_verify_otp_invalid():
    """Test OTP verification with invalid OTP."""
    response = client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "+1234567893",
            "otp": "999999"
        }
    )
    
    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_otp_expired():
    """Test OTP verification with expired OTP."""
    phone = "+1234567894"
    otp = "123456"
    
    # Create expired OTP
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
    response = client.post(
        "/api/auth/verify-otp",
        json={"phone": phone, "otp": otp}
    )
    
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_me_success():
    """Test getting current user info with valid token."""
    # Create a test user
    user = await db.user.create(
        data={
            "phone": "+1234567895",
            "role": "USER",
            "status": "ACTIVE"
        }
    )
    
    # Generate token
    token = TokenService.create_access_token(user.id, user.role)
    
    # Get user info
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user.id
    assert data["phone"] == "+1234567895"
    assert data["role"] == "USER"


@pytest.mark.asyncio
async def test_get_me_no_token():
    """Test getting current user info without token."""
    response = client.get("/api/auth/me")
    
    assert response.status_code == 401  # No credentials provided


@pytest.mark.asyncio
async def test_get_me_invalid_token():
    """Test getting current user info with invalid token."""
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalid_token"}
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_success():
    """Test logout with valid token."""
    # Create a test user
    user = await db.user.create(
        data={
            "phone": "+1234567896",
            "role": "USER",
            "status": "ACTIVE"
        }
    )
    
    # Generate token
    token = TokenService.create_access_token(user.id, user.role)
    
    # Logout
    response = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out successfully"


@pytest.mark.asyncio
async def test_logout_no_token():
    """Test logout without token."""
    response = client.post("/api/auth/logout")
    
    assert response.status_code == 401  # No credentials provided


@pytest.mark.asyncio
async def test_invalid_phone_format():
    """Test sending OTP with invalid phone format."""
    response = client.post(
        "/api/auth/send-otp",
        json={
            "phone": "invalid",
            "type": "LOGIN"
        }
    )
    
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_invalid_otp_format():
    """Test verifying OTP with invalid format."""
    response = client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "+1234567890",
            "otp": "abc123"  # Not all digits
        }
    )
    
    assert response.status_code == 422  # Validation error
