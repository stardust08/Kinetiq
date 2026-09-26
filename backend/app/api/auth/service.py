"""
OTP Service for authentication.

This module provides the OTPService class for generating and verifying
one-time passwords (OTPs) used in phone-based authentication.
"""

import random
import string
import json
from datetime import datetime, timedelta
from typing import Optional
from app.core.exceptions import BadRequestException, UnauthorizedException
from app.db.client import db
import logging

from app.core.config import settings
from app.services.sns_service import send_otp as send_otp_sms

logger = logging.getLogger(__name__)


class OTPService:
    """
    Service for OTP generation and verification.
    
    This class handles the complete OTP lifecycle including generation,
    storage, verification, and rate limiting. OTPs are 6-digit codes
    that expire after 10 minutes and can only be used once.
    
    Constants:
        OTP_LENGTH: Length of generated OTP (6 digits)
        OTP_EXPIRY_MINUTES: OTP validity period (10 minutes)
        MAX_ATTEMPTS: Maximum failed verification attempts (3)
        RATE_LIMIT_SECONDS: Minimum time between OTP requests (60 seconds)
    """
    
    OTP_LENGTH = 6
    OTP_EXPIRY_MINUTES = 10
    MAX_ATTEMPTS = 3
    RATE_LIMIT_SECONDS = 60
    
    @staticmethod
    async def generate_otp(phone: str, otp_type: str) -> str:
        """
        Generate and store a new OTP for a phone number.
        
        Creates a 6-digit random OTP, stores it in the database with an
        expiration time, and enforces rate limiting to prevent abuse.
        
        Args:
            phone: Phone number to send OTP to
            otp_type: Type of OTP (LOGIN, SIGNUP, or RESET)
            
        Returns:
            str: The generated 6-digit OTP code
            
        Raises:
            BadRequestException: If rate limit is exceeded (OTP requested
                within the last 60 seconds)
                
        Example:
            >>> otp = await OTPService.generate_otp("+1234567890", "LOGIN")
            >>> print(otp)
            '123456'
            
        Note:
            In development, the OTP is printed to console. In production,
            this should be replaced with SMS gateway integration.
        """
        # Check rate limiting - prevent OTP spam
        recent_otp = await db.otp.find_first(
            where={
                "phoneNo": phone,
                "createdAt": {
                    "gte": datetime.utcnow() - timedelta(seconds=OTPService.RATE_LIMIT_SECONDS)
                }
            }
        )
        
        if recent_otp:
            raise BadRequestException("Please wait before requesting new OTP")
        
        # Generate 6-digit random OTP
        otp = ''.join(random.choices(string.digits, k=OTPService.OTP_LENGTH))
        
        # Calculate expiration time
        expires_at = datetime.utcnow() + timedelta(minutes=OTPService.OTP_EXPIRY_MINUTES)
        
        # Store OTP in database
        await db.otp.create(
            data={
                "otp": otp,
                "phoneNo": phone,
                "type": otp_type,
                "expiresAt": expires_at,
                "isUsed": False
            }
        )
        # Deliver the code by SMS. A failure here is deliberately not fatal: the OTP is
        # already stored, and refusing the request would leave the user unable to retry
        # for a minute because of the rate limit.
        try:
            if not phone.startswith("+91"):
                phone = "+91" + phone
            result = send_otp_sms(phone, otp)
        except Exception as exc:  # noqa: BLE001 - SMS must never break login
            logger.warning("SMS service raised while sending to %s: %s", phone, exc)
            result = {"success": False, "configured": True, "message": str(exc)}

        if result.get("success"):
            logger.info("OTP sent by SMS to %s", phone)
        elif not result.get("configured", True):
            # No SMS credentials. Normal in local development, and a misconfiguration in
            # production - so it is said plainly rather than swallowed.
            logger.warning(
                "SMS is not configured, so the OTP for %s was not delivered. %s",
                phone,
                "It is logged below because DEBUG is on."
                if settings.DEBUG
                else "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or users cannot sign in.",
            )
        else:
            logger.warning("SMS failed to send to %s: %s", phone, result.get("message"))

        # The code itself is logged ONLY in debug.
        #
        # It used to be printed unconditionally, which put live login codes into
        # production logs - anybody who could read the logs could sign in as anybody who
        # had just requested an OTP. Local development still needs a way to read the
        # code when there is no SMS, so it is gated on DEBUG rather than removed.
        if settings.DEBUG:
            logger.info("[DEBUG] OTP for %s is %s", phone, otp)

        return otp
    @staticmethod
    async def verify_otp(phone: str, otp: str) -> tuple:
        """
        Verify an OTP and return the associated user and new user flag.
        
        Validates the OTP against the database, checking that it exists,
        hasn't been used, and hasn't expired. If valid, marks the OTP as
        used and returns the user (if exists) or None for new users.
        
        Args:
            phone: Phone number associated with the OTP
            otp: The 6-digit OTP code to verify
            
        Returns:
            tuple: (user or None, is_new_user boolean)
            
        Raises:
            UnauthorizedException: If OTP is invalid, expired, or already used
            
        Example:
            >>> user, is_new = await OTPService.verify_otp("+1234567890", "123456")
            >>> if is_new:
            >>>     print("New user needs to complete profile")
            >>> else:
            >>>     print(user.phone)
            
        Note:
            For new users, returns (None, True) to indicate profile completion needed.
            For existing users, returns (user, False).
        """
        # Find valid OTP in database
        otp_record = await db.otp.find_first(
            where={
                "phoneNo": phone,
                "otp": otp,
                "isUsed": False,
                "expiresAt": {"gte": datetime.utcnow()}
            }
        )
        
        if not otp_record:
            raise UnauthorizedException("Invalid or expired OTP")
        
        # Mark OTP as used to prevent reuse
        await db.otp.update(
            where={"id": otp_record.id},
            data={"isUsed": True}
        )
        
        # Check if user exists
        user = await db.user.find_unique(where={"phone": phone})
        
        if not user:
            # Return None for new users - they need to complete profile
            return None, True
        
        return user, False
    
    @staticmethod
    async def complete_profile(phone: str, name: str, email: Optional[str] = None, 
                              notification_preference: Optional[str] = None) -> dict:
        """
        Complete user profile after OTP verification.
        
        Creates a new user account with the provided profile information.
        Only name is required, other fields are optional.
        
        Args:
            phone: Phone number (verified via OTP)
            name: User's name (required)
            email: User's email address (optional)
            notification_preference: Notification preference (optional)
            
        Returns:
            dict: Created user object
            
        Raises:
            BadRequestException: If user already exists or validation fails
            
        Example:
            >>> user = await OTPService.complete_profile(
            ...     "+1234567890", 
            ...     "John Doe",
            ...     "john@example.com",
            ...     "EMAIL"
            ... )
        """
        # Check if user already exists
        existing_user = await db.user.find_unique(where={"phone": phone})
        if existing_user:
            raise BadRequestException("User already exists")
        
        # Create user with profile data
        user_data = {
            "phone": phone,
            "name": name,
            "role": "USER",
            "status": "ACTIVE"
        }
        
        if email:
            user_data["email"] = email
        
        if notification_preference:
            # Store as JSON string since the field is Json type in Prisma
            user_data["notificationPreference"] = json.dumps({"preference": notification_preference})
        
        user = await db.user.create(data=user_data)
        
        return user
