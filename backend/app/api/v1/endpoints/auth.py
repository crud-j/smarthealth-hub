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

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Form, Request, Response

from app.api.v1.endpoints._cookies import clear_auth_cookies, set_auth_cookies
from app.core.exceptions import UnauthorizedError
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, decode_token, revoke_token
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
    response: Response,
    db: DbDep,
) -> LoginResponse:
    """
    Validate staff email and password.  On success an OTP is dispatched to
    the user's registered email address — UNLESS the request includes a
    ``device_fingerprint`` that matches an unexpired trusted_devices row,
    in which case OTP is skipped and tokens are issued immediately.

    The ``session_hint`` in the response is the user's UUID — pass it as
    ``user_id`` to ``POST /auth/verify-otp`` along with the received OTP,
    UNLESS ``mfa_required`` is False (trusted device path), in which case
    auth cookies are already set and the caller should redirect to /dashboard.
    """
    ip = request.client.host if request.client else "unknown"

    # Rate-limit: max 5 login attempts per IP + email per 15 minutes.
    await limiter.check_rate_limit(
        key=f"login:{ip}:{body.email}",
        max_attempts=5,
        window_seconds=900,
    )

    user_id, tokens = await auth_service.login(
        db=db,
        email=body.email,
        password=body.password.get_secret_value(),
        ip_address=ip,
        device_fingerprint=body.device_fingerprint,
    )
    await db.commit()

    if tokens is not None:
        # Trusted device recognized — issue cookies and skip OTP entirely.
        access_token, refresh_token = tokens
        set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)
        return LoginResponse(
            message="Trusted device recognized — logged in without OTP.",
            session_hint=user_id,
            mfa_required=False,
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )

    return LoginResponse(
        message="OTP sent to registered mobile number",
        session_hint=user_id,
        mfa_required=True,
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

    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)

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
#   2. Click the "Authorize" button at the top of Swagger UI.
#   3. Scroll to the "OAuth2 (swaggerOAuth2)" section.
#   4. Fill in:
#        Username  -> your email address
#        Password  -> your password
#        client_secret -> the 6-digit OTP from the console / SMS
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
    summary="Swagger UI: combined login + OTP -> JWT (OAuth2 password grant)",
    description=(
        "**For Swagger UI use only.** Combines the two-step MFA login into a "
        "single OAuth2-compatible request so the built-in Authorize dialog can "
        "store the JWT automatically.\n\n"
        "**Workflow:**\n"
        "1. Call `POST /auth/login` to trigger the OTP dispatch.\n"
        "2. Click the **Authorize** button -> find **OAuth2 (swaggerOAuth2)**.\n"
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

    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)

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
    summary="Invalidate refresh token, revoke access token JTI, and clear auth cookies",
)
async def logout(
    request: Request,
    response: Response,
    db: DbDep,
    current_user: CurrentUser,
    access_token_cookie: Annotated[str | None, Cookie(alias="access_token")] = None,
) -> LogoutResponse:
    """
    Clear the httpOnly access and refresh token cookies and revoke the
    current access token in the Redis JTI denylist so it cannot be reused
    even within its remaining TTL.

    Token revocation approach:
      1. Extract the raw access token from the ``Authorization: Bearer``
         header (preferred by API clients) or the ``access_token`` httpOnly
         cookie (browser clients).
      2. Decode the already-validated JWT (``current_user`` was resolved by
         ``get_current_user``, so decoding here cannot fail for the same
         token).
      3. Write ``revoked:jti:{jti}`` to Redis with a TTL equal to the
         token's remaining lifetime.  If Redis is unavailable, the
         ``revoke_token`` helper logs a WARNING and returns gracefully —
         logout still succeeds (short access-token TTL is the fallback).

    Writes a LOGOUT audit entry.
    """
    ip = request.client.host if request.client else None

    # ── Revoke the current access token in the Redis JTI denylist ────────────
    # Prefer the Authorization header so API clients (e.g. Swagger) work even
    # when the httpOnly cookie is not sent by their HTTP client.
    raw_access_token: str | None = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        raw_access_token = auth_header[7:]
    elif access_token_cookie:
        raw_access_token = access_token_cookie

    if raw_access_token:
        try:
            payload = decode_token(raw_access_token)
            jti: str | None = payload.get("jti")
            exp_ts = payload.get("exp")
            if jti and exp_ts is not None:
                # Calculate remaining seconds so the Redis key auto-expires
                # when the token would have naturally expired anyway.
                remaining = int(exp_ts) - int(datetime.now(tz=UTC).timestamp())
                await revoke_token(jti=jti, ttl_seconds=remaining)
        except Exception:
            # decode_token raises UnauthorizedError if the token is already
            # invalid; any other unexpected exception must not abort logout.
            logger.warning(
                "logout: could not revoke access token JTI — token may be "
                "malformed or already expired. Logout proceeds regardless.",
                exc_info=True,
            )

    await auth_service.logout(db=db, user_id=current_user.id, ip_address=ip)
    await db.commit()

    clear_auth_cookies(response)

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
    raw_refresh = (body.refresh_token if body else None) or refresh_token_cookie
    if not raw_refresh:
        raise UnauthorizedError("No refresh token provided.")

    new_access, new_refresh = await auth_service.refresh_access_token(
        db=db,
        refresh_token=raw_refresh,
    )
    await db.commit()

    set_auth_cookies(response, access_token=new_access, refresh_token=new_refresh)

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
    # It returns the user's UUID when the email is registered, None otherwise.
    # Both paths return HTTP 200 with the same message — session_hint is not
    # a secret (the OTP itself is the authenticating factor).
    user_id = await auth_service.initiate_password_reset(db=db, email=body.email, ip_address=ip)
    await db.commit()

    return ForgotPasswordResponse(
        message="If the email is registered, a reset OTP has been sent to the linked mobile number.",
        session_hint=user_id,
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

    return ResetPasswordResponse(
        message="Password has been reset successfully. Please log in again."
    )


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
