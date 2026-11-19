"""
Pydantic v2 response schema for the system configuration endpoint.

Only a safe, non-sensitive subset of settings is exposed.
Credentials, secret keys, and tokens are NEVER included here.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ok = working; warning = works but needs attention soon; error = broken or
# will break; unknown = cannot be checked here (e.g. no backups on a dev PC).
CheckStatus = Literal["ok", "warning", "error", "unknown"]


class SystemInfoResponse(BaseModel):
    """Read-only snapshot of safe system configuration values."""

    bhc_name: str
    environment: str
    sms_provider: str
    sms_reminder_lead_hours: int
    sms_immunization_lead_days: int
    nfc_view_base_url: str
    registration_url: str


class RegistrationUrlResponse(BaseModel):
    """Response for GET /system/registration-url — non-sensitive, all staff."""

    registration_url: str = Field(
        ..., description="Full public URL of the patient registration form"
    )
    qr_base_url: str = Field(..., description="Base URL configured in QR_BASE_URL env var")
    bhc_name: str = Field(..., description="Barangay Health Center name")


# ---------------------------------------------------------------------------
# GET /system/status — System Health page (Admin only)
# ---------------------------------------------------------------------------


class _Check(BaseModel):
    status: CheckStatus
    message: str = Field(..., description="One plain-language sentence for the admin")


class DatabaseCheck(_Check):
    size_bytes: int | None = None


class RedisCheck(_Check):
    pass


class WorkerCheck(_Check):
    last_heartbeat_at: datetime | None = None
    age_seconds: int | None = None


class DiskCheck(_Check):
    total_bytes: int | None = None
    free_bytes: int | None = None
    used_percent: float | None = None


class MediaCheck(_Check):
    size_bytes: int | None = None
    file_count: int | None = None


class BackupCheck(_Check):
    last_success_at: datetime | None = None
    age_hours: float | None = None
    last_attempt_at: datetime | None = None
    db_bytes: int | None = None
    media_bytes: int | None = None
    schedule: str | None = None
    keep_days: int | None = None


class AlertsCheck(_Check):
    admin_alert_phone_configured: bool


class VersionInfo(BaseModel):
    commit: str
    environment: str


class SystemStatusResponse(BaseModel):
    """Everything the admin needs to answer "is the system working?"."""

    overall: CheckStatus
    checked_at: datetime
    version: VersionInfo
    database: DatabaseCheck
    redis: RedisCheck
    workers: WorkerCheck
    disk: DiskCheck
    media: MediaCheck
    backup: BackupCheck
    alerts: AlertsCheck
