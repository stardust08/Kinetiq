"""
CORS middleware configuration for the Healthcare Booking API.

This module configures Cross-Origin Resource Sharing (CORS) to allow
the frontend application to make requests to the backend API.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings


def setup_cors(app: FastAPI) -> None:
    """
    Configure CORS middleware for the FastAPI application.
    
    This function adds CORS middleware to allow cross-origin requests from
    the frontend application. It enables:
    - Requests from configured origins (from settings.CORS_ORIGINS)
    - Credentials (cookies, authorization headers)
    - All HTTP methods (including OPTIONS for preflight)
    - All headers
    
    Args:
        app: The FastAPI application instance
    """
    origins = settings.cors_origins_list
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600,  # Cache preflight requests for 1 hour
    )
