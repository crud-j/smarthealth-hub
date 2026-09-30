"""
MFA management endpoints.

Provides status and configuration endpoints for Multi-Factor Authentication.
OTP send/verify flows live in auth.py; this router handles user-facing
MFA settings (enable, disable, status check).

SDP Reference: Section 6.1 (auth) / Section 10 (MFA implementation)
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.security import CurrentUser
from app.schemas.auth import MfaStatusResponse

router = APIRouter(prefix="/mfa", tags=["mfa"])


def _mask_email(email: str) -> str:
    """
    Obfuscate an email address for display.

    Keeps the first character of the local part, replaces the rest with
    '***', then appends '@<domain>'.

    Examples:
        jomarroxas10@gmail.com  ->  j***@gmail.com
        a@example.com           ->  a***@example.com
    """
    if "@" not in email:
        # Malformed address — return a safe placeholder rather than raising.
        return "***"
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain}"


@router.get(
    "/status",
    response_model=MfaStatusResponse,
    summary="Get MFA status for the current user",
)
async def mfa_status(current_user: CurrentUser) -> MfaStatusResponse:
    """
    Returns whether MFA is enabled for the authenticated user, the OTP
    delivery method (always 'email'), and a masked version of the contact
    address used to dispatch OTPs.

    Auth: JWT required — any authenticated role.
    No PHI is exposed; no audit log row is needed (read-only, non-clinical).
    """
    return MfaStatusResponse(
        mfa_enabled=current_user.mfa_enabled,
        otp_method="email",
        masked_contact=_mask_email(current_user.email),
    )
