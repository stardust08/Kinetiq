"""
JWT token management for authentication.

This module provides the TokenService class for creating and verifying
JWT tokens used for user authentication and authorization.
"""

from datetime import datetime, timedelta
from jose import JWTError, jwt
from app.core.config import settings
from app.core.exceptions import UnauthorizedException


class TokenService:
    """
    Service for JWT token operations.
    
    This class provides static methods for creating and verifying JWT tokens
    used in the authentication system. Tokens include user ID and role in the
    payload and expire after a configurable time period.
    """
    
    @staticmethod
    def create_access_token(user_id: str, role: str) -> str:
        """
        Generate a JWT access token for a user.
        
        Creates a signed JWT token containing the user's ID and role.
        The token expires after 7 days (configurable via settings).
        
        Args:
            user_id: Unique identifier of the user
            role: User's role (e.g., "USER", "ADMIN", "DOCTOR")
            
        Returns:
            str: Encoded JWT token string
            
        Example:
            >>> token = TokenService.create_access_token("user123", "USER")
            >>> print(token)
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
        """
        # Token expires after 7 days as per requirements
        expires = datetime.utcnow() + timedelta(days=7)
        
        # Create payload with user info and expiration
        payload = {
            "sub": user_id,  # Subject: user ID
            "role": role,     # User role for authorization
            "exp": expires    # Expiration timestamp
        }
        
        # Encode and sign the token
        token = jwt.encode(
            payload,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        
        return token
    
    @staticmethod
    def verify_token(token: str) -> dict:
        """
        Verify and decode a JWT token.
        
        Validates the token signature and expiration, then returns the
        decoded payload containing user information.
        
        Args:
            token: JWT token string to verify
            
        Returns:
            dict: Decoded token payload containing 'sub' (user_id), 'role', and 'exp'
            
        Raises:
            UnauthorizedException: If token is invalid, expired, or malformed
            
        Example:
            >>> payload = TokenService.verify_token(token)
            >>> print(payload['sub'])  # User ID
            'user123'
            >>> print(payload['role'])  # User role
            'USER'
        """
        try:
            # Decode and verify the token
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            return payload
            
        except JWTError as e:
            # Token is invalid, expired, or malformed
            raise UnauthorizedException("Invalid or expired token")
