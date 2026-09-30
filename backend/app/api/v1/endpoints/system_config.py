"""
System configuration endpoint — Admin only (read-only).

Routes:
  GET /system/info — Returns a safe, non-sensitive subset of runtime settings.

Auth: require_role("admin") — only admins can inspect system configuration.

SECURITY NOTE: Never expose JWT_SECRET_KEY, ENCRYPTION_KEY, SEMAPHORE_API_KEY,
EMAIL_HOST_PASSWORD, OPENAI_API_KEY, ITEXMO_API_KEY, PHILSMS_TOKEN, or any
credential/secret field through this endpoint.

No audit log entry is written — this is a read-only, non-PHI action.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter

from app.core.config import settings
from app.core.security import CurrentUser, require_role
from app.models.user import User
from app.schemas.system_config import RegistrationUrlResponse, SystemInfoResponse

router = APIRouter(prefix="/system", tags=["System"])

AdminOnly = require_role("admin")


def _registration_url() -> str:
    return f"{settings.QR_BASE_URL.strip().rstrip('/')}/intake"


@router.get(
    "/info",
    response_model=SystemInfoResponse,
    summary="Get system configuration (Admin only)",
)
async def get_system_info(
    current_user: Annotated[User, AdminOnly],
) -> SystemInfoResponse:
    """
    Returns a read-only snapshot of safe system configuration values.

    Exposed fields: BHC name, environment, SMS provider, reminder lead times,
    NFC base URL, and public registration URL. Credentials and secret keys are
    never included.

    Auth: Admin only. No audit log (non-PHI read-only operation).
    """
    return SystemInfoResponse(
        bhc_name=settings.BHC_NAME,
        environment=settings.ENVIRONMENT,
        sms_provider=settings.SMS_PROVIDER,
        sms_reminder_lead_hours=settings.SMS_REMINDER_LEAD_HOURS,
        sms_immunization_lead_days=settings.SMS_IMMUNIZATION_LEAD_DAYS,
        nfc_view_base_url=settings.NFC_VIEW_BASE_URL,
        registration_url=_registration_url(),
    )


@router.get(
    "/registration-url",
    response_model=RegistrationUrlResponse,
    summary="Get public registration URL (all authenticated staff)",
)
async def get_registration_url(
    current_user: CurrentUser,
) -> RegistrationUrlResponse:
    """
    Returns the public-facing patient registration URL derived from QR_BASE_URL.

    Used by the dashboard QR-code generator so staff can generate, download,
    and print the registration QR poster without CLI access.

    Auth: Any authenticated staff member. No audit log (non-PHI, non-mutating).
    """
    return RegistrationUrlResponse(
        registration_url=_registration_url(),
        qr_base_url=settings.QR_BASE_URL.strip(),
        bhc_name=settings.BHC_NAME,
    )
