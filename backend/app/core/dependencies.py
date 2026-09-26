"""
FastAPI dependencies for authentication and authorization.

This module provides dependency functions that can be used to protect
routes and ensure users are authenticated and authorized.
"""

from typing import Iterable, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from fastapi.security.http import HTTPAuthorizationCredentials
from app.core.security import TokenService
from app.core.roles import Role, SCREENING_INITIATOR_ROLES, STAFF_ROLES
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
    try:
        is_admin_role = Role.parse(user.role) is Role.ADMIN
    except ValueError:
        is_admin_role = False

    if not is_admin_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return user


# ---------------------------------------------------------------------------
# Role dependencies
# ---------------------------------------------------------------------------
#
# `get_current_admin` above predates roles being a real feature and hardcodes one
# comparison. Everything below generalises it. The originals are kept and now delegate,
# so the twelve routes already depending on `get_current_admin` keep working while
# there is only one place that decides what "admin" means.


def require_roles(*roles: Role, detail: Optional[str] = None):
    """
    Build a dependency that admits only the listed roles.

        @router.get("/caseload")
        async def caseload(user = Depends(require_roles(Role.CLINICIAN, Role.ADMIN))):
            ...

    Raises 403, never 401: the caller proved who they are, and the answer is still no.
    Raising 401 here - as the hand-rolled checks used to - makes the frontend's
    interceptor delete the token and bounce a legitimately signed-in clinician to the
    login screen the moment they open an admin-only page.
    """
    allowed = tuple(roles)
    if not allowed:
        raise ValueError("require_roles() needs at least one role")

    async def _dependency(user=Depends(get_current_active_user)):
        try:
            actual = Role.parse(user.role)
        except ValueError:
            # A role we cannot parse is a role we cannot authorise. Fail closed.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account role is not recognised. Contact support.",
            )
        if actual not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=detail
                or "This action requires one of: "
                + ", ".join(r.label for r in allowed),
            )
        return user

    return _dependency


#: Clinician or admin: anyone who may act on another person's clinical record.
get_current_staff = require_roles(
    *STAFF_ROLES,
    detail="This action is restricted to clinicians and administrators.",
)

#: Clinician only. Admins are excluded on purpose where an endpoint writes to the
#: caller's own clinical calendar - an admin has no calendar of their own to write to.
get_current_clinician = require_roles(
    Role.CLINICIAN,
    detail="This action is restricted to clinicians.",
)

#: Patient only, for endpoints that act on the caller's own body - consenting to a
#: capture, logging an exercise as done.
get_current_patient = require_roles(
    Role.PATIENT,
    detail="This action is restricted to patients.",
)

#: Who may begin a screening. Named for the rule rather than the roles, because
#: app/core/screening_gate.py enforces more than role membership.
get_screening_initiator = require_roles(
    *SCREENING_INITIATOR_ROLES,
    detail="Only a clinician or administrator can start a screening.",
)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
):
    """
    The current user, or None when the request carries no usable credentials.

    For endpoints that are public but richer when signed in - the exercise catalogue
    shows the same videos to everyone, and additionally marks the ones already on the
    caller's plan. Swallows bad tokens rather than rejecting them: an expired token on
    a public endpoint should render the public view, not an error.
    """
    if credentials is None:
        return None
    try:
        payload = TokenService.verify_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            return None
        return await db.user.find_unique(where={"id": user_id})
    except Exception:
        return None
