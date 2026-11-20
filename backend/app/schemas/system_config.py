"""
Pydantic v2 response schema for the system configuration endpoint.

Only a safe, non-sensitive subset of settings is exposed.
Credentials, secret keys, and tokens are NEVER included here.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.sms_templates import TEMPLATE_KINDS, TEMPLATE_LANGUAGES, template_problems

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


# Reliability (SDP §11.7 — SMS delivery and OTP failure rates). Counts only.


class SmsWindow(BaseModel):
    sent: int = Field(..., description="sent + delivered + replied")
    failed: int
    stuck: int = Field(..., description="still 'queued' more than an hour after creation")
    failure_percent: float | None = Field(default=None, description="failed / (sent + failed)")


class SmsReliability(_Check):
    last_24h: SmsWindow
    last_7d: SmsWindow


class SignInWindow(BaseModel):
    successful: int = Field(..., description="LOGIN + LOGIN_TRUSTED_DEVICE + PASSKEY_LOGIN")
    failed_password: int = Field(..., description="LOGIN_FAILED")
    failed_otp: int = Field(..., description="OTP_FAILED")
    otp_sent: int
    otp_verified: int = Field(..., description="LOGIN (always follows a correct OTP)")
    otp_success_percent: float | None = None


class SignInReliability(_Check):
    last_24h: SignInWindow
    last_7d: SignInWindow


class ReminderRun(BaseModel):
    job: Literal["appointment", "immunization"]
    last_run_at: datetime | None = None
    queued: int | None = Field(default=None, description="SMS queued by that run")


class ReminderRuns(_Check):
    runs: list[ReminderRun]


class ReliabilityChecks(BaseModel):
    sms: SmsReliability
    sign_in: SignInReliability
    reminders: ReminderRuns


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
    reliability: ReliabilityChecks


# ---------------------------------------------------------------------------
# GET / PUT /system/settings — admin-editable runtime settings (Admin only)
# ---------------------------------------------------------------------------


class SettingValue(BaseModel):
    """One editable setting: what is in effect, the default, and who changed it."""

    value: str | int
    default: str | int
    is_custom: bool = Field(..., description="True when an admin override is in effect")
    updated_at: datetime | None = None
    updated_by: str | None = Field(None, description="Full name of the last editor")


class SmsTemplateSetting(SettingValue):
    """An SMS reminder template plus the rules the editor must follow."""

    kind: str
    language: str
    placeholders: list[str]
    required: list[str]
    max_length: int
    send_limit: int | None = Field(
        None,
        description="Characters actually sent before the message is cut "
        "(appointment reminders: room is kept for the CONFIRM code)",
    )


class SystemSettingsResponse(BaseModel):
    bhc_name: SettingValue
    sms_reminder_lead_hours: SettingValue
    sms_immunization_lead_days: SettingValue
    sms_templates: list[SmsTemplateSetting]
    sample_values: dict[str, str] = Field(
        ..., description="Fictional values the page uses for the live preview"
    )


class SystemSettingsUpdate(BaseModel):
    """
    Partial update. Omit a field to leave it alone; send ``null`` to go back
    to the default. ``sms_templates`` keys are ``"<kind>.<language>"``, e.g.
    ``"appointment_reminder.fil"``; a ``null`` value resets that template.
    """

    model_config = ConfigDict(extra="forbid")

    bhc_name: str | None = Field(None, max_length=120)
    sms_reminder_lead_hours: int | None = Field(None, ge=1, le=168)
    sms_immunization_lead_days: int | None = Field(None, ge=0, le=30)
    sms_templates: dict[str, str | None] | None = None

    @field_validator("bhc_name")
    @classmethod
    def _bhc_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Clinic name must be at least 2 characters.")
        return v

    @field_validator("sms_templates")
    @classmethod
    def _templates(cls, v: dict[str, str | None] | None) -> dict[str, str | None] | None:
        if v is None:
            return v
        cleaned: dict[str, str | None] = {}
        errors: list[str] = []
        for key, text in v.items():
            kind, _, lang = key.partition(".")
            if kind not in TEMPLATE_KINDS or lang not in TEMPLATE_LANGUAGES:
                errors.append(f"Unknown template '{key}'.")
                continue
            if text is None:
                cleaned[key] = None
                continue
            text = text.strip()
            problems = template_problems(kind, text)
            if problems:
                errors.append(f"{key}: " + "; ".join(problems))
            cleaned[key] = text
        if errors:
            raise ValueError(" | ".join(errors))
        return cleaned
