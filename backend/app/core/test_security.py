"""
Unit tests for JWT token management.

Tests the TokenService class for token creation and verification.
"""

import pytest
from datetime import datetime, timedelta
from jose import jwt
from app.core.security import TokenService
from app.core.config import settings
from app.core.exceptions import UnauthorizedException


class TestTokenService:
    """Test suite for TokenService class."""
    
    def test_create_access_token(self):
        """Test JWT token creation with valid user data."""
        # Arrange
        user_id = "test-user-123"
        role = "USER"
        
        # Act
        token = TokenService.create_access_token(user_id, role)
        
        # Assert
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
        
        # Verify token can be decoded
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == user_id
        assert payload["role"] == role
        assert "exp" in payload
    
    def test_create_access_token_expiration(self):
        """Test that token has correct expiration time (7 days)."""
        # Arrange
        user_id = "test-user-123"
        role = "USER"
        before_creation = datetime.utcnow()
        
        # Act
        token = TokenService.create_access_token(user_id, role)
        
        # Assert
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp_timestamp = payload["exp"]
        exp_datetime = datetime.utcfromtimestamp(exp_timestamp)
        
        # Token should expire in approximately 7 days
        expected_expiry = before_creation + timedelta(days=7)
        time_diff = abs((exp_datetime - expected_expiry).total_seconds())
        
        # Allow 5 seconds tolerance for test execution time
        assert time_diff < 5
    
    def test_verify_token_valid(self):
        """Test verification of a valid token."""
        # Arrange
        user_id = "test-user-456"
        role = "ADMIN"
        token = TokenService.create_access_token(user_id, role)
        
        # Act
        payload = TokenService.verify_token(token)
        
        # Assert
        assert payload is not None
        assert payload["sub"] == user_id
        assert payload["role"] == role
        assert "exp" in payload
    
    def test_verify_token_invalid_signature(self):
        """Test that invalid token signature raises UnauthorizedException."""
        # Arrange
        user_id = "test-user-789"
        role = "USER"
        
        # Create token with wrong secret
        wrong_token = jwt.encode(
            {"sub": user_id, "role": role, "exp": datetime.utcnow() + timedelta(days=7)},
            "wrong-secret-key",
            algorithm=settings.ALGORITHM
        )
        
        # Act & Assert
        with pytest.raises(UnauthorizedException) as exc_info:
            TokenService.verify_token(wrong_token)
        
        assert "Invalid or expired token" in str(exc_info.value.message)
    
    def test_verify_token_expired(self):
        """Test that expired token raises UnauthorizedException."""
        # Arrange
        user_id = "test-user-expired"
        role = "USER"
        
        # Create token that expired 1 day ago
        expired_token = jwt.encode(
            {"sub": user_id, "role": role, "exp": datetime.utcnow() - timedelta(days=1)},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        
        # Act & Assert
        with pytest.raises(UnauthorizedException) as exc_info:
            TokenService.verify_token(expired_token)
        
        assert "Invalid or expired token" in str(exc_info.value.message)
    
    def test_verify_token_malformed(self):
        """Test that malformed token raises UnauthorizedException."""
        # Arrange
        malformed_token = "not.a.valid.jwt.token"
        
        # Act & Assert
        with pytest.raises(UnauthorizedException) as exc_info:
            TokenService.verify_token(malformed_token)
        
        assert "Invalid or expired token" in str(exc_info.value.message)
    
    def test_verify_token_empty(self):
        """Test that empty token raises UnauthorizedException."""
        # Arrange
        empty_token = ""
        
        # Act & Assert
        with pytest.raises(UnauthorizedException) as exc_info:
            TokenService.verify_token(empty_token)
        
        assert "Invalid or expired token" in str(exc_info.value.message)
    
    def test_token_contains_required_fields(self):
        """Test that token payload contains all required fields."""
        # Arrange
        user_id = "test-user-fields"
        role = "DOCTOR"
        
        # Act
        token = TokenService.create_access_token(user_id, role)
        payload = TokenService.verify_token(token)
        
        # Assert
        assert "sub" in payload  # User ID
        assert "role" in payload  # User role
        assert "exp" in payload  # Expiration
        assert payload["sub"] == user_id
        assert payload["role"] == role
    
    def test_different_roles(self):
        """Test token creation with different user roles."""
        # Test different roles
        roles = ["USER", "ADMIN", "DOCTOR", "PATIENT"]
        
        for role in roles:
            # Act
            token = TokenService.create_access_token(f"user-{role}", role)
            payload = TokenService.verify_token(token)
            
            # Assert
            assert payload["role"] == role
