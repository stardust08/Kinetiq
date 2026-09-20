"""
Main application entry point for the Healthcare Booking API.

This module creates and configures the FastAPI application with all
necessary middleware, lifecycle events, and routes.
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from app.core.config import settings
from app.db.client import connect_db, disconnect_db
from app.api.router import api_router
from app.middleware.cors import setup_cors
from app.middleware.error_handler import error_handler_middleware, validation_exception_handler


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.
    
    This factory function:
    - Creates the FastAPI app instance with metadata
    - Sets up CORS middleware
    - Sets up error handling middleware
    - Registers lifecycle events (startup/shutdown)
    - Adds health check endpoint
    - Includes API routes
    
    Returns:
        FastAPI: Configured FastAPI application instance
    """
    app = FastAPI(
        title=settings.APP_NAME,
        debug=settings.DEBUG,
        description="Healthcare booking and management API",
        version="1.0.0"
    )
    
    # Setup CORS middleware FIRST (before error handling)
    setup_cors(app)
    
    # Setup error handling middleware AFTER CORS
    app.middleware("http")(error_handler_middleware)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    
    # Lifecycle events
    @app.on_event("startup")
    async def startup():
        """Connect to database on application startup."""
        await connect_db()
    
    @app.on_event("shutdown")
    async def shutdown():
        """Disconnect from database on application shutdown."""
        await disconnect_db()
    
    # Health check endpoint
    @app.get("/health", tags=["Health"])
    def health_check():
        """
        Health check endpoint for monitoring.
        
        Returns:
            dict: Status indicating the application is healthy
        """
        return {"status": "healthy"}
    
    # Include API routes
    app.include_router(api_router)
    
    return app


# Create application instance
app = create_app()