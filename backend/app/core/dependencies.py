"""
FastAPI dependencies for authentication and authorization.

This module provides dependency functions that can be used to protect
routes and ensure users are authenticated and authorized.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from fastapi.security.http import HTTPAuthorizationCredentials
from app.core.security import TokenService
from app.db.client import db

# HTTPBearer security scheme for extracting Bearer tokens from Authorization header
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Dependency to get the current authenticated user.
    
    This dependency extracts the JWT token from the Authorization header,
    verifies it, and retrieves the corresponding user from the database.
    
    Args:
        credentials: HTTP Bearer credentials containing the JWT token
        
    Returns:
        User: The authenticated user object from the database
        
    Raises:
        HTTPException: 401 Unauthorized if token is invalid or user not found
        
    Example:
        @app.get("/protected")
        async def protected_route(user = Depends(get_current_user)):
            return {"user_id": user.id}
    """
    # Extract token from credentials
    token = credentials.credentials
    
    # Verify token and get payload (raises UnauthorizedException if invalid)
    payload = TokenService.verify_token(token)
    
    # Extract user ID from token payload
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    # Retrieve user from database
    user = await db.user.find_unique(where={"id": user_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user


async def get_current_active_user(user = Depends(get_current_user)):
    """
    Dependency to ensure the current user is active.
    
    This dependency builds on get_current_user() and adds an additional
    check to ensure the user's status is ACTIVE. Inactive users are denied
    access even with valid tokens.
    
    Args:
        user: The authenticated user from get_current_user dependency
        
    Returns:
        User: The authenticated and active user object
        
    Raises:
        HTTPException: 403 Forbidden if user is not active
        
    Example:
        @app.get("/active-only")
        async def active_only_route(user = Depends(get_current_active_user)):
            return {"message": "Welcome active user!"}
    """
    if user.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not active"
        )
    
    return user


async def get_current_admin(user = Depends(get_current_active_user)):
    """
    Dependency to ensure the current user is an admin.
    
    This dependency builds on get_current_active_user() and adds an additional
    check to ensure the user's role is ADMIN. Non-admin users are denied access.
    
    Args:
        user: The authenticated and active user from get_current_active_user dependency
        
    Returns:
        User: The authenticated, active admin user object
        
    Raises:
        HTTPException: 403 Forbidden if user is not an admin
        
    Example:
        @app.patch("/admin-only")
        async def admin_only_route(user = Depends(get_current_admin)):
            return {"message": "Welcome admin!"}
    """
    if user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return user
