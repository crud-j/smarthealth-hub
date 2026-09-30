"""
Shared httpOnly cookie helpers for JWT auth token delivery.

Both the main auth router (``auth.py``) and the passkey router
(``passkey.py``) need to write and clear the same pair of cookies.
Centralising the logic here avoids duplication and ensures cookie
attributes (httpOnly, SameSite, path, TTL) stay in sync across both
authentication paths.

Public API
----------
set_auth_cookies(response, *, access_token, refresh_token, secure=None)
    Write httpOnly access and refresh token cookies onto a Response.

clear_auth_cookies(response)
    Delete both auth cookies by overwriting them with empty values + max_age=0.
"""

from __future__ import annotations

from fastapi import Response

from app.core.config import settings

# ---------------------------------------------------------------------------
# Cookie attribute constants
# ---------------------------------------------------------------------------

_COOKIE_HTTPONLY = True
_COOKIE_SAMESITE = "lax"
# Derive cookie TTLs from the JWT lifetime settings so the cookie never
# expires before the token it carries (fixes the "logged out during lag"
# bug where a 15-minute cookie outlived by an 8-hour access token).
_ACCESS_TOKEN_MAX_AGE = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
_REFRESH_TOKEN_MAX_AGE = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str,
    secure: bool | None = None,
) -> None:
    """
    Write httpOnly access and refresh token cookies onto a Response.

    ``secure`` defaults to ``True`` when ENVIRONMENT=="production" so that
    HTTPS-only cookies are set automatically at deploy time without any
    code change.  Pass an explicit value only in tests that need to override
    this behaviour.

    Args:
        response:      The FastAPI ``Response`` object to set cookies on.
        access_token:  Signed JWT access token string.
        refresh_token: Signed JWT refresh token string.
        secure:        Override the Secure flag.  Defaults to
                       ``True`` in production, ``False`` otherwise.
    """
    if secure is None:
        secure = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=_ACCESS_TOKEN_MAX_AGE,
        httponly=_COOKIE_HTTPONLY,
        samesite=_COOKIE_SAMESITE,
        secure=secure,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=_REFRESH_TOKEN_MAX_AGE,
        httponly=_COOKIE_HTTPONLY,
        samesite=_COOKIE_SAMESITE,
        secure=secure,
        # Widened to "/" so the browser reliably sends the refresh cookie to
        # the refresh endpoint regardless of the API prefix / Next.js rewrite.
        # A narrow path (e.g. /api/v1/auth/refresh) breaks silently whenever
        # the prefix changes, causing refresh to fail and force a logout.
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    """Clear both auth cookies by setting them to empty with max_age=0."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
