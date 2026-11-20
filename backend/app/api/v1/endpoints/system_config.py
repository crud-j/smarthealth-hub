"""
System configuration endpoint — Admin only (read-only).

Routes:
  GET /system/info             — Safe, non-sensitive subset of runtime settings.
  GET /system/status           — System Health page: DB, Redis, worker/beat,
                                 disk, media, backups, alerts, deployed commit.
  GET /system/registration-url — Public registration URL (all staff).
  GET /system/settings         — Editable settings with defaults (Admin).
  PUT /system/settings         — Change / reset editable settings (Admin,
                                 audited as UPDATE system_settings).

Auth: require_role("admin") — only admins can inspect system configuration.

SECURITY NOTE: Never expose JWT_SECRET_KEY, ENCRYPTION_KEY, SEMAPHORE_API_KEY,
EMAIL_HOST_PASSWORD, OPENAI_API_KEY, ITEXMO_API_KEY, PHILSMS_TOKEN, or any
credential/secret field through this endpoint.

Reads are not audited (non-PHI). PUT /system/settings writes one audit row
listing every value it changed (old -> new).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Request

from app.core.config import settings
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.models.user import User
from app.schemas.system_config import (
    RegistrationUrlResponse,
    SystemInfoResponse,
    SystemSettingsResponse,
    SystemSettingsUpdate,
    SystemStatusResponse,
)
from app.services import system_settings_service
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
    db: DbDep,
) -> SystemInfoResponse:
    """
    Returns a read-only snapshot of safe system configuration values.

    Exposed fields: BHC name, environment, SMS provider, reminder lead times,
    NFC base URL, and public registration URL. Credentials and secret keys are
    never included.

    Auth: Admin only. No audit log (non-PHI read-only operation).
    """
    runtime = await system_settings_service.load_runtime_settings(db)
    return SystemInfoResponse(
        bhc_name=runtime.bhc_name,
        environment=settings.ENVIRONMENT,
        sms_provider=settings.SMS_PROVIDER,
        sms_reminder_lead_hours=runtime.sms_reminder_lead_hours,
        sms_immunization_lead_days=runtime.sms_immunization_lead_days,
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
    db: DbDep,
) -> RegistrationUrlResponse:
    """
    Returns the public-facing patient registration URL derived from QR_BASE_URL.

    Used by the dashboard QR-code generator so staff can generate, download,
    and print the registration QR poster without CLI access.

    Auth: Any authenticated staff member. No audit log (non-PHI, non-mutating).
    """
    runtime = await system_settings_service.load_runtime_settings(db)
    return RegistrationUrlResponse(
        registration_url=_registration_url(),
        qr_base_url=settings.QR_BASE_URL.strip(),
        bhc_name=runtime.bhc_name,
    )


@router.get(
    "/settings",
    response_model=SystemSettingsResponse,
    summary="Editable system settings with their defaults (Admin only)",
)
async def get_system_settings(
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
) -> SystemSettingsResponse:
    """
    Clinic name, reminder lead times and the SMS reminder templates: the value
    in effect, the default, whether an admin changed it, and who/when. Also
    returns the placeholder rules and sample values for the live preview.

    Auth: Admin only. No audit log (no PHI, read-only).
    """
    return await system_settings_service.get_settings_view(db)


@router.put(
    "/settings",
    response_model=SystemSettingsResponse,
    summary="Change or reset editable system settings (Admin only)",
)
async def update_system_settings(
    body: SystemSettingsUpdate,
    request: Request,
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
) -> SystemSettingsResponse:
    """
    Partial update: omitted fields are unchanged, ``null`` resets a value to
    its default. Templates are checked before saving (only the placeholders
    that message type provides; the essential ones must be present).

    Takes effect on the next reminder run; no restart needed.
    Auth: Admin only. Audited as UPDATE system_settings (old -> new values).
    """
    return await system_settings_service.update_settings(
        db,
        body,
        updated_by=current_user.id,
        ip_address=request.client.host if request.client else None,
    )
