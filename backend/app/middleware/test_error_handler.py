"""
Unit tests for the error handler middleware.

Tests verify that the middleware correctly handles:
- Custom AppException and subclasses
- Pydantic validation errors
- Unexpected exceptions
"""

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from app.middleware.error_handler import setup_error_handler
from app.core.exceptions import (
    AppException,
    BadRequestException,
    NotFoundException,
    UnauthorizedException
)


# Test Pydantic model for validation testing
class ValidationTestModel(BaseModel):
    name: str = Field(..., min_length=1)
    age: int = Field(..., ge=0, le=150)


def create_test_app():
    """Create a test FastAPI application with error handler middleware."""
    app = FastAPI()
    setup_error_handler(app)
    
    # Test routes
    @app.get("/success")
    def success_route():
        return {"message": "success"}
    
    @app.get("/bad-request")
    def bad_request_route():
        raise BadRequestException("Invalid request data")
    
    @app.get("/not-found")
    def not_found_route():
        raise NotFoundException("Resource not found")
    
    @app.get("/unauthorized")
    def unauthorized_route():
        raise UnauthorizedException("Authentication required")
    
    @app.get("/app-exception")
    def app_exception_route():
        raise AppException("Custom error", 503)
    
    @app.get("/unexpected")
    def unexpected_route():
        raise ValueError("Unexpected error")
    
    @app.post("/validate")
    def validate_route(data: ValidationTestModel):
        return {"data": data.dict()}
    
    return app


@pytest.fixture
def client():
    """Create a test client for the application."""
    app = create_test_app()
    return TestClient(app)


def test_success_route(client):
    """Test that successful requests pass through middleware."""
    response = client.get("/success")
    assert response.status_code == 200
    assert response.json() == {"message": "success"}


def test_bad_request_exception(client):
    """Test that BadRequestException returns 400 with error message."""
    response = client.get("/bad-request")
    assert response.status_code == 400
    data = response.json()
    assert "error" in data
    assert data["error"] == "Invalid request data"


def test_not_found_exception(client):
    """Test that NotFoundException returns 404 with error message."""
    response = client.get("/not-found")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"] == "Resource not found"


def test_unauthorized_exception(client):
    """Test that UnauthorizedException returns 401 with error message."""
    response = client.get("/unauthorized")
    assert response.status_code == 401
    data = response.json()
    assert "error" in data
    assert data["error"] == "Authentication required"


def test_app_exception_custom_status(client):
    """Test that AppException with custom status code works correctly."""
    response = client.get("/app-exception")
    assert response.status_code == 503
    data = response.json()
    assert "error" in data
    assert data["error"] == "Custom error"


def test_unexpected_exception(client):
    """Test that unexpected exceptions return 500 with generic message."""
    response = client.get("/unexpected")
    assert response.status_code == 500
    data = response.json()
    assert "error" in data
    assert data["error"] == "Internal server error"


def test_validation_error_missing_field(client):
    """Test that validation errors return 422 with detailed error info."""
    response = client.post("/validate", json={})
    assert response.status_code == 422
    data = response.json()
    assert "error" in data
    assert data["error"] == "Validation error"
    assert "detail" in data
    assert isinstance(data["detail"], list)
    assert len(data["detail"]) > 0


def test_validation_error_invalid_type(client):
    """Test validation error with invalid data type."""
    response = client.post("/validate", json={"name": "John", "age": "invalid"})
    assert response.status_code == 422
    data = response.json()
    assert "error" in data
    assert data["error"] == "Validation error"
    assert "detail" in data


def test_validation_error_out_of_range(client):
    """Test validation error with out of range value."""
    response = client.post("/validate", json={"name": "John", "age": 200})
    assert response.status_code == 422
    data = response.json()
    assert "error" in data
    assert data["error"] == "Validation error"
    assert "detail" in data


def test_validation_error_empty_string(client):
    """Test validation error with empty string."""
    response = client.post("/validate", json={"name": "", "age": 25})
    assert response.status_code == 422
    data = response.json()
    assert "error" in data
    assert data["error"] == "Validation error"
    assert "detail" in data


def test_error_response_format(client):
    """Test that all error responses follow consistent format."""
    # Test various error types
    error_routes = [
        "/bad-request",
        "/not-found",
        "/unauthorized",
        "/unexpected"
    ]
    
    for route in error_routes:
        response = client.get(route)
        data = response.json()
        # All errors should have "error" field
        assert "error" in data
        assert isinstance(data["error"], str)
        assert len(data["error"]) > 0
