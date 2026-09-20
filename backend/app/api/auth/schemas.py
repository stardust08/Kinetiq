"""
Authentication schemas for request/response validation.

This module contains Pydantic models for authentication endpoints including
OTP requests, verification, and token responses.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from enum import Enum
from typing import Optional
import re


class OTPType(str, Enum):
    """Enum for OTP types."""
    LOGIN = "LOGIN"
    SIGNUP = "SIGNUP"
    RESET = "RESET"


class SendOTPRequest(BaseModel):
    """Request schema for sending OTP."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "phone": "+1234567890",
                "type": "LOGIN"
            }
        }
    )
    
    phone: str = Field(..., min_length=10, max_length=15, description="Phone number")
    type: OTPType = Field(default=OTPType.LOGIN, description="Type of OTP request")
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        """Validate phone number format."""
        # Remove spaces and special characters
        phone = re.sub(r'[^\d+]', '', v)
        # Basic validation: must start with + or digit, followed by 9-14 digits
        if not re.match(r'^\+?[1-9]\d{9,14}$', phone):
            raise ValueError('Invalid phone number format')
        return phone


class VerifyOTPRequest(BaseModel):
    """Request schema for verifying OTP."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "phone": "+1234567890",
                "otp": "123456"
            }
        }
    )
    
    phone: str = Field(..., min_length=10, max_length=15, description="Phone number")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")
    
    @field_validator('otp')
    @classmethod
    def validate_otp(cls, v):
        """Validate OTP format."""
        if not v.isdigit():
            raise ValueError('OTP must contain only digits')
        return v


class UserResponse(BaseModel):
    """Response schema for user data."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "cm5abc123xyz",
                "phone": "+1234567890",
                "email": "user@example.com",
                "name": "John Doe",
                "role": "USER",
                "status": "ACTIVE",
                "profileImage": None,
                "createdAt": "2024-01-01T00:00:00Z"
            }
        }
    )
    
    id: str = Field(..., description="User ID")
    phone: str = Field(..., description="Phone number")
    email: Optional[str] = Field(None, description="Email address")
    name: Optional[str] = Field(None, description="User name")
    role: str = Field(..., description="User role")
    status: str = Field(..., description="User status")
    profileImage: Optional[str] = Field(None, description="Profile image URL")
    createdAt: str = Field(..., description="Account creation timestamp")


class TokenResponse(BaseModel):
    """Response schema for authentication token."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "user": {
                    "id": "cm5abc123xyz",
                    "phone": "+1234567890",
                    "role": "USER",
                    "status": "ACTIVE"
                },
                "requiresProfileCompletion": False
            }
        }
    )
    
    token: Optional[str] = Field(None, description="JWT access token (null if profile completion required)")
    user: Optional[dict] = Field(None, description="User data (null if profile completion required)")
    requiresProfileCompletion: bool = Field(False, description="Whether user needs to complete profile")
    phone: Optional[str] = Field(None, description="Phone number for profile completion")


class CompleteProfileRequest(BaseModel):
    """Request schema for completing user profile."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "phone": "+1234567890",
                "name": "John Doe",
                "email": "john@example.com",
                "notificationPreference": "EMAIL"
            }
        }
    )
    
    phone: str = Field(..., min_length=10, max_length=15, description="Phone number")
    name: str = Field(..., min_length=1, max_length=100, description="User name (required)")
    email: Optional[str] = Field(None, description="Email address (optional)")
    notificationPreference: Optional[str] = Field(None, description="Notification preference (optional)")
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        """Validate email format if provided."""
        if v and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v


class MessageResponse(BaseModel):
    """Generic message response schema."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "message": "OTP sent successfully"
            }
        }
    )
    
    message: str = Field(..., description="Response message")
