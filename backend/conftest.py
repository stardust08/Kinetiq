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


@pytest.fixture(scope="session", autouse=True)
async def setup_database():
    """
    Connect once for the whole session, and do not fail if there is no database.

    Session-scoped on purpose. pytest-asyncio gives each test its own event loop unless
    told otherwise, and a connection opened on one loop cannot be used from another -
    the client raises "Future attached to a different loop", which surfaces from a route
    as a 500 rather than as an error. pytest.ini pins both the fixture and test loop
    scopes to session so this connection stays usable; changing either brings that back.

    Failure to connect is not fatal. Most of the suite fakes the database and has no
    business requiring one - that is what lets CI run the service and route tests with
    no Postgres at all. A test that genuinely needs a connection fails on its own query,
    which says far more than an error at collection time.

    There is deliberately no disconnect: the connection is shared, so tearing it down
    strands every test that runs afterwards.
    """
    if not db.is_connected():
        try:
            await db.connect()
        except Exception as exc:  # noqa: BLE001
            print(f"[INFO] no database for this run ({exc}); DB-backed tests will fail")
    yield


@pytest.fixture
async def test_user_id():
    """
    Create a real user in DATABASE_URL and delete it afterwards.

    Gated behind RUN_DB_INTEGRATION_TESTS. Nothing uses this fixture today, and that is
    exactly why it needed the gate: it writes a row to whatever DATABASE_URL points at,
    which in practice was the shared database holding live accounts. The next test to
    ask for `test_user_id` would have done so silently.

    Its cleanup also swallowed every exception with a bare `except:`, so a failed delete
    left the row behind without a word - which is how thirty test users accumulated in
    production before anyone noticed.
    """
    if os.getenv("RUN_DB_INTEGRATION_TESTS") != "1":
        pytest.skip(
            "test_user_id writes a real user to DATABASE_URL. Set "
            "RUN_DB_INTEGRATION_TESTS=1, with DATABASE_URL pointing at a disposable "
            "database, to use it."
        )

    import uuid
    unique_phone = f"+123456{uuid.uuid4().hex[:8]}"
    user = await db.user.create(
        data={
            "phone": unique_phone,
            "name": "Test User",
            "role": "USER"
        }
    )
    try:
        yield user.id
    finally:
        try:
            await db.user.delete(where={"id": user.id})
        except Exception as exc:  # noqa: BLE001 - say so rather than leaking silently
            print(f"[WARNING] could not delete test user {unique_phone}: {exc}")


@pytest.fixture
def test_user_token(test_user_id):
    """Generate an authentication token for the test user."""
    token = TokenService.create_access_token(test_user_id, "USER")
    return token
