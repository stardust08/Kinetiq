"""
Custom exception classes for the Healthcare Booking API.

This module defines custom exceptions that provide consistent error handling
across the application. All custom exceptions inherit from AppException.
"""


class AppException(Exception):
    """
    Base exception class for all application-specific exceptions.
    
    Attributes:
        message: Human-readable error message
        status_code: HTTP status code to return
    """
    
    def __init__(self, message: str, status_code: int = 500):
        """
        Initialize the AppException.
        
        Args:
            message: Error message describing what went wrong
            status_code: HTTP status code (default: 500)
        """
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class BadRequestException(AppException):
    """
    Exception raised for invalid client requests (HTTP 400).
    
    Use this when the client sends malformed data, invalid parameters,
    or violates business rules.
    """
    
    def __init__(self, message: str):
        """
        Initialize the BadRequestException.
        
        Args:
            message: Error message describing the invalid request
        """
        super().__init__(message, 400)


class NotFoundException(AppException):
    """
    Exception raised when a requested resource is not found (HTTP 404).
    
    Use this when a database query returns no results or a resource
    doesn't exist.
    """
    
    def __init__(self, message: str):
        """
        Initialize the NotFoundException.
        
        Args:
            message: Error message describing what was not found
        """
        super().__init__(message, 404)


class UnauthorizedException(AppException):
    """
    Exception raised for authentication/authorization failures (HTTP 401).
    
    Use this when a user is not authenticated or lacks permission
    to access a resource.
    """
    
    def __init__(self, message: str):
        """
        Initialize the UnauthorizedException.
        
        Args:
            message: Error message describing the authorization failure
        """
        super().__init__(message, 401)


class ForbiddenException(AppException):
    """
    Exception raised when an authenticated caller lacks permission (HTTP 403).

    Distinct from UnauthorizedException, which is about *who you are*: 401 means
    "log in", 403 means "you are logged in and the answer is still no". Collapsing
    the two - as the codebase did before roles existed, by raising 401 for both -
    makes the frontend clear the token and bounce a clinician to the login screen
    when they merely opened a page meant for admins.

    Prefer NotFoundException over this one when a 403 would confirm that a resource
    exists. See app/core/authz.py.
    """

    def __init__(self, message: str):
        super().__init__(message, 403)


class ConflictException(AppException):
    """
    Exception raised when a request collides with current state (HTTP 409).

    Used for double-booked slots and for a second attempt to start a consultation
    that is already live - cases where the request was well-formed and permitted,
    and simply arrived too late.
    """

    def __init__(self, message: str):
        super().__init__(message, 409)
