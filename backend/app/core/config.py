"""
Configuration management using Pydantic Settings.

This module provides type-safe configuration management with validation
at startup. All settings are loaded from environment variables or .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    Attributes:
        APP_NAME: Application name for documentation
        DEBUG: Enable debug mode (default: False)
        DATABASE_URL: PostgreSQL connection string (required)
        SECRET_KEY: Secret key for JWT token signing (required, must be set in .env)
        ALGORITHM: JWT algorithm for token signing (default: HS256)
        ACCESS_TOKEN_EXPIRE_MINUTES: JWT token expiration time (default: 30)
        CORS_ORIGINS: List of allowed CORS origins
        AWS_ACCESS_KEY_ID: AWS access key ID (required)
        AWS_SECRET_ACCESS_KEY: AWS secret access key (required)
        AWS_REGION: AWS region (required)
        MEDIAPIPE_MODEL_COMPLEXITY: MediaPipe model complexity (0, 1, or 2)
        MEDIAPIPE_MIN_DETECTION_CONFIDENCE: Minimum confidence for pose detection
        MEDIAPIPE_MIN_TRACKING_CONFIDENCE: Minimum confidence for pose tracking
        ANALYSIS_SESSION_TIMEOUT_MINUTES: Timeout for analysis sessions
    """
    
    # App
    APP_NAME: str = "Healthcare Booking API"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str
    
    # Security
    SECRET_KEY: str  # Required: JWT signing secret key (must be set in .env)
    ALGORITHM: str = "HS256"  # JWT algorithm for token signing
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
  
    # AWS
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str = "ap-south-1"
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS from comma-separated string to list."""
        if isinstance(self.CORS_ORIGINS, str):
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        return self.CORS_ORIGINS
    
    # MediaPipe Configuration
    MEDIAPIPE_MODEL_COMPLEXITY: int = 2  # 0=Lite, 1=Full, 2=Heavy (default: 2 for best accuracy)
    MEDIAPIPE_MIN_DETECTION_CONFIDENCE: float = 0.7  # Minimum confidence for initial detection (0.0-1.0)
    MEDIAPIPE_MIN_TRACKING_CONFIDENCE: float = 0.7  # Minimum confidence for tracking (0.0-1.0)
    
    # Posture Analysis Configuration
    ANALYSIS_SESSION_TIMEOUT_MINUTES: int = 15  # Session timeout for posture analysis
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )


# Global settings instance
settings = Settings()
