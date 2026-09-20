"""
Tests for CORS middleware configuration.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.middleware.cors import setup_cors
from app.core.config import settings


def test_cors_middleware_setup():
    """Test that CORS middleware is properly configured."""
    app = FastAPI()
    setup_cors(app)
    
    # Check that middleware was added
    assert len(app.user_middleware) > 0
    
    # Check that CORS middleware is in the stack
    from fastapi.middleware.cors import CORSMiddleware
    has_cors = any(
        hasattr(middleware, 'cls') and middleware.cls == CORSMiddleware
        for middleware in app.user_middleware
    )
    assert has_cors, "CORS middleware should be configured"


def test_cors_headers_in_response():
    """Test that CORS headers are present in responses."""
    app = FastAPI()
    setup_cors(app)
    
    @app.get("/test")
    def test_endpoint():
        return {"message": "test"}
    
    client = TestClient(app)
    
    # Test preflight request
    response = client.options(
        "/test",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        }
    )
    
    # Check CORS headers
    assert "access-control-allow-origin" in response.headers
    assert "access-control-allow-credentials" in response.headers
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_allows_configured_origin():
    """Test that configured origins are allowed."""
    app = FastAPI()
    setup_cors(app)
    
    @app.get("/test")
    def test_endpoint():
        return {"message": "test"}
    
    client = TestClient(app)
    
    # Test request from allowed origin
    response = client.get(
        "/test",
        headers={"Origin": settings.CORS_ORIGINS[0]}
    )
    
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers


def test_cors_credentials_enabled():
    """Test that credentials are enabled in CORS configuration."""
    app = FastAPI()
    setup_cors(app)
    
    @app.get("/test")
    def test_endpoint():
        return {"message": "test"}
    
    client = TestClient(app)
    
    # Test request with credentials
    response = client.get(
        "/test",
        headers={
            "Origin": settings.CORS_ORIGINS[0],
            "Cookie": "session=test"
        }
    )
    
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-credentials") == "true"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
