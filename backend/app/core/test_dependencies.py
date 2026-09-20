"""
Tests for authentication dependencies.

This module tests the get_current_user and get_current_active_user
dependencies to ensure proper authentication and authorization.
"""

import pytest
import anyio
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from fastapi.security.http import HTTPAuthorizationCredentials
from app.core.dependencies import get_current_user, get_current_active_user
from app.core.security import TokenService


def test_get_current_user_valid_token(monkeypatch):
    """Test get_current_user with a valid token returns the user."""
    async def run_test():
        # Create a mock user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.phone = "+1234567890"
        mock_user.role = "USER"
        mock_user.status = "ACTIVE"
        
        # Mock the database query
        mock_db = AsyncMock()
        mock_db.user.find_unique = AsyncMock(return_value=mock_user)
        
        # Patch the db import
        import app.core.dependencies
        monkeypatch.setattr(app.core.dependencies, "db", mock_db)
        
        # Create valid token
        token = TokenService.create_access_token("user123", "USER")
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        
        # Call the dependency
        user = await get_current_user(credentials)
        
        # Verify the user is returned
        assert user.id == "user123"
        assert user.role == "USER"
        mock_db.user.find_unique.assert_called_once_with(where={"id": "user123"})
    
    anyio.run(run_test)


def test_get_current_user_invalid_token():
    """Test get_current_user with an invalid token raises UnauthorizedException."""
    async def run_test():
        # Create invalid token
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid_token")
        
        # Call the dependency and expect exception
        # TokenService.verify_token raises UnauthorizedException which is not caught
        # by get_current_user, so it propagates up
        from app.core.exceptions import UnauthorizedException
        with pytest.raises(UnauthorizedException) as exc_info:
            await get_current_user(credentials)
        
        # Verify the exception message
        assert "Invalid or expired token" in str(exc_info.value.message)
    
    anyio.run(run_test)


def test_get_current_user_user_not_found(monkeypatch):
    """Test get_current_user when user doesn't exist in database."""
    async def run_test():
        # Mock the database query to return None
        mock_db = AsyncMock()
        mock_db.user.find_unique = AsyncMock(return_value=None)
        
        # Patch the db import
        import app.core.dependencies
        monkeypatch.setattr(app.core.dependencies, "db", mock_db)
        
        # Create valid token
        token = TokenService.create_access_token("nonexistent", "USER")
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        
        # Call the dependency and expect exception
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials)
        
        # Verify 401 status code
        assert exc_info.value.status_code == 401
        assert "User not found" in str(exc_info.value.detail)
    
    anyio.run(run_test)


def test_get_current_active_user_active():
    """Test get_current_active_user with an active user."""
    async def run_test():
        # Create a mock active user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.status = "ACTIVE"
        
        # Call the dependency
        user = await get_current_active_user(mock_user)
        
        # Verify the user is returned
        assert user.id == "user123"
        assert user.status == "ACTIVE"
    
    anyio.run(run_test)


def test_get_current_active_user_inactive():
    """Test get_current_active_user with an inactive user raises HTTPException."""
    async def run_test():
        # Create a mock inactive user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.status = "INACTIVE"
        
        # Call the dependency and expect exception
        with pytest.raises(HTTPException) as exc_info:
            await get_current_active_user(mock_user)
        
        # Verify 403 status code
        assert exc_info.value.status_code == 403
        assert "not active" in str(exc_info.value.detail)
    
    anyio.run(run_test)


def test_get_current_active_user_suspended():
    """Test get_current_active_user with a suspended user raises HTTPException."""
    async def run_test():
        # Create a mock suspended user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.status = "SUSPENDED"
        
        # Call the dependency and expect exception
        with pytest.raises(HTTPException) as exc_info:
            await get_current_active_user(mock_user)
        
        # Verify 403 status code
        assert exc_info.value.status_code == 403
    
    anyio.run(run_test)
