"""
Pydantic v2 response schema for the system configuration endpoint.

Only a safe, non-sensitive subset of settings is exposed.
Credentials, secret keys, and tokens are NEVER included here.
"""

from pydantic import BaseModel, Field


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

    registration_url: str = Field(..., description="Full public URL of the patient registration form")
    qr_base_url: str = Field(..., description="Base URL configured in QR_BASE_URL env var")
    bhc_name: str = Field(..., description="Barangay Health Center name")
