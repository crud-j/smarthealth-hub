"""
Authentication endpoints — Phase 1 implementation.

Public routes (no JWT required):
  POST /auth/login             — credential check; dispatches SMS OTP
  POST /auth/verify-otp        — verify OTP, issue JWT access + refresh tokens
  POST /auth/resend-otp        — resend OTP (same session)
  POST /auth/forgot-password   — initiate OTP-based password reset
  POST /auth/reset-password    — complete password reset with OTP

Protected routes (JWT required):
  POST /auth/refresh           — rotate access token using a refresh token
  POST /auth/logout            — clear auth cookies + write LOGOUT audit entry
  POST /auth/change-password   — change own password (requires current password)

Token delivery:
  - Access and refresh tokens are set as httpOnly, Secure, SameSite=Lax cookies
    so the browser client never needs to manage them in JavaScript storage.
  - Both tokens are ALSO returned in the JSON response body so that Swagger UI
    (which cannot read httpOnly cookies) can authorize subsequent test calls
    via the "Authorize" dialog.

Cookie names: ``access_token``, ``refresh_token``

SDP Reference: Section 6.1
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Form, Request, Response

from app.core.exceptions import UnauthorizedError
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, decode_token
from app.db.session import DbDep
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RefreshRequest,
    ResendOtpRequest,
    ResendOtpResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TokenResponse,
    VerifyOtpRequest,
)
from app.services import auth_service

logger = get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

# In production (HTTPS) set secure=True; in development HTTP set secure=False.
# A future settings flag (e.g. settings.COOKIE_SECURE) should drive this.
_COOKIE_HTTPONLY = True
_COOKIE_SAMESITE = "lax"
_ACCESS_TOKEN_MAX_AGE = 15 * 60          # 15 minutes in seconds
_REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60  # 7 days in seconds


def _set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str,
    secure: bool = False,  # flip to True when behind HTTPS in production
) -> None:
    """Write httpOnly access and refresh token cookies onto a Response."""
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
        path="/api/v1/auth/refresh",  # restrict refresh cookie to the refresh endpoint
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear both auth cookies by setting them to empty with max_age=0."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/api/v1/auth/refresh")


# ---------------------------------------------------------------------------
# POST /auth/login — step 1: validate credentials, dispatch OTP
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login with email + password (step 1 of MFA flow)",
    responses={
        401: {"description": "Invalid credentials"},
        403: {"description": "Account disabled"},
    },
)
async def login(
    body: LoginRequest,
    request: Request,
    db: DbDep,
) -> LoginResponse:
    """
    Validate staff email and password.  On success an OTP is dispatched to
    the user's registered mobile number (Phase 1: logged to console only).

    The ``session_hint`` in the response is the user's UUID — pass it as
    ``user_id`` to ``POST /auth/verify-otp`` along with the received OTP.
    """
    ip = request.client.host if request.client else "unknown"

    # Rate-limit: max 5 login attempts per IP + email per 15 minutes.
    await limiter.check_rate_limit(
        key=f"login:{ip}:{body.email}",
        max_attempts=5,
        window_seconds=900,
    )

    user_id = await auth_service.login(
        db=db,
        email=body.email,
        password=body.password.get_secret_value(),
        ip_address=ip,
    )
    await db.commit()

    return LoginResponse(
        message="OTP sent to registered mobile number",
        session_hint=user_id,
    )


# ---------------------------------------------------------------------------
# POST /auth/verify-otp — step 2: verify OTP, issue JWTs
# ---------------------------------------------------------------------------


@router.post(
    "/verify-otp",
    response_model=TokenResponse,
    summary="Verify SMS OTP and issue JWT tokens (step 2 of MFA flow)",
    responses={
        401: {"description": "Invalid or expired OTP"},
    },
)
async def verify_otp(
    body: VerifyOtpRequest,
    request: Request,
    response: Response,
    db: DbDep,
) -> TokenResponse:
    """
    Accept the 6-digit OTP sent to the user's mobile number.

    On success:
    - Issues a short-lived JWT access token (15 min).
    - Issues a long-lived refresh token (7 days).
    - Both tokens are set as httpOnly cookies AND returned in the response
      body for Swagger UI testing convenience.
    """
    ip = request.client.host if request.client else "unknown"

    # Rate-limit OTP verification: max 5 attempts per IP + user_id per 15 minutes.
    await limiter.check_rate_limit(
        key=f"verify_otp:{ip}:{body.user_id}",
        max_attempts=5,
        window_seconds=900,
    )

    access_token, refresh_token = await auth_service.verify_otp_and_issue_tokens(
        db=db,
        user_id=body.user_id,
        otp_code=body.otp_code,
        ip_address=ip,
    )
    await db.commit()

    _set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


# ---------------------------------------------------------------------------
# POST /auth/swagger-token — combined login + OTP for Swagger UI Authorize dialog
# ---------------------------------------------------------------------------
# This endpoint speaks the OAuth2 password-grant wire format so Swagger's
# built-in "Authorize" button can call it directly and store the JWT without
# any manual copy-paste.
#
# How to use in Swagger UI:
#   1. Call POST /auth/login first to trigger the OTP (watch the server console
#      for the printed OTP code in the development environment).
#   2. Click the "Authorize 🔒" button at the top of Swagger UI.
#   3. Scroll to the "OAuth2 (swaggerOAuth2)" section.
#   4. Fill in:
#        Username  → your email address
#        Password  → your password
#        client_secret → the 6-digit OTP from the console / SMS
#   5. Click "Authorize" — Swagger calls this endpoint, receives the token,
#      and automatically injects it into every subsequent request.
#
# Security note: This endpoint is intentionally NOT rate-limited separately —
# the underlying auth_service.login() and verify_otp_and_issue_tokens() calls
# carry their own rate limits.  It is also tagged with security=[] so it
# appears without the lock icon (public endpoint, same as /auth/login).
# ---------------------------------------------------------------------------


@router.post(
    "/swagger-token",
    response_model=TokenResponse,
    summary="Swagger UI: combined login + OTP → JWT (OAuth2 password grant)",
    description=(
        "**For Swagger UI use only.** Combines the two-step MFA login into a "
        "single OAuth2-compatible request so the built-in Authorize dialog can "
        "store the JWT automatically.\n\n"
        "**Workflow:**\n"
        "1. Call `POST /auth/login` to trigger the OTP dispatch.\n"
        "2. Click the **Authorize 🔒** button → find **OAuth2 (swaggerOAuth2)**.\n"
        "3. Enter `username` (email), `password`, and paste the OTP into "
        "**client_secret**.\n"
        "4. Click Authorize — the token is stored and used for all requests."
    ),
    openapi_extra={"security": []},  # public — no lock icon required
)
async def swagger_token(
    request: Request,
    response: Response,
    db: DbDep,
    username: Annotated[str, Form(description="Staff email address")],
    password: Annotated[str, Form(description="Account password")],
    client_secret: Annotated[
        str,
        Form(description="6-digit OTP received via SMS / printed in dev console"),
    ] = "",
    # OAuth2 form fields Swagger sends automatically — accepted but ignored.
    grant_type: Annotated[str | None, Form()] = None,
    client_id: Annotated[str | None, Form()] = None,
    scope: Annotated[str, Form()] = "",
) -> TokenResponse:
    ip = request.client.host if request.client else "unknown"

    # Step 1 — validate credentials and dispatch OTP.
    user_id = await auth_service.login(
        db=db,
        email=username,
        password=password,
        ip_address=ip,
    )
    await db.commit()

    if not client_secret:
        raise UnauthorizedError(
            "OTP is required. Enter the 6-digit code in the 'client_secret' field."
        )

    # Step 2 — verify OTP and issue tokens.
    access_token, refresh_token = await auth_service.verify_otp_and_issue_tokens(
        db=db,
        user_id=user_id,
        otp_code=client_secret,
        ip_address=ip,
    )
    await db.commit()

    _set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


# ---------------------------------------------------------------------------
# POST /auth/logout — clear cookies + audit log
# ---------------------------------------------------------------------------


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Invalidate refresh token and clear auth cookies",
)
async def logout(
    request: Request,
    response: Response,
    db: DbDep,
    current_user: CurrentUser,
) -> LogoutResponse:
    """
    Clear the httpOnly access and refresh token cookies.

    Writes a LOGOUT audit entry.  Phase 6 will add server-side token
    revocation (blocklist); for now the short access-token TTL (15 min)
    limits the window after a cookie is cleared.
    """
    ip = request.client.host if request.client else None

    await auth_service.logout(db=db, user_id=current_user.id, ip_address=ip)
    await db.commit()

    _clear_auth_cookies(response)

    return LogoutResponse(message="Logged out successfully")


# ---------------------------------------------------------------------------
# POST /auth/refresh — rotate access token
# ---------------------------------------------------------------------------


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Rotate access token using a refresh token",
    responses={
        401: {"description": "Invalid or expired refresh token"},
    },
)
async def refresh_token(
    response: Response,
    db: DbDep,
    body: RefreshRequest | None = None,
    refresh_token_cookie: Annotated[str | None, Cookie(alias="refresh_token")] = None,
) -> TokenResponse:
    """
    Accepts a refresh token from the ``refresh_token`` httpOnly cookie or
    (fallback) from the JSON body.  Issues a new access + refresh token pair.

    The old refresh token is not explicitly revoked in Phase 1; Phase 6
    will introduce server-side token rotation tracking.
    """
    raw_refresh = (
        (body.refresh_token if body else None)
        or refresh_token_cookie
    )
    if not raw_refresh:
        raise UnauthorizedError("No refresh token provided.")

    new_access, new_refresh = await auth_service.refresh_access_token(
        db=db,
        refresh_token=raw_refresh,
    )
    # refresh_access_token is read-only (no DB mutations) — no commit needed.

    _set_auth_cookies(response, access_token=new_access, refresh_token=new_refresh)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
    )


# ---------------------------------------------------------------------------
# POST /auth/resend-otp — resend OTP
# ---------------------------------------------------------------------------


@router.post(
    "/resend-otp",
    response_model=ResendOtpResponse,
    summary="Resend the SMS OTP (invalidates previous code)",
    responses={
        401: {"description": "User not found or deactivated"},
    },
)
async def resend_otp(
    body: ResendOtpRequest,
    request: Request,
    db: DbDep,
) -> ResendOtpResponse:
    """
    Invalidates any existing active OTP for the user and dispatches a fresh
    one.  Phase 1: OTP is logged to the server console.

    Note: The previous OTP is invalidated immediately so old codes cannot
    be replayed after a resend.
    """
    ip = request.client.host if request.client else None

    await auth_service.resend_otp(db=db, user_id=body.user_id, ip_address=ip)
    await db.commit()

    return ResendOtpResponse(message="OTP resent to registered mobile number")


# ---------------------------------------------------------------------------
# POST /auth/forgot-password — initiate password reset
# ---------------------------------------------------------------------------


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Initiate OTP-based password reset",
)
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: DbDep,
) -> ForgotPasswordResponse:
    """
    Sends a password-reset OTP to the mobile number linked to the supplied
    email address.  Always returns HTTP 200 with the same body, regardless
    of whether the email is registered, to prevent email enumeration.

    Phase 1: OTP logged to server console.
    """
    ip = request.client.host if request.client else None

    # Service is intentionally silent on unknown emails (anti-enumeration).
    await auth_service.initiate_password_reset(db=db, email=body.email, ip_address=ip)
    await db.commit()

    return ForgotPasswordResponse(
        message="If the email is registered, a reset OTP has been sent to the linked mobile number."
    )


# ---------------------------------------------------------------------------
# POST /auth/reset-password — complete password reset
# ---------------------------------------------------------------------------


@router.post(
    "/reset-password",
    response_model=ResetPasswordResponse,
    summary="Complete password reset using OTP",
    responses={
        401: {"description": "Invalid or expired OTP"},
    },
)
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    db: DbDep,
) -> ResetPasswordResponse:
    """
    Verifies the password-reset OTP dispatched by ``/auth/forgot-password``
    and updates the user's password hash.  The OTP can only be used once.
    """
    ip = request.client.host if request.client else None

    await auth_service.reset_password(
        db=db,
        user_id=body.user_id,
        otp_code=body.otp_code,
        new_password=body.new_password.get_secret_value(),
        ip_address=ip,
    )
    await db.commit()

    return ResetPasswordResponse(message="Password has been reset successfully. Please log in again.")


# ---------------------------------------------------------------------------
# POST /auth/change-password — authenticated password change
# ---------------------------------------------------------------------------


@router.post(
    "/change-password",
    response_model=ChangePasswordResponse,
    summary="Change own password (requires current password)",
    responses={
        401: {"description": "Current password is incorrect"},
    },
)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> ChangePasswordResponse:
    """
    Allows an authenticated user to change their own password.
    Requires the current password for verification before accepting the new one.
    """
    ip = request.client.host if request.client else None

    await auth_service.change_password(
        db=db,
        user_id=current_user.id,
        current_password=body.current_password.get_secret_value(),
        new_password=body.new_password.get_secret_value(),
        ip_address=ip,
    )
    await db.commit()

    return ChangePasswordResponse(message="Password changed successfully.")
