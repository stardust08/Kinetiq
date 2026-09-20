"""
Pytest configuration for backend tests.

This module configures the test environment, including loading environment
variables from the .env file before tests run.
"""

import os
import sys
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Load environment variables from .env file
from dotenv import load_dotenv

env_file = backend_dir / ".env"
if env_file.exists():
    load_dotenv(env_file)
else:
    # Set minimal test environment variables if .env doesn't exist
    os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
    os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")
    os.environ.setdefault("ALGORITHM", "HS256")


import pytest
from app.db.client import db
from app.core.security import TokenService


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Connect to database before tests and disconnect after."""
    if not db.is_connected():
        await db.connect()
    yield
    # Don't disconnect here as it might be needed by other tests


@pytest.fixture
async def test_user_id():
    """Create a test user and return their ID."""
    import uuid
    unique_phone = f"+123456{uuid.uuid4().hex[:8]}"
    user = await db.user.create(
        data={
            "phone": unique_phone,
            "name": "Test User",
            "role": "USER"
        }
    )
    yield user.id
    # Cleanup
    try:
        await db.user.delete(where={"id": user.id})
    except:
        pass  # User might already be deleted


@pytest.fixture
def test_user_token(test_user_id):
    """Generate an authentication token for the test user."""
    token = TokenService.create_access_token(test_user_id, "USER")
    return token
