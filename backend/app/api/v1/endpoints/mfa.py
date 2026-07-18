"""
MFA management endpoints (Phase 1 stubs).

Provides status and configuration endpoints for Multi-Factor Authentication.
OTP send/verify flows live in auth.py; this router handles user-facing
MFA settings (enable, disable, status check).

SDP Reference: Section 6.1 (auth) / Section 10 (MFA implementation)
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/mfa", tags=["mfa"])


@router.get("/status", summary="Get MFA status for the current user")
async def mfa_status() -> dict[str, str]:
    """
    Returns whether MFA is enabled for the authenticated user and the
    masked mobile number that OTPs are sent to.

    Auth: JWT required.
    Full implementation: Phase 1 — Foundation & Auth.
    """
    return {"message": "TODO: Phase 1 — MFA status"}
