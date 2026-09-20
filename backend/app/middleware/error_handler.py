"""
Error handler middleware for global exception handling.

This middleware catches all exceptions raised during request processing
and converts them into consistent JSON error responses.
"""

from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.core.exceptions import AppException
import logging

# Configure logger
logger = logging.getLogger(__name__)


async def error_handler_middleware(request: Request, call_next):
    """
    Global error handler middleware that catches all exceptions.
    
    This middleware wraps all requests and catches:
    - Custom AppException and its subclasses (BadRequestException, etc.)
    - Unexpected exceptions
    
    Note: Pydantic validation errors are handled by a separate exception handler
    because FastAPI processes them before they reach middleware.
    
    Args:
        request: The incoming HTTP request
        call_next: The next middleware or route handler in the chain
        
    Returns:
        JSONResponse with error details and appropriate status code
    """
    try:
        response = await call_next(request)
        return response
    except AppException as e:
        # Handle custom application exceptions
        logger.warning(
            f"AppException: {e.message} | Path: {request.url.path} | "
            f"Method: {request.method} | Status: {e.status_code}"
        )
        return JSONResponse(
            status_code=e.status_code,
            content={"error": e.message}
        )
    except Exception as e:
        # Handle unexpected errors
        logger.error(
            f"Unexpected error: {str(e)} | Path: {request.url.path} | "
            f"Method: {request.method}",
            exc_info=True  # Include stack trace in logs
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "Internal server error"}
        )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle Pydantic validation errors.
    
    This handler is registered as an exception handler for RequestValidationError
    and formats validation errors in a user-friendly way.
    
    Args:
        request: The incoming HTTP request
        exc: The validation error exception
        
    Returns:
        JSONResponse with validation error details
    """
    logger.warning(
        f"ValidationError: {str(exc)} | Path: {request.url.path} | "
        f"Method: {request.method}"
    )
    
    # Format validation errors in a user-friendly way
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        errors.append(f"{field}: {error['msg']}")
    
    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation error",
            "detail": errors
        }
    )


def setup_error_handler(app):
    """
    Setup error handler middleware for the FastAPI application.
    
    This function adds the error handler middleware and exception handlers
    to the application. It should be called during application initialization.
    
    Args:
        app: The FastAPI application instance
    """
    # Add middleware for general exception handling
    app.middleware("http")(error_handler_middleware)
    
    # Add exception handler for validation errors
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
