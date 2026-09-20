"""
Authentication routes for the API.

This module provides FastAPI endpoints for phone-based OTP authentication,
including OTP generation, verification, and user session management.
"""

from fastapi import APIRouter, Depends
from app.api.auth.service import OTPService
from app.api.auth.schemas import (
    SendOTPRequest,
    VerifyOTPRequest,
    TokenResponse,
    UserResponse,
    MessageResponse,
    CompleteProfileRequest
)
from app.core.security import TokenService
from app.core.dependencies import get_current_active_user

# Create auth router with /auth prefix
auth_router = APIRouter(prefix="/auth", tags=["authentication"])


@auth_router.post("/send-otp", response_model=MessageResponse)
async def send_otp(request: SendOTPRequest):
    """
    Send OTP to a phone number.
    
    Generates a 6-digit OTP and sends it to the specified phone number.
    The OTP is valid for 10 minutes and rate limiting prevents abuse
    (max 1 OTP per minute per phone number).
    
    Args:
        request: SendOTPRequest containing phone number and OTP type
        
    Returns:
        MessageResponse: Success message confirming OTP was sent
        
    Raises:
        BadRequestException: If rate limit is exceeded (400)
        
    Example:
        POST /api/auth/send-otp
        {
            "phone": "+1234567890",
            "type": "LOGIN"
        }
        
        Response:
        {
            "message": "OTP sent successfully"
        }
    """
    await OTPService.generate_otp(request.phone, request.type.value)
    return {"message": "OTP sent successfully"}


@auth_router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(request: VerifyOTPRequest):
    """
    Verify OTP and return JWT token or profile completion requirement.
    
    Validates the OTP against the database. For existing users, returns
    a JWT token. For new users, returns a flag indicating profile
    completion is required.
    
    Args:
        request: VerifyOTPRequest containing phone number and OTP code
        
    Returns:
        TokenResponse: JWT token and user data OR profile completion flag
        
    Raises:
        UnauthorizedException: If OTP is invalid, expired, or already used (401)
        
    Example (Existing User):
        POST /api/auth/verify-otp
        {
            "phone": "+1234567890",
            "otp": "123456"
        }
        
        Response:
        {
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "user": {...},
            "requiresProfileCompletion": false
        }
        
    Example (New User):
        Response:
        {
            "token": null,
            "user": null,
            "requiresProfileCompletion": true,
            "phone": "+1234567890"
        }
    """
    # Verify OTP and check if user exists
    user, is_new_user = await OTPService.verify_otp(request.phone, request.otp)
    
    if is_new_user:
        # New user needs to complete profile
        return {
            "token": None,
            "user": None,
            "requiresProfileCompletion": True,
            "phone": request.phone
        }
    
    # Existing user - generate JWT token
    token = TokenService.create_access_token(user.id, user.role)
    
    # Return token and user data
    return {
        "token": token,
        "user": user.__dict__,
        "requiresProfileCompletion": False,
        "phone": None
    }


@auth_router.get("/me", response_model=UserResponse)
async def get_current_user_info(user = Depends(get_current_active_user)):
    """
    Get current authenticated user information.
    
    Returns the profile information of the currently authenticated user.
    Requires a valid JWT token in the Authorization header.
    
    Args:
        user: Current authenticated user (injected by dependency)
        
    Returns:
        UserResponse: Complete user profile data
        
    Raises:
        HTTPException: 401 if token is invalid/expired, 403 if user is inactive
        
    Example:
        GET /api/auth/me
        Headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
        
        Response:
        {
            "id": "cm5abc123xyz",
            "phone": "+1234567890",
            "email": "user@example.com",
            "name": "John Doe",
            "role": "USER",
            "status": "ACTIVE",
            "profileImage": null,
            "createdAt": "2024-01-01T00:00:00Z"
        }
    """
    # Convert Prisma model to dict and format createdAt as ISO string
    user_dict = user.__dict__.copy()
    if user.createdAt:
        user_dict["createdAt"] = user.createdAt.isoformat()
    return user_dict


@auth_router.post("/complete-profile", response_model=TokenResponse)
async def complete_profile(request: CompleteProfileRequest):
    """
    Complete user profile after OTP verification.
    
    Creates a new user account with the provided profile information.
    This endpoint is called after OTP verification for new users.
    Only name is required, other fields are optional.
    
    Args:
        request: CompleteProfileRequest containing phone, name, and optional fields
        
    Returns:
        TokenResponse: JWT token and user data
        
    Raises:
        BadRequestException: If user already exists or validation fails (400)
        
    Example:
        POST /api/auth/complete-profile
        {
            "phone": "+1234567890",
            "name": "John Doe",
            "email": "john@example.com",
            "notificationPreference": "EMAIL"
        }
        
        Response:
        {
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "user": {
                "id": "cm5abc123xyz",
                "phone": "+1234567890",
                "name": "John Doe",
                "email": "john@example.com",
                "role": "USER",
                "status": "ACTIVE",
                ...
            },
            "requiresProfileCompletion": false
        }
    """
    # Complete user profile
    user = await OTPService.complete_profile(
        request.phone,
        request.name,
        request.email,
        request.notificationPreference
    )
    
    # Generate JWT token
    token = TokenService.create_access_token(user.id, user.role)
    
    # Return token and user data
    return {
        "token": token,
        "user": user.__dict__,
        "requiresProfileCompletion": False,
        "phone": None
    }


@auth_router.post("/logout", response_model=MessageResponse)
async def logout(user = Depends(get_current_active_user)):
    """
    Logout the current user.
    
    Logs out the authenticated user. Since JWT tokens are stateless,
    this endpoint primarily serves as a confirmation. The client should
    remove the token from storage (localStorage, cookies, etc.).
    
    In a production system with refresh tokens, this would invalidate
    the refresh token in the database.
    
    Args:
        user: Current authenticated user (injected by dependency)
        
    Returns:
        MessageResponse: Success message confirming logout
        
    Example:
        POST /api/auth/logout
        Headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
        
        Response:
        {
            "message": "Logged out successfully"
        }
    """
    return {"message": "Logged out successfully"}
