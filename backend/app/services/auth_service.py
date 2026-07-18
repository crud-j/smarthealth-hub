"""
Authentication business logic — SmartHealth Hub Phase 1.

This service owns all auth-related state transitions:
  - Credential validation + OTP generation (login step 1)
  - OTP verification + JWT issuance (login step 2)
  - Token rotation (refresh)
  - Password change / reset flows

All database mutations are flushed within the service functions but NOT
committed — the FastAPI route handler (or the ``get_db`` context manager)
is responsible for the final ``await db.commit()``.  This keeps transaction
boundaries explicit and allows a route to roll back on a later error.

SMS dispatch is intentionally stubbed in Phase 1: the plaintext OTP is
logged to stdout at INFO level so developers can copy it from the server
console during manual testing.  Real Semaphore integration is wired in
Phase 4.

Security invariants enforced here:
  - Passwords verified with Argon2id (passlib); timing-safe.
  - OTPs hashed with Argon2id before storage; plaintext never persisted.
  - JWT access tokens are short-lived (15 min); refresh tokens are 7 days.
  - Refresh tokens carry only ``sub`` — role is re-resolved from DB on rotation.
  - Audit rows written for LOGIN, LOGOUT, LOGIN_FAILED, PASSWORD_CHANGED,
    PASSWORD_RESET_REQUESTED.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services import audit_service, mfa_service

if TYPE_CHECKING:
    from app.models.user import User

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_user_by_email(db: AsyncSession, email: str) -> "User | None":
    """Return the User with ``role`` loaded, or None."""
    from app.models.user import User

    result = await db.execute(
        select(User)
        .where(User.email == email)
        .options(selectinload(User.role))
    )
    return result.scalar_one_or_none()


async def _get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> "User | None":
    """Return the User with ``role`` loaded, or None."""
    from app.models.user import User

    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.role))
    )
    return result.scalar_one_or_none()


def _get_client_ip(request_state: object | None) -> str | None:
    """
    Safely extract the client IP from a FastAPI ``Request`` object.
    Returns None rather than raising if the request is unavailable.
    """
    try:
        # FastAPI Request.client may be None in test environments.
        client = getattr(request_state, "client", None)
        if client is not None:
            return client[0]
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Step 1 — Credential validation + OTP generation
# ---------------------------------------------------------------------------


async def login(
    *,
    db: AsyncSession,
    email: str,
    password: str,
    ip_address: str | None = None,
) -> uuid.UUID:
    """
    Validate staff credentials and dispatch an SMS OTP.

    Returns the user's UUID (``session_hint``) that must be passed to
    ``verify_otp_and_issue_tokens`` together with the OTP code.

    Raises:
        UnauthorizedError: Email not found or password mismatch.
        ForbiddenError:    Account is deactivated.
    """
    user = await _get_user_by_email(db, email)

    # Use a generic error message for both "not found" and "wrong password"
    # to prevent email enumeration.
    if user is None or not verify_password(password, user.password_hash):
        # Only log the attempt when a user record exists to avoid log spam
        # from random probes.
        if user is not None:
            await audit_service.write_audit_log(
                db=db,
                user_id=user.id,
                action="LOGIN_FAILED",
                entity_type="user",
                entity_id=user.id,
                metadata={"reason": "wrong_password"},
                ip_address=ip_address,
            )
        raise UnauthorizedError("Invalid credentials. Please check your email and password.")

    if not user.is_active:
        await audit_service.write_audit_log(
            db=db,
            user_id=user.id,
            action="LOGIN_FAILED",
            entity_type="user",
            entity_id=user.id,
            metadata={"reason": "account_disabled"},
            ip_address=ip_address,
        )
        raise ForbiddenError("Account is disabled. Contact your system administrator.")

    # Generate OTP and store its hash.
    plain_otp = await mfa_service.generate_and_store_otp(
        db=db,
        user_id=user.id,
        purpose="login",
    )

    # --- Phase 1: SMS stub ---
    # Real Semaphore dispatch is wired in Phase 4 (SMS & Appointments).
    # During development, copy the OTP from the server console log below.
    logger.info(
        "OTP for development (Phase 1 stub — replace with Semaphore in Phase 4)",
        extra={
            "event": "OTP_STUB",
            "user_email": user.email,
            "user_id": str(user.id),
            "otp_code": plain_otp,  # visible in dev console; removed in Phase 4
        },
    )

    await audit_service.write_audit_log(
        db=db,
        user_id=user.id,
        action="OTP_SENT",
        entity_type="user",
        entity_id=user.id,
        metadata={"method": "sms_stub", "purpose": "login"},
        ip_address=ip_address,
    )

    return user.id


# ---------------------------------------------------------------------------
# Step 2 — OTP verification + JWT issuance
# ---------------------------------------------------------------------------


async def verify_otp_and_issue_tokens(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    otp_code: str,
    ip_address: str | None = None,
) -> tuple[str, str]:
    """
    Verify the submitted OTP and issue a JWT access + refresh token pair.

    Also updates ``users.last_login_at`` and writes a LOGIN audit entry.

    Returns:
        A ``(access_token, refresh_token)`` tuple of signed JWT strings.

    Raises:
        UnauthorizedError: OTP is wrong, expired, or the attempt limit was reached.
        UnauthorizedError: User no longer exists or is deactivated.
    """
    from datetime import UTC, datetime

    # Re-fetch the user to confirm they're still active at step 2 of the flow.
    user = await _get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User account not found or deactivated.")

    # Verify OTP — raises UnauthorizedError on failure.
    await mfa_service.verify_otp(
        db=db,
        user_id=user_id,
        plain_code=otp_code,
        purpose="login",
    )

    # Issue tokens.
    access_token = create_access_token(
        subject=str(user.id),
        role=user.role.name,
    )
    refresh_token = create_refresh_token(subject=str(user.id))

    # Stamp last_login_at.
    user.last_login_at = datetime.now(tz=UTC)
    await db.flush()

    await audit_service.write_audit_log(
        db=db,
        user_id=user.id,
        action="LOGIN",
        entity_type="user",
        entity_id=user.id,
        metadata={"role": user.role.name},
        ip_address=ip_address,
    )

    logger.info(
        "User authenticated successfully",
        extra={"user_id": str(user.id), "role": user.role.name},
    )

    return access_token, refresh_token


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


async def logout(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    ip_address: str | None = None,
) -> None:
    """
    Write a LOGOUT audit entry.

    Token revocation via a server-side blocklist is a Phase 6 hardening
    concern; for Phase 1 the client clears the httpOnly cookies and the
    short access-token TTL (15 min) limits the exposure window.
    """
    await audit_service.write_audit_log(
        db=db,
        user_id=user_id,
        action="LOGOUT",
        entity_type="user",
        entity_id=user_id,
        metadata={},
        ip_address=ip_address,
    )
    logger.info("User logged out", extra={"user_id": str(user_id)})


# ---------------------------------------------------------------------------
# Token refresh (rotation)
# ---------------------------------------------------------------------------


async def refresh_access_token(
    *,
    db: AsyncSession,
    refresh_token: str,
) -> tuple[str, str]:
    """
    Validate a refresh token and issue a new access + refresh token pair
    (rotation: old refresh token is implicitly superseded by the new one).

    Returns:
        ``(new_access_token, new_refresh_token)``

    Raises:
        UnauthorizedError: Token is invalid, expired, or wrong type.
    """
    payload = decode_token(refresh_token)

    if payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid token type. A refresh token is required.")

    subject: str | None = payload.get("sub")
    if not subject:
        raise UnauthorizedError("Token payload is missing the subject claim.")

    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        raise UnauthorizedError("Token contains an invalid user identifier.")

    user = await _get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User account not found or deactivated.")

    new_access_token = create_access_token(subject=str(user.id), role=user.role.name)
    new_refresh_token = create_refresh_token(subject=str(user.id))

    return new_access_token, new_refresh_token


# ---------------------------------------------------------------------------
# Resend OTP
# ---------------------------------------------------------------------------


async def resend_otp(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    ip_address: str | None = None,
) -> None:
    """
    Invalidate any existing active OTP and dispatch a fresh one.

    The caller is responsible for rate-limiting (e.g. max 3 resends per login
    session).  This service function does not enforce that limit itself — it
    is enforced at the route level via a counter in the session or a short
    Redis TTL (Phase 4).

    Raises:
        UnauthorizedError: User not found or deactivated.
    """
    user = await _get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User account not found or deactivated.")

    plain_otp = await mfa_service.generate_and_store_otp(
        db=db,
        user_id=user_id,
        purpose="login",
    )

    # Phase 1 stub — log instead of sending SMS.
    logger.info(
        "OTP resent (Phase 1 stub)",
        extra={
            "event": "OTP_STUB",
            "user_email": user.email,
            "user_id": str(user.id),
            "otp_code": plain_otp,
        },
    )

    await audit_service.write_audit_log(
        db=db,
        user_id=user.id,
        action="OTP_SENT",
        entity_type="user",
        entity_id=user.id,
        metadata={"method": "sms_stub", "purpose": "login", "trigger": "resend"},
        ip_address=ip_address,
    )


# ---------------------------------------------------------------------------
# Forgot password
# ---------------------------------------------------------------------------


async def initiate_password_reset(
    *,
    db: AsyncSession,
    email: str,
    ip_address: str | None = None,
) -> None:
    """
    Look up the user by email and dispatch a password-reset OTP.

    Always returns without raising even when the email is not found — this
    prevents email enumeration (the route always returns HTTP 200 with the
    same body regardless of outcome).
    """
    user = await _get_user_by_email(db, email)

    if user is None or not user.is_active:
        # Log at DEBUG so it's visible in development without leaking info.
        logger.debug(
            "Password reset requested for unknown/inactive account",
            extra={"email": email},
        )
        return  # silent no-op — client always sees success

    plain_otp = await mfa_service.generate_and_store_otp(
        db=db,
        user_id=user.id,
        purpose="password_reset",
    )

    # Phase 1 stub.
    logger.info(
        "Password-reset OTP (Phase 1 stub)",
        extra={
            "event": "OTP_STUB",
            "user_email": user.email,
            "user_id": str(user.id),
            "otp_code": plain_otp,
        },
    )

    await audit_service.write_audit_log(
        db=db,
        user_id=user.id,
        action="PASSWORD_RESET_REQUESTED",
        entity_type="user",
        entity_id=user.id,
        metadata={"method": "sms_stub"},
        ip_address=ip_address,
    )


# ---------------------------------------------------------------------------
# Reset password (after OTP verification)
# ---------------------------------------------------------------------------


async def reset_password(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    otp_code: str,
    new_password: str,
    ip_address: str | None = None,
) -> None:
    """
    Verify a password-reset OTP and update the user's password hash.

    Raises:
        UnauthorizedError: OTP invalid/expired or user not found.
    """
    user = await _get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User account not found or deactivated.")

    # Verify the reset OTP — raises UnauthorizedError on failure.
    await mfa_service.verify_otp(
        db=db,
        user_id=user_id,
        plain_code=otp_code,
        purpose="password_reset",
    )

    user.password_hash = hash_password(new_password)
    await db.flush()

    await audit_service.write_audit_log(
        db=db,
        user_id=user.id,
        action="PASSWORD_CHANGED",
        entity_type="user",
        entity_id=user.id,
        metadata={"trigger": "password_reset"},
        ip_address=ip_address,
    )

    logger.info("Password reset successfully", extra={"user_id": str(user.id)})


# ---------------------------------------------------------------------------
# Change password (authenticated flow)
# ---------------------------------------------------------------------------


async def change_password(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    current_password: str,
    new_password: str,
    ip_address: str | None = None,
) -> None:
    """
    Verify the current password and replace it with the new one.

    Raises:
        UnauthorizedError: Current password is wrong or user not found.
    """
    user = await _get_user_by_id(db, user_id)
    if user is None:
        raise UnauthorizedError("User account not found.")

    if not verify_password(current_password, user.password_hash):
        raise UnauthorizedError("Current password is incorrect.")

    user.password_hash = hash_password(new_password)
    await db.flush()

    await audit_service.write_audit_log(
        db=db,
        user_id=user.id,
        action="PASSWORD_CHANGED",
        entity_type="user",
        entity_id=user.id,
        metadata={"trigger": "change_password"},
        ip_address=ip_address,
    )

    logger.info("Password changed successfully", extra={"user_id": str(user.id)})
