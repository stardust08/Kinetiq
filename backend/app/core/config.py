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
        AWS_ACCESS_KEY_ID: AWS access key for OTP SMS (optional; SMS is disabled without it)
        AWS_SECRET_ACCESS_KEY: AWS secret key for OTP SMS (optional)
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
    #
    # Optional, and that is a deliberate change. These are used by exactly one thing -
    # sending an OTP over SNS (app/services/sns_service.py). Declaring them required made
    # the ENTIRE api refuse to start without SMS credentials: screenings, consultations,
    # exercise plans and every read endpoint, none of which touch AWS. The failure also
    # read as a pydantic validation error at import, which says nothing about SMS.
    #
    # Now the app boots, and SMS reports that it is not configured at the point somebody
    # tries to send one. See OTPService.generate_otp for how local development gets the
    # code without SMS.
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"

    @property
    def sms_configured(self) -> bool:
        """Whether there are credentials to send an SMS with."""
        return bool(self.AWS_ACCESS_KEY_ID and self.AWS_SECRET_ACCESS_KEY)
    
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

    # -----------------------------------------------------------------------
    # Video consultation
    # -----------------------------------------------------------------------
    # Peers connect directly to each other; the backend only relays the offer,
    # answer and ICE candidates. Video never touches this server, which is the
    # reason the design is worth having in a clinical product - the consultation
    # is not stored, transcoded or forwarded anywhere it need not be.

    #: STUN lets each peer discover its own public address. Google's public
    #: servers are the default because they need no account; replace them with
    #: your own for anything you would not want to depend on a third party for.
    STUN_SERVERS: str = "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"

    #: TURN relays media when a direct path cannot be found - roughly one call in
    #: six, and effectively all calls where one party is on a corporate or mobile
    #: carrier NAT. Without it those calls connect, ring, and show a black frame.
    #: Empty by default because a TURN server needs credentials; set all three in
    #: production. Format: "turn:host:3478,turns:host:5349".
    TURN_SERVERS: str = ""
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""

    #: How long a consultation may sit open before the signalling room is reaped.
    VIDEO_SESSION_MAX_MINUTES: int = 180

    #: Lifetime of the one-shot token that authorises a single supervised capture.
    SCREENING_TOKEN_TTL_MINUTES: int = 30

    #: When true, a patient cannot start a screening on their own: the capture must
    #: run inside a consultation that a clinician or admin has opened and explicitly
    #: unlocked. See app/core/screening_gate.py.
    #:
    #: Set it false only for a deployment that has decided unsupervised self-screening
    #: is acceptable, and understand that the numbers produced then carry no clinician's
    #: name. The test suite sets it false where a fixture predates supervision.
    SUPERVISED_SCREENING_REQUIRED: bool = True

    #: Where uploaded exercise videos are written. Served from /static/exercise-videos.
    EXERCISE_VIDEO_DIR: str = "static/exercise-videos"
    #: Rejected above this, before anything is written to disk.
    EXERCISE_VIDEO_MAX_MB: int = 200

    @property
    def ice_servers(self) -> list[dict]:
        """
        RTCConfiguration.iceServers, ready to hand to the browser.

        Built here rather than in the route so that the one place that knows how to
        read these settings is the place that owns them, and so a deployment with no
        TURN configured degrades to STUN-only rather than emitting a half-filled
        credential block that the browser rejects outright.
        """
        servers: list[dict] = []
        stun = [u.strip() for u in self.STUN_SERVERS.split(",") if u.strip()]
        if stun:
            servers.append({"urls": stun})
        turn = [u.strip() for u in self.TURN_SERVERS.split(",") if u.strip()]
        if turn and self.TURN_USERNAME and self.TURN_CREDENTIAL:
            servers.append(
                {
                    "urls": turn,
                    "username": self.TURN_USERNAME,
                    "credential": self.TURN_CREDENTIAL,
                }
            )
        return servers
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )


# Global settings instance
settings = Settings()
