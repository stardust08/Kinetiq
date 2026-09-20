"""
Unit tests for main application setup.

Tests the create_app factory function, health check endpoint,
application configuration, middleware setup, and startup/shutdown events.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware
from unittest.mock import patch, MagicMock, AsyncMock


# Mock the database connection for tests
@pytest.fixture(autouse=True)
def mock_db():
    """
    Stop the app's lifecycle events from touching the real database client.

    Two things were wrong with this and between them it never worked. It patched
    app.db.client.connect_db, but app/main.py does `from app.db.client import
    connect_db` at import time - so main holds its own reference and the patch missed
    it entirely. And the replacements were plain Mocks returning None, which cannot be
    awaited even once the patch lands.

    So every `with TestClient(app)` in this file ran the REAL startup and shutdown. The
    startup hit AlreadyConnectedError because conftest.py had already connected, and
    the shutdown disconnected the shared client out from under every test that ran
    afterwards.
    """
    with patch('app.main.connect_db', new_callable=AsyncMock) as mock_connect, \
         patch('app.main.disconnect_db', new_callable=AsyncMock) as mock_disconnect:
        yield mock_connect, mock_disconnect


@pytest.fixture
def client():
    """Create a test client for the application."""
    from app.main import create_app
    app = create_app()
    return TestClient(app)


@pytest.fixture
def app():
    """Create an application instance for testing."""
    from app.main import create_app
    return create_app()


# ============================================================================
# Application Creation Tests
# ============================================================================

def test_create_app():
    """Test that create_app returns a FastAPI instance."""
    from app.main import create_app
    app = create_app()
    assert app is not None
    assert isinstance(app, FastAPI)
    assert app.title == "Healthcare Booking API"
    assert app.version == "1.0.0"
    assert app.description == "Healthcare booking and management API"


def test_app_configuration(app):
    """Test that application is configured with correct settings."""
    from app.core.config import settings
    assert app.title == settings.APP_NAME
    assert app.debug == settings.DEBUG


# ============================================================================
# Middleware Tests
# ============================================================================

def test_cors_middleware_configured(app):
    """Test that CORS middleware is properly configured."""
    # Check that CORS middleware is in the middleware stack
    cors_middleware_found = False
    for middleware in app.user_middleware:
        if middleware.cls == CORSMiddleware:
            cors_middleware_found = True
            break
    
    assert cors_middleware_found, "CORS middleware not found in middleware stack"


def test_error_handler_middleware_configured(app):
    """Test that error handler middleware is configured."""
    # The error handler middleware is added via app.middleware("http")
    # We can verify it's working by checking middleware stack
    assert len(app.user_middleware) > 0, "No middleware configured"


def test_validation_exception_handler_configured(app):
    """Test that validation exception handler is registered."""
    from fastapi.exceptions import RequestValidationError
    # Check that RequestValidationError has a custom handler
    assert RequestValidationError in app.exception_handlers


# ============================================================================
# Lifecycle Events Tests
# ============================================================================

def test_startup_and_shutdown_events_registered(app):
    """Test that startup and shutdown events are registered."""
    # The application should have startup and shutdown event handlers
    # We verify this by checking that the app has the on_event handlers
    # The actual database connection is mocked by the autouse fixture
    
    # Create a test client which triggers lifecycle events
    with TestClient(app) as client:
        # If startup event works, health check should be accessible
        response = client.get("/health")
        assert response.status_code == 200
    # If shutdown event works, the context manager exits cleanly


# ============================================================================
# Health Check Tests
# ============================================================================

def test_health_check(client):
    """Test the health check endpoint returns healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_health_check_endpoint_in_docs(client):
    """Test that health check endpoint is documented."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    openapi_schema = response.json()
    assert "/health" in openapi_schema["paths"]
    assert "get" in openapi_schema["paths"]["/health"]


# ============================================================================
# Routes Tests
# ============================================================================

def test_api_routes_included(app):
    """Test that API routes are included in the application."""
    # Get all routes
    routes = [route.path for route in app.routes]
    
    # Verify health check endpoint
    assert "/health" in routes
    
    # Verify API routes are included (from api_router)
    api_routes = [route for route in routes if route.startswith("/api")]
    assert len(api_routes) > 0, "No API routes found"


def test_posture_routes_registered(app):
    """Test that posture analysis routes are properly registered."""
    # Get all routes
    routes = [route.path for route in app.routes]
    
    # Verify posture routes are included
    expected_posture_routes = [
        "/api/posture/start-analysis",
        # /process-frame was removed deliberately: it decoded a base64 JPEG and ran
        # MediaPipe on the server, and has been unreachable since pose estimation moved
        # into the browser. The route list was never updated.
        "/api/posture/finalize-analysis",
        "/api/posture/cancel-analysis",
        "/api/posture/my-assessments",
        "/api/posture/analysis/{id}",
        "/api/posture/validate-booking/{bookingId}"
    ]
    
    for expected_route in expected_posture_routes:
        assert expected_route in routes, f"Posture route '{expected_route}' not found in registered routes"
    
    # Verify posture routes have correct methods
    posture_routes = [route for route in app.routes if "/api/posture" in route.path]
    # Six, not seven: /process-frame was removed when pose estimation moved into
    # the browser, and nothing has replaced it.
    assert len(posture_routes) >= 6, f"Expected at least 6 posture routes, found {len(posture_routes)}"


def test_openapi_docs_available(client):
    """Test that OpenAPI documentation endpoints are available."""
    # Test Swagger UI
    response = client.get("/docs")
    assert response.status_code == 200
    
    # Test ReDoc
    response = client.get("/redoc")
    assert response.status_code == 200
    
    # Test OpenAPI schema
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "openapi" in response.json()


# ============================================================================
# Integration Tests
# ============================================================================

def test_application_startup_integration(mock_db):
    """Test complete application startup with all components."""
    mock_connect, mock_disconnect = mock_db
    
    from app.main import create_app
    app = create_app()
    
    # Create test client (triggers startup events)
    with TestClient(app) as client:
        # Verify application is accessible
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}
        
        # Verify CORS headers are present
        response = client.get("/health", headers={"Origin": "http://localhost:5173"})
        assert response.status_code == 200
    
    # TestClient context manager handles startup/shutdown


def test_error_handling_integration(client):
    """Test that error handling works end-to-end."""
    # Test 404 for non-existent endpoint
    response = client.get("/nonexistent")
    assert response.status_code == 404
    
    # Response should be JSON
    assert response.headers["content-type"] == "application/json"
