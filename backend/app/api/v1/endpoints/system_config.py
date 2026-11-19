"""
System configuration endpoint — Admin only (read-only).

Routes:
  GET /system/info             — Safe, non-sensitive subset of runtime settings.
  GET /system/status           — System Health page: DB, Redis, worker/beat,
                                 disk, media, backups, alerts, deployed commit.
  GET /system/registration-url — Public registration URL (all staff).

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
from app.db.session import DbDep
from app.models.user import User
from app.schemas.system_config import (
    RegistrationUrlResponse,
    SystemInfoResponse,
    SystemStatusResponse,
)
from app.services.system_status_service import collect_system_status

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
    "/status",
    response_model=SystemStatusResponse,
    summary="System health status (Admin only)",
)
async def get_system_status(
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
) -> SystemStatusResponse:
    """
    One-call answer to "is everything working?" for the System Health page.

    Each section has a status (ok / warning / error / unknown) and a short
    message. A broken dependency is reported in its own section; the endpoint
    itself still returns 200.

    Auth: Admin only. No audit log (no PHI, read-only).
    """
    return await collect_system_status(db)


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
