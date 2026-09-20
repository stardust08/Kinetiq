"""
Manual test script for health check endpoint.
Tests the health check endpoint with a real HTTP request.
"""
import asyncio
import httpx
from app.main import create_app
from app.db.client import connect_db, disconnect_db


async def test_health_check():
    """Test health check endpoint with actual HTTP request."""
    print("=" * 60)
    print("Testing Health Check Endpoint")
    print("=" * 60)
    
    # Create app
    app = create_app()
    
    # Connect to database
    print("\n1. Connecting to database...")
    try:
        await connect_db()
        print("   ✓ Database connected")
    except Exception as e:
        print(f"   ✗ Database connection failed: {e}")
        return
    
    # Test with TestClient
    print("\n2. Testing /health endpoint...")
    from fastapi.testclient import TestClient
    client = TestClient(app)
    
    try:
        response = client.get("/health")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.json()}")
        
        if response.status_code == 200 and response.json() == {"status": "healthy"}:
            print("   ✓ Health check passed!")
        else:
            print("   ✗ Health check failed!")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Disconnect from database
    print("\n3. Disconnecting from database...")
    try:
        await disconnect_db()
        print("   ✓ Database disconnected")
    except Exception as e:
        print(f"   ✗ Database disconnection failed: {e}")
    
    print("\n" + "=" * 60)
    print("Test Complete")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_health_check())
