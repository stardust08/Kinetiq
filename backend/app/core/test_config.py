"""
Unit tests for configuration management.

Tests the Settings class to ensure proper configuration loading
and validation.
"""

import os
import pytest
from pydantic import ValidationError
from app.core.config import Settings


def test_settings_loads_from_env():
    """Test that Settings loads DATABASE_URL from environment."""
    # The DATABASE_URL should be loaded from .env file
    settings = Settings()
    assert settings.DATABASE_URL is not None
    assert settings.DATABASE_URL.startswith("postgresql://")


def test_settings_has_default_values(monkeypatch):
    """
    The DEFAULTS, with no .env in the way.

    conftest.py calls load_dotenv(), so .env is in os.environ for the whole test
    session and `Settings()` picks it up. This previously asserted the defaults and got
    whatever the developer happened to have configured - it failed locally with
    ACCESS_TOKEN_EXPIRE_MINUTES=10080 and would have passed in CI, where there is no
    .env. A test whose result depends on the machine is worse than no test: red for the
    wrong reason locally, green for the wrong reason in CI.

    Both routes have to be closed. `model_config` names .env as an env_file, so
    Settings() reads the file whatever os.environ says; and conftest also load_dotenv()s
    it into the environment, so disabling the file alone is not enough either. Hence
    _env_file=None AND delenv, with every required field supplied explicitly.
    """
    for var in ("APP_NAME", "DEBUG", "ALGORITHM",
                "ACCESS_TOKEN_EXPIRE_MINUTES", "CORS_ORIGINS"):
        monkeypatch.delenv(var, raising=False)
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://u:p@localhost/db",
        SECRET_KEY="test-only",
        AWS_ACCESS_KEY_ID="test-only",
        AWS_SECRET_ACCESS_KEY="test-only",
    )
    assert settings.APP_NAME == "Healthcare Booking API"
    assert settings.DEBUG is False
    assert settings.ALGORITHM == "HS256"
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 30
    assert settings.CORS_ORIGINS == "http://localhost:5173"


def test_settings_requires_database_url():
    """Test that Settings requires DATABASE_URL to be set."""
    # Save original env var
    original_db_url = os.environ.get("DATABASE_URL")
    
    try:
        # Remove DATABASE_URL from environment
        if "DATABASE_URL" in os.environ:
            del os.environ["DATABASE_URL"]
        
        # Should raise ValidationError when DATABASE_URL is missing
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None)  # Don't load from .env
        
        # Check that the error is about DATABASE_URL
        errors = exc_info.value.errors()
        assert any(error["loc"] == ("DATABASE_URL",) for error in errors)
    
    finally:
        # Restore original env var
        if original_db_url:
            os.environ["DATABASE_URL"] = original_db_url


def test_settings_can_override_defaults():
    """Test that Settings can override default values via environment."""
    # Save original env vars
    original_debug = os.environ.get("DEBUG")
    original_app_name = os.environ.get("APP_NAME")
    
    try:
        # Set custom values
        os.environ["DEBUG"] = "true"
        os.environ["APP_NAME"] = "Custom API"
        
        # Create new settings instance
        settings = Settings()
        
        assert settings.DEBUG is True
        assert settings.APP_NAME == "Custom API"
    
    finally:
        # Restore original env vars
        if original_debug:
            os.environ["DEBUG"] = original_debug
        elif "DEBUG" in os.environ:
            del os.environ["DEBUG"]
        
        if original_app_name:
            os.environ["APP_NAME"] = original_app_name
        elif "APP_NAME" in os.environ:
            del os.environ["APP_NAME"]


def test_settings_cors_origins_parses_to_a_list():
    """
    CORS_ORIGINS is a comma-separated STRING; `cors_origins_list` is the parsed form.

    This asserted isinstance(CORS_ORIGINS, list) against a field declared as `str`, so
    it could never pass. Environment variables are strings - the parsing is the
    property's job, and the property is what the app uses.
    """
    settings = Settings(DATABASE_URL="postgresql://u:p@localhost/db",
                        SECRET_KEY="test-only",
                        CORS_ORIGINS="http://a.test, http://b.test")
    assert isinstance(settings.CORS_ORIGINS, str)
    assert settings.cors_origins_list == ["http://a.test", "http://b.test"]


def test_settings_has_secret_key():
    """Test that Settings has SECRET_KEY loaded from environment."""
    settings = Settings()
    assert settings.SECRET_KEY is not None
    assert len(settings.SECRET_KEY) > 0
    assert settings.SECRET_KEY != ""


def test_settings_has_algorithm():
    """Test that Settings has ALGORITHM with correct default."""
    settings = Settings()
    assert settings.ALGORITHM == "HS256"


def test_settings_requires_secret_key():
    """Test that Settings requires SECRET_KEY to be set."""
    # Save original env var
    original_secret_key = os.environ.get("SECRET_KEY")
    
    try:
        # Remove SECRET_KEY from environment
        if "SECRET_KEY" in os.environ:
            del os.environ["SECRET_KEY"]
        
        # Should raise ValidationError when SECRET_KEY is missing
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None)  # Don't load from .env
        
        # Check that the error is about SECRET_KEY
        errors = exc_info.value.errors()
        assert any(error["loc"] == ("SECRET_KEY",) for error in errors)
    
    finally:
        # Restore original env var
        if original_secret_key:
            os.environ["SECRET_KEY"] = original_secret_key
