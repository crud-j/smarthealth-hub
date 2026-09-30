"""
Application configuration loaded from environment variables / .env file.

All settings are validated at startup by Pydantic Settings.
Never import this module at the top of a model or schema file — import it
inside functions or use FastAPI's dependency injection to avoid circular imports.

CORS_ORIGINS in .env must be a JSON array:
  CORS_ORIGINS=["http://localhost:3000","https://smarthealthhub.local"]
"""

import pathlib

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Treat empty env var values as if they were not set (use field defaults)
        env_ignore_empty=True,
    )

    # ── Environment ───────────────────────────────────────────────────────────
    # "development" | "production" — controls secure cookies, startup guards,
    # and whether the /auth/dev-token and /auth/dev-otp endpoints are exposed.
    ENVIRONMENT: str = "development"

    # ── Barangay Health Center identity ───────────────────────────────────────
    # Human-readable name shown in the UI, health card headers, and SMS footers.
    BHC_NAME: str = "Barangay Health Center"

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

    # Base URL used when building the NFC chip NDEF URI record (view_url).
    # NFC Tools encodes this URL on the chip; tapping the chip does a GET to
    # http://<NFC_VIEW_BASE_URL>/view/{card_number}.
    # Set to your machine's LAN IP + the port uvicorn listens on (port 9000).
    NFC_VIEW_BASE_URL: str = "http://192.168.100.6:9000"

    # ── SMS provider selection ────────────────────────────────────────────────
    # Controls which provider SMSService uses.
    # Valid values: "semaphore" | "itexmo" | "philsms" | "textbee"
    # Default: "semaphore" — keeps backward compatibility.
    #
    # Quick fix if your Semaphore custom sender name was rejected:
    #   Set SEMAPHORE_SENDER_NAME=Semaphore (the platform default — no LOA needed).
    #
    # To switch provider without LOA:
    #   SMS_PROVIDER=textbee  (recommended — sign up at textbee.dev, no LOA, no sender ID
    #                          registration; works immediately with any Philippine SIM)
    #   SMS_PROVIDER=itexmo   (sign up at itexmo.com, no LOA)
    #   SMS_PROVIDER=philsms  (sign up at philsms.com, no LOA)
    SMS_PROVIDER: str = "semaphore"

    # ── Semaphore SMS ─────────────────────────────────────────────────────────
    SEMAPHORE_API_KEY: str = ""
    # "Semaphore" is the platform default sender — it requires no approval and
    # works on any account.  Custom org names (e.g. "BHCMarilao") require an
    # approved Letter of Authorization from Semaphore before sends succeed.
    # Use "Semaphore" here to avoid that requirement entirely.
    SEMAPHORE_SENDER_NAME: str = "Semaphore"
    SEMAPHORE_BASE_URL: str = "https://api.semaphore.co/api/v4"
    # Shared secret for validating X-Semaphore-Signature on the delivery webhook.
    # Leave empty in development (validation is skipped when this is unset).
    SEMAPHORE_WEBHOOK_SECRET: str = ""

    # ── iTExmo SMS (alternative — no LOA required) ───────────────────────────
    # Sign up at https://itexmo.com — no sender-name Letter of Authorization.
    # All messages are delivered under the iTExmo platform sender name.
    ITEXMO_API_KEY: str = ""
    ITEXMO_EMAIL: str = ""           # the email address you registered with iTExmo
    ITEXMO_BASE_URL: str = "https://api.itexmo.com/api"

    # ── PhilSMS (alternative — no LOA required) ───────────────────────────────
    # Sign up at https://philsms.com — free tier available.
    # Use PHILSMS_SENDER_ID=PhilSMS (platform default) to avoid LOA.
    # Custom alphanumeric sender IDs MUST be registered in the PhilSMS dashboard
    # under Settings → Sender IDs before use — unregistered IDs are rejected.
    PHILSMS_TOKEN: str = ""          # Bearer token from the PhilSMS dashboard
    PHILSMS_SENDER_ID: str = "PhilSMS"
    # IMPORTANT: do NOT add a trailing slash — the service appends "/send" to build
    # the full endpoint URL.  Correct: "https://dashboard.philsms.com/api/v3/sms"
    # The service strips any accidental trailing slash defensively, but the default
    # here must be correct so that omitting the env var still works.
    PHILSMS_BASE_URL: str = "https://dashboard.philsms.com/api/v3/sms"

    # ── textbee (recommended replacement — no LOA, no registration, no sender ID) ─
    # How it works: install the textbee app on any Android phone with a Globe/Smart/DITO
    # SIM, register it at https://textbee.dev/dashboard, and SMS dispatch goes through
    # that physical device.  No LOA, no sender-name registration, no per-message fee.
    # Works immediately on any PH carrier.
    #
    # Setup:
    #   1. Sign up at https://textbee.dev (free, no credit card)
    #   2. Install the Android app and scan the QR code shown in the dashboard
    #   3. Copy your API key and device ID from the dashboard
    #   4. Set SMS_PROVIDER=textbee in .env
    #
    # Free tier: 50 msgs/day, 300/month — sufficient for thesis/UAT.
    # Pro ($9.99/mo): 5,000/month, no daily cap, up to 5 devices.
    #
    # RELIABILITY NOTE: SMS delivery depends on the Android phone being powered,
    # connected to Wi-Fi or mobile data, and running the textbee app.  Use a phone
    # permanently plugged in at the barangay health center.  Celery retries handle
    # transient device-offline windows (see SMS_MAX_RETRIES).
    #
    # PHI note: appointment reminder content (name + date + type) transits the
    # textbee cloud relay in transit to the Android device.  No diagnoses, record
    # numbers, or sensitive medical data should be included — the existing SMS
    # templates already comply with this constraint.
    TEXTBEE_API_KEY: str = ""        # API key from textbee.dev dashboard
    TEXTBEE_DEVICE_ID: str = ""      # Device ID of the registered Android phone
    #                                  Leave blank to use textbee's auto-selection
    #                                  (picks the device with the most recent heartbeat)
    TEXTBEE_BASE_URL: str = "https://api.textbee.dev/api/v1"

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

    # ── Admin alert phone ─────────────────────────────────────────────────────
    # E.164 format, e.g. +639171234567.  When set, the system sends an SMS alert
    # to this number when a Celery SMS reminder task fails permanently (all retries
    # exhausted) and when the hourly failure-rate monitor detects ≥5 failures in
    # the last 24 hours.  Leave blank to disable admin alert SMS.
    ADMIN_ALERT_PHONE: str = ""

    # ── Email / Gmail SMTP ───────────────────────────────────────────────────
    EMAIL_HOST: str = "smtp.gmail.com"
    EMAIL_PORT: int = 587
    EMAIL_HOST_USER: str = ""          # Gmail address used to send OTPs
    EMAIL_HOST_PASSWORD: str = ""      # Gmail App Password (not the account password)
    EMAIL_FROM_NAME: str = "BHC-Verify"
    EMAIL_USE_TLS: bool = True

    # ── Scheduled analytics report emails ─────────────────────────────────────
    # Set to False to disable the weekly and monthly summary report emails
    # that Celery Beat sends to all active admin users.
    REPORT_EMAIL_ENABLED: bool = True

    # ── WebAuthn / Passkey ────────────────────────────────────────────────────
    # WEBAUTHN_RP_ID must match the domain the app is served from (no port).
    # Use "localhost" for local dev, "bhc.local" for LAN deployment.
    WEBAUTHN_RP_ID: str = "localhost"
    # Human-readable name shown in biometric prompts (e.g. Windows Hello dialog).
    WEBAUTHN_RP_NAME: str = "SmartHealth Hub"
    # Full origin (scheme + host + port) the browser sees.
    # Must match exactly — wrong value causes all passkey assertions to fail.
    WEBAUTHN_ORIGIN: str = "http://localhost:3000"

    # ── OpenAI (AI analytics features) ───────────────────────────────────────────
    # Used by ai_service.py for no-show risk scoring and anomaly alert generation.
    # Leave empty to disable AI features — the service falls back to threshold-only
    # logic when this is unset.
    OPENAI_API_KEY: str = ""

    # ── OCR / Document extraction ─────────────────────────────────────────────
    # OCR provider: "tesseract" (default, offline) or "azure" (Document Intelligence).
    # When "azure", AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and _KEY must be set.
    OCR_PROVIDER: str = "tesseract"
    # Azure Document Intelligence — only used when OCR_PROVIDER="azure"
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: str = ""
    AZURE_DOCUMENT_INTELLIGENCE_KEY: str = ""
    # Maximum image upload size for OCR extraction (bytes). Default: 10 MiB.
    OCR_MAX_IMAGE_BYTES: int = 10 * 1024 * 1024  # 10 MiB

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

    @model_validator(mode="after")
    def validate_azure_ocr_config(self) -> "Settings":
        if self.OCR_PROVIDER == "azure":
            if not self.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:
                raise ValueError(
                    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT must be set when OCR_PROVIDER=azure"
                )
            if not self.AZURE_DOCUMENT_INTELLIGENCE_KEY:
                raise ValueError(
                    "AZURE_DOCUMENT_INTELLIGENCE_KEY must be set when OCR_PROVIDER=azure"
                )
        return self

    @model_validator(mode="after")
    def validate_encryption_key(self) -> "Settings":
        import base64
        import logging

        logger = logging.getLogger(__name__)

        if self.ENVIRONMENT == "production":
            if not self.ENCRYPTION_KEY:
                raise ValueError(
                    "ENCRYPTION_KEY must be set in production.\n"
                    'Generate with: python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"'
                )
            try:
                decoded = base64.b64decode(self.ENCRYPTION_KEY)
            except Exception as exc:
                raise ValueError(f"ENCRYPTION_KEY is not valid base64: {exc}") from exc
            if len(decoded) != 32:
                raise ValueError(
                    f"ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256); got {len(decoded)}"
                )
        else:
            if not self.ENCRYPTION_KEY:
                logger.warning(
                    "ENCRYPTION_KEY is not set — PHI fields will not be encrypted. "
                    "Set this before deploying."
                )

        return self

    @model_validator(mode="after")
    def validate_jwt_secret_key(self) -> "Settings":
        import logging

        if self.JWT_SECRET_KEY == "change-me-in-production":
            if self.ENVIRONMENT == "production":
                raise ValueError(
                    'JWT_SECRET_KEY must be changed in production. '
                    'Generate with: python -c "import secrets; print(secrets.token_hex(32))"'
                )
            logging.getLogger(__name__).warning(
                "JWT_SECRET_KEY is using the insecure default — change before deploying to production."
            )
        return self

    @model_validator(mode="after")
    def validate_qr_hmac_secret(self) -> "Settings":
        import logging

        if self.QR_HMAC_SECRET == "change-me-in-production":
            if self.ENVIRONMENT == "production":
                raise ValueError(
                    'QR_HMAC_SECRET must be changed in production. '
                    'Generate with: python -c "import secrets; print(secrets.token_hex(32))"'
                )
            logging.getLogger(__name__).warning(
                "QR_HMAC_SECRET is using the insecure default — change before deploying to production."
            )
        return self


# Singleton instance imported everywhere:  from app.core.config import settings
settings = Settings()
