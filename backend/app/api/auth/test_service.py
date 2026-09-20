"""
Unit tests for OTP Service.

This module contains tests for the OTPService class, including OTP generation,
verification, rate limiting, and expiration handling.
"""

import pytest
from datetime import datetime, timedelta
from app.api.auth.service import OTPService
from app.core.exceptions import BadRequestException, UnauthorizedException
from app.db.client import db


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Connect to database before tests and disconnect after."""
    await db.connect()
    yield
    await db.disconnect()


@pytest.mark.asyncio
async def test_generate_otp_creates_valid_otp():
    """Test that generate_otp creates a valid 6-digit OTP."""
    phone = "+1234567890"
    otp_type = "LOGIN"
    
    # Generate OTP
    otp = await OTPService.generate_otp(phone, otp_type)
    
    # Verify OTP format
    assert len(otp) == 6
    assert otp.isdigit()
    
    # Verify OTP is stored in database
    otp_record = await db.otp.find_first(
        where={"phoneNo": phone, "otp": otp}
    )
    assert otp_record is not None
    assert otp_record.type == otp_type
    assert otp_record.isUsed is False
    
    # Cleanup
    await db.otp.delete(where={"id": otp_record.id})


@pytest.mark.asyncio
async def test_generate_otp_rate_limiting():
    """Test that rate limiting prevents multiple OTP requests within 60 seconds."""
    phone = "+1234567891"
    
    # Generate first OTP
    otp1 = await OTPService.generate_otp(phone, "LOGIN")
    
    # Try to generate second OTP immediately (should fail)
    with pytest.raises(BadRequestException) as exc_info:
        await OTPService.generate_otp(phone, "LOGIN")
    
    assert "Please wait before requesting new OTP" in str(exc_info.value.message)
    
    # Cleanup
    await db.otp.delete_many(where={"phoneNo": phone})


@pytest.mark.asyncio
async def test_verify_otp_success():
    """Test successful OTP verification."""
    phone = "+1234567892"
    
    # Generate OTP
    otp = await OTPService.generate_otp(phone, "SIGNUP")
    
    # Verify OTP
    user = await OTPService.verify_otp(phone, otp)
    
    # Check user was created
    assert user is not None
    assert user.phone == phone
    assert user.role == "USER"
    assert user.status == "ACTIVE"
    
    # Verify OTP is marked as used
    otp_record = await db.otp.find_first(
        where={"phoneNo": phone, "otp": otp}
    )
    assert otp_record.isUsed is True
    
    # Cleanup
    await db.otp.delete_many(where={"phoneNo": phone})
    await db.user.delete(where={"id": user.id})


@pytest.mark.asyncio
async def test_verify_otp_invalid():
    """Test that invalid OTP raises UnauthorizedException."""
    phone = "+1234567893"
    
    # Try to verify non-existent OTP
    with pytest.raises(UnauthorizedException) as exc_info:
        await OTPService.verify_otp(phone, "999999")
    
    assert "Invalid or expired OTP" in str(exc_info.value.message)


@pytest.mark.asyncio
async def test_verify_otp_already_used():
    """Test that already used OTP cannot be reused."""
    phone = "+1234567894"
    
    # Generate and verify OTP
    otp = await OTPService.generate_otp(phone, "LOGIN")
    user = await OTPService.verify_otp(phone, otp)
    
    # Try to verify same OTP again (should fail)
    with pytest.raises(UnauthorizedException) as exc_info:
        await OTPService.verify_otp(phone, otp)
    
    assert "Invalid or expired OTP" in str(exc_info.value.message)
    
    # Cleanup
    await db.otp.delete_many(where={"phoneNo": phone})
    await db.user.delete(where={"id": user.id})


@pytest.mark.asyncio
async def test_verify_otp_expired():
    """Test that expired OTP is rejected."""
    phone = "+1234567895"
    
    # Create expired OTP manually
    expired_time = datetime.utcnow() - timedelta(minutes=1)
    otp_record = await db.otp.create(
        data={
            "otp": "123456",
            "phoneNo": phone,
            "type": "LOGIN",
            "expiresAt": expired_time,
            "isUsed": False
        }
    )
    
    # Try to verify expired OTP
    with pytest.raises(UnauthorizedException) as exc_info:
        await OTPService.verify_otp(phone, "123456")
    
    assert "Invalid or expired OTP" in str(exc_info.value.message)
    
    # Cleanup
    await db.otp.delete(where={"id": otp_record.id})


@pytest.mark.asyncio
async def test_verify_otp_existing_user():
    """Test that existing user is returned on login."""
    phone = "+1234567896"
    
    # Create user first
    existing_user = await db.user.create(
        data={
            "phone": phone,
            "role": "USER",
            "status": "ACTIVE"
        }
    )
    
    # Generate and verify OTP
    otp = await OTPService.generate_otp(phone, "LOGIN")
    user = await OTPService.verify_otp(phone, otp)
    
    # Should return existing user, not create new one
    assert user.id == existing_user.id
    assert user.phone == phone
    
    # Cleanup
    await db.otp.delete_many(where={"phoneNo": phone})
    await db.user.delete(where={"id": user.id})
