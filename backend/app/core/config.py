"""
Application configuration loaded from environment variables / .env file.

All settings are validated at startup by Pydantic Settings.
Never import this module at the top of a model or schema file — import it
inside functions or use FastAPI's dependency injection to avoid circular imports.

CORS_ORIGINS in .env must be a JSON array:
  CORS_ORIGINS=["http://localhost:3000","https://smarthealthhub.local"]
"""

import pathlib

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Treat empty env var values as if they were not set (use field defaults)
        env_ignore_empty=True,
    )

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://shh_admin:SmartHealthHub@localhost:5445/smarthealthhub"

    # ── Redis / Celery ────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── QR / NFC card signing ─────────────────────────────────────────────────
    # HMAC-SHA256 secret — signs QR payload (patient_id + card_version only, never PHI)
    QR_HMAC_SECRET: str = "change-me-in-production"

    # Base URL used when building the QR code verification link.
    # In development: set this to your machine's LAN IP so mobile phones on
    # the same Wi-Fi can reach it, e.g. http://192.168.1.100:3000
    # In production: set to the public domain, e.g. https://smarthealthhub.example.com
    QR_BASE_URL: str = "http://localhost:3000"

    # ── Semaphore SMS ─────────────────────────────────────────────────────────
    SEMAPHORE_API_KEY: str = ""
    SEMAPHORE_SENDER_NAME: str = "BHC-Health"
    SEMAPHORE_BASE_URL: str = "https://api.semaphore.co/api/v4"
    # Shared secret for validating X-Semaphore-Signature on the delivery webhook.
    # Leave empty in development (validation is skipped when this is unset).
    SEMAPHORE_WEBHOOK_SECRET: str = ""

    # ── SMS reminder scheduling ───────────────────────────────────────────────
    SMS_REMINDER_LEAD_HOURS: int = 24       # hours before appointment to send reminder
    SMS_MAX_RETRIES: int = 3
    SMS_IMMUNIZATION_LEAD_DAYS: int = 3    # days before next_due_date to send reminder

    # ── Application-layer encryption (AES-256-GCM) ────────────────────────────
    # Base64-encoded 32-byte key for: medical_history.notes, visits.diagnosis,
    # visits.treatment_notes
    ENCRYPTION_KEY: str = ""

    # ── Media / file uploads ──────────────────────────────────────────────────
    # Absolute path to the directory where uploaded patient photos are stored.
    # Defaults to <repo-root>/backend/media.  Set MEDIA_DIR in .env to override
    # (useful in production to point at a volume-mounted path).
    # The directory is created automatically on startup if it does not exist.
    MEDIA_DIR: pathlib.Path = pathlib.Path(__file__).parent.parent.parent / "media"

    # Maximum upload size for patient profile photos (bytes).  Default: 5 MiB.
    MAX_PHOTO_UPLOAD_BYTES: int = 5 * 1024 * 1024  # 5 MiB

    # ── Email / Gmail SMTP ───────────────────────────────────────────────────
    EMAIL_HOST: str = "smtp.gmail.com"
    EMAIL_PORT: int = 587
    EMAIL_HOST_USER: str = ""          # Gmail address used to send OTPs
    EMAIL_HOST_PASSWORD: str = ""      # Gmail App Password (not the account password)
    EMAIL_FROM_NAME: str = "BHC-Verify"
    EMAIL_USE_TLS: bool = True

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Must be a JSON array in .env:
    #   CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
    # http://localhost:8000 is included by default so the Swagger UI page
    # (served from the FastAPI process itself) can issue browser fetch calls
    # back to the same origin during development.
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",   # Next.js dev server
        "http://localhost:8000",   # FastAPI itself (Swagger UI try-it-out)
    ]


# Singleton instance imported everywhere:  from app.core.config import settings
settings = Settings()
