"""
Unit tests for authentication schemas.

Tests validation logic for OTP requests, verification, and responses.
"""

import pytest
from pydantic import ValidationError
from app.api.auth.schemas import (
    OTPType,
    SendOTPRequest,
    VerifyOTPRequest,
    UserResponse,
    TokenResponse,
    MessageResponse
)


class TestOTPType:
    """Test OTPType enum."""
    
    def test_otp_type_values(self):
        """Test that OTPType has correct values."""
        assert OTPType.LOGIN == "LOGIN"
        assert OTPType.SIGNUP == "SIGNUP"
        assert OTPType.RESET == "RESET"


class TestSendOTPRequest:
    """Test SendOTPRequest schema."""
    
    def test_valid_phone_with_plus(self):
        """Test valid phone number with + prefix."""
        request = SendOTPRequest(phone="+1234567890", type=OTPType.LOGIN)
        assert request.phone == "+1234567890"
        assert request.type == OTPType.LOGIN
    
    def test_valid_phone_without_plus(self):
        """Test valid phone number without + prefix."""
        request = SendOTPRequest(phone="1234567890", type=OTPType.SIGNUP)
        assert request.phone == "1234567890"
        assert request.type == OTPType.SIGNUP
    
    def test_default_type(self):
        """Test that type defaults to LOGIN."""
        request = SendOTPRequest(phone="+1234567890")
        assert request.type == OTPType.LOGIN
    
    def test_phone_with_spaces(self):
        """Test phone number with spaces is cleaned."""
        request = SendOTPRequest(phone="+1 234 567 890")
        assert request.phone == "+1234567890"
    
    def test_phone_with_dashes(self):
        """Test phone number with dashes is cleaned."""
        request = SendOTPRequest(phone="+1-234-567-890")
        assert request.phone == "+1234567890"
    
    def test_invalid_phone_too_short(self):
        """Test that phone number too short raises error."""
        with pytest.raises(ValidationError) as exc_info:
            SendOTPRequest(phone="+123456789")
        assert "Invalid phone number format" in str(exc_info.value)
    
    def test_invalid_phone_starts_with_zero(self):
        """Test that phone number starting with 0 raises error."""
        with pytest.raises(ValidationError) as exc_info:
            SendOTPRequest(phone="+0234567890")
        assert "Invalid phone number format" in str(exc_info.value)
    
    def test_invalid_phone_letters(self):
        """Test that phone number with letters raises error."""
        with pytest.raises(ValidationError) as exc_info:
            SendOTPRequest(phone="+123ABC7890")
        assert "Invalid phone number format" in str(exc_info.value)


class TestVerifyOTPRequest:
    """Test VerifyOTPRequest schema."""
    
    def test_valid_otp(self):
        """Test valid OTP verification request."""
        request = VerifyOTPRequest(phone="+1234567890", otp="123456")
        assert request.phone == "+1234567890"
        assert request.otp == "123456"
    
    def test_invalid_otp_too_short(self):
        """Test that OTP too short raises error."""
        with pytest.raises(ValidationError) as exc_info:
            VerifyOTPRequest(phone="+1234567890", otp="12345")
        assert "should have at least 6 characters" in str(exc_info.value).lower()
    
    def test_invalid_otp_too_long(self):
        """Test that OTP too long raises error."""
        with pytest.raises(ValidationError) as exc_info:
            VerifyOTPRequest(phone="+1234567890", otp="1234567")
        assert "should have at most 6 characters" in str(exc_info.value).lower()
    
    def test_invalid_otp_with_letters(self):
        """Test that OTP with letters raises error."""
        with pytest.raises(ValidationError) as exc_info:
            VerifyOTPRequest(phone="+1234567890", otp="12A456")
        assert "OTP must contain only digits" in str(exc_info.value)
    
    def test_invalid_otp_with_special_chars(self):
        """Test that OTP with special characters raises error."""
        with pytest.raises(ValidationError) as exc_info:
            VerifyOTPRequest(phone="+1234567890", otp="123-56")
        assert "OTP must contain only digits" in str(exc_info.value)


class TestUserResponse:
    """Test UserResponse schema."""
    
    def test_user_response_all_fields(self):
        """Test UserResponse with all fields."""
        user = UserResponse(
            id="cm5abc123xyz",
            phone="+1234567890",
            email="user@example.com",
            name="John Doe",
            role="USER",
            status="ACTIVE",
            profileImage="https://example.com/image.jpg",
            createdAt="2024-01-01T00:00:00Z"
        )
        assert user.id == "cm5abc123xyz"
        assert user.phone == "+1234567890"
        assert user.email == "user@example.com"
        assert user.name == "John Doe"
        assert user.role == "USER"
        assert user.status == "ACTIVE"
        assert user.profileImage == "https://example.com/image.jpg"
        assert user.createdAt == "2024-01-01T00:00:00Z"
    
    def test_user_response_optional_fields_none(self):
        """Test UserResponse with optional fields as None."""
        user = UserResponse(
            id="cm5abc123xyz",
            phone="+1234567890",
            email=None,
            name=None,
            role="USER",
            status="ACTIVE",
            profileImage=None,
            createdAt="2024-01-01T00:00:00Z"
        )
        assert user.email is None
        assert user.name is None
        assert user.profileImage is None


class TestTokenResponse:
    """Test TokenResponse schema."""
    
    def test_token_response(self):
        """Test TokenResponse with valid data."""
        response = TokenResponse(
            token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            user={
                "id": "cm5abc123xyz",
                "phone": "+1234567890",
                "role": "USER"
            }
        )
        assert response.token == "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        assert response.user["id"] == "cm5abc123xyz"
        assert response.user["phone"] == "+1234567890"


class TestMessageResponse:
    """Test MessageResponse schema."""
    
    def test_message_response(self):
        """Test MessageResponse with valid message."""
        response = MessageResponse(message="OTP sent successfully")
        assert response.message == "OTP sent successfully"
