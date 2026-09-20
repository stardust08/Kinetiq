"""
Test script for error handling with invalid requests.
Tests various error scenarios to ensure proper error responses.
"""
import asyncio
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.exceptions import BadRequestException, NotFoundException, UnauthorizedException
from unittest.mock import patch


def test_error_handling():
    """Test error handling with various invalid requests."""
    print("=" * 60)
    print("Testing Error Handling")
    print("=" * 60)
    
    # Create app with mocked database
    with patch('app.db.client.connect_db'), patch('app.db.client.disconnect_db'):
        app = create_app()
        client = TestClient(app)
        
        # Test 1: 404 Not Found
        print("\n1. Testing 404 Not Found...")
        response = client.get("/nonexistent-endpoint")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 404, "Expected 404 status code"
        assert "detail" in response.json(), "Expected 'detail' in response"
        print("   ✓ 404 error handled correctly")
        
        # Test 2: Method Not Allowed (405)
        print("\n2. Testing 405 Method Not Allowed...")
        response = client.post("/health")  # Health check only accepts GET
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 405, "Expected 405 status code"
        print("   ✓ 405 error handled correctly")
        
        # Test 3: Custom AppException - BadRequest
        print("\n3. Testing custom BadRequestException...")
        # Add a test endpoint that raises BadRequestException
        from fastapi import APIRouter
        test_router = APIRouter()
        
        @test_router.get("/test-bad-request")
        def test_bad_request():
            raise BadRequestException("Invalid input provided")
        
        app.include_router(test_router)
        client = TestClient(app)  # Recreate client with new route
        
        response = client.get("/test-bad-request")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 400, "Expected 400 status code"
        assert response.json() == {"error": "Invalid input provided"}, "Expected error message"
        print("   ✓ BadRequestException handled correctly")
        
        # Test 4: Custom AppException - NotFound
        print("\n4. Testing custom NotFoundException...")
        @test_router.get("/test-not-found")
        def test_not_found():
            raise NotFoundException("Resource not found")
        
        app.include_router(test_router)
        client = TestClient(app)
        
        response = client.get("/test-not-found")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 404, "Expected 404 status code"
        assert response.json() == {"error": "Resource not found"}, "Expected error message"
        print("   ✓ NotFoundException handled correctly")
        
        # Test 5: Custom AppException - Unauthorized
        print("\n5. Testing custom UnauthorizedException...")
        @test_router.get("/test-unauthorized")
        def test_unauthorized():
            raise UnauthorizedException("Authentication required")
        
        app.include_router(test_router)
        client = TestClient(app)
        
        response = client.get("/test-unauthorized")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 401, "Expected 401 status code"
        assert response.json() == {"error": "Authentication required"}, "Expected error message"
        print("   ✓ UnauthorizedException handled correctly")
        
        # Test 6: Unexpected Exception (500)
        print("\n6. Testing unexpected exception (500)...")
        @test_router.get("/test-server-error")
        def test_server_error():
            raise ValueError("Unexpected error")
        
        app.include_router(test_router)
        client = TestClient(app)
        
        response = client.get("/test-server-error")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 500, "Expected 500 status code"
        assert response.json() == {"error": "Internal server error"}, "Expected generic error message"
        print("   ✓ Unexpected exception handled correctly (no sensitive info leaked)")
        
        # Test 7: Validation Error (422)
        print("\n7. Testing validation error (422)...")
        from pydantic import BaseModel
        
        class TestModel(BaseModel):
            name: str
            age: int
        
        @test_router.post("/test-validation")
        def test_validation(data: TestModel):
            return {"message": "success"}
        
        app.include_router(test_router)
        client = TestClient(app)
        
        # Send invalid data (missing required fields)
        response = client.post("/test-validation", json={})
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 422, "Expected 422 status code"
        assert "error" in response.json(), "Expected 'error' in response"
        assert response.json()["error"] == "Validation error", "Expected validation error message"
        assert "detail" in response.json(), "Expected 'detail' with error list"
        print("   ✓ Validation error handled correctly")
        
        # Test 8: Validation Error with wrong type
        print("\n8. Testing validation error with wrong type...")
        response = client.post("/test-validation", json={"name": "John", "age": "not-a-number"})
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        assert response.status_code == 422, "Expected 422 status code"
        assert "error" in response.json(), "Expected 'error' in response"
        print("   ✓ Type validation error handled correctly")
    
    print("\n" + "=" * 60)
    print("All Error Handling Tests Passed!")
    print("=" * 60)


if __name__ == "__main__":
    test_error_handling()
