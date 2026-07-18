"""
Application configuration loaded from environment variables / .env file.

All settings are validated at startup by Pydantic Settings.
Never import this module at the top of a model or schema file — import it
inside functions or use FastAPI's dependency injection to avoid circular imports.

CORS_ORIGINS in .env must be a JSON array:
  CORS_ORIGINS=["http://localhost:3000","https://smarthealthhub.local"]
"""

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

    # ── Semaphore SMS ─────────────────────────────────────────────────────────
    SEMAPHORE_API_KEY: str = ""
    SEMAPHORE_SENDER_NAME: str = "BHC-Health"
    SEMAPHORE_BASE_URL: str = "https://api.semaphore.co/api/v4"

    # ── SMS reminder scheduling ───────────────────────────────────────────────
    SMS_REMINDER_LEAD_HOURS: int = 24
    SMS_MAX_RETRIES: int = 3

    # ── Application-layer encryption (AES-256-GCM) ────────────────────────────
    # Base64-encoded 32-byte key for: medical_history.notes, visits.diagnosis,
    # visits.treatment_notes
    ENCRYPTION_KEY: str = ""

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
