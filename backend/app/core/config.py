"""
Application configuration loaded from environment variables / .env file.

All settings are validated at startup by Pydantic Settings.
Never import this module at the top of a model or schema file — import it
inside functions or use FastAPI's dependency injection to avoid circular imports.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://shh_admin:changeme@localhost:5432/smarthealthhub"

    # ── Redis / Celery ────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── QR / NFC card signing ─────────────────────────────────────────────────
    # HMAC-SHA256 secret used to sign QR payload (patient_id + card_version).
    # NEVER put PHI in the QR payload — only patient_id + card_version.
    QR_HMAC_SECRET: str = "change-me-in-production"

    # ── Semaphore SMS ─────────────────────────────────────────────────────────
    SEMAPHORE_API_KEY: str = ""
    SEMAPHORE_SENDER_NAME: str = "BHC-Health"
    SEMAPHORE_BASE_URL: str = "https://api.semaphore.co/api/v4"

    # ── SMS reminder scheduling ───────────────────────────────────────────────
    SMS_REMINDER_LEAD_HOURS: int = 24
    SMS_MAX_RETRIES: int = 3

    # ── Application-layer encryption (AES-256-GCM) ────────────────────────────
    # Base64-encoded 32-byte key for encrypting sensitive fields:
    # medical_history.notes, visits.diagnosis, visits.treatment_notes
    ENCRYPTION_KEY: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]


# Singleton instance — import this in the rest of the app:
#   from app.core.config import settings
settings = Settings()
