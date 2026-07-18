"""
MFA / OTP service — generates, stores, verifies, and expires one-time passwords.

OTP codes are 6-digit numeric strings, valid for 10 minutes, single-use.
The plaintext code is NEVER persisted — only its Argon2id hash is stored.

Brute-force protection:
  - Each ``MfaOtp`` row tracks ``attempt_count``.
  - After ``MAX_OTP_ATTEMPTS`` failed verifications the row is marked used
    (effectively invalidated) and the caller receives an error.

Resend rate-limiting:
  - At most ``MAX_RESENDS_PER_SESSION`` active (unused, non-expired) OTP rows
    may exist for a single user + purpose combination at any time.  Creating
    a new OTP automatically invalidates all previous ones for the same user
    and purpose so only one active code exists at a time.

Full implementation: Phase 1 — Foundation & Auth.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from passlib.hash import argon2
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OTP_EXPIRY_MINUTES: int = 10
MAX_OTP_ATTEMPTS: int = 5
OtpPurpose = Literal["login", "password_reset"]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def generate_and_store_otp(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    purpose: OtpPurpose = "login",
) -> str:
    """
    Generate a cryptographically random 6-digit OTP, hash it, and persist it.

    Any previously active (unused, non-expired) OTP rows for the same
    ``user_id`` + ``purpose`` are invalidated before the new row is created,
    ensuring at most one active code exists at a time.

    Args:
        db:      Active ``AsyncSession``.
        user_id: UUID of the user this OTP belongs to.
        purpose: ``"login"`` or ``"password_reset"`` — prevents cross-purpose replay.

    Returns:
        The plaintext 6-digit OTP string.  This must be dispatched to the user
        immediately; it is not retrievable after this function returns.
    """
    from app.models.mfa_otp import MfaOtp

    # Invalidate any existing active OTPs for this user+purpose to prevent
    # accumulation and ensure the user only has one valid code at a time.
    now = datetime.now(tz=UTC)
    await db.execute(
        update(MfaOtp)
        .where(
            MfaOtp.user_id == user_id,
            MfaOtp.purpose == purpose,
            MfaOtp.is_used.is_(False),
            MfaOtp.expires_at > now,
        )
        .values(is_used=True)
    )

    # Generate a 6-digit code using the secrets module (CSPRNG).
    plain_code: str = f"{secrets.randbelow(1_000_000):06d}"

    # Hash the plaintext code before storage.
    code_hash: str = argon2.hash(plain_code)

    otp_row = MfaOtp(
        user_id=user_id,
        otp_code_hash=code_hash,
        purpose=purpose,
        expires_at=now + timedelta(minutes=OTP_EXPIRY_MINUTES),
        is_used=False,
        attempt_count=0,
    )
    db.add(otp_row)
    await db.flush()  # get the DB-assigned ``id`` without committing yet

    logger.info(
        "OTP generated",
        extra={
            "user_id": str(user_id),
            "purpose": purpose,
            "otp_id": str(otp_row.id),
            "expires_at": otp_row.expires_at.isoformat(),
        },
    )

    return plain_code


async def verify_otp(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    plain_code: str,
    purpose: OtpPurpose = "login",
) -> None:
    """
    Verify a submitted OTP code against the stored hash.

    Implements constant-time comparison via ``passlib`` to prevent timing
    attacks.  Increments ``attempt_count`` on every call regardless of
    outcome; invalidates the row after ``MAX_OTP_ATTEMPTS`` failures or on
    first successful verification.

    Args:
        db:         Active ``AsyncSession``.
        user_id:    UUID of the user attempting verification.
        plain_code: The 6-digit OTP submitted by the user.
        purpose:    Must match the purpose used when the OTP was generated.

    Raises:
        UnauthorizedError: Code is wrong, expired, already used, or the
                           brute-force attempt limit has been reached.
    """
    from app.models.mfa_otp import MfaOtp

    now = datetime.now(tz=UTC)

    # Fetch the most recent active (unused, non-expired) OTP for this user+purpose.
    result = await db.execute(
        select(MfaOtp)
        .where(
            MfaOtp.user_id == user_id,
            MfaOtp.purpose == purpose,
            MfaOtp.is_used.is_(False),
            MfaOtp.expires_at > now,
        )
        .order_by(MfaOtp.created_at.desc())
        .limit(1)
    )
    otp_row: MfaOtp | None = result.scalar_one_or_none()

    if otp_row is None:
        logger.warning(
            "OTP verification failed — no active OTP found",
            extra={"user_id": str(user_id), "purpose": purpose},
        )
        raise UnauthorizedError("Invalid or expired OTP. Please request a new code.")

    # Increment attempt counter before verifying to prevent race-condition bypasses.
    otp_row.attempt_count += 1

    if otp_row.attempt_count > MAX_OTP_ATTEMPTS:
        otp_row.is_used = True  # lock out this OTP row permanently
        await db.flush()
        logger.warning(
            "OTP locked — too many failed attempts",
            extra={"user_id": str(user_id), "otp_id": str(otp_row.id)},
        )
        raise UnauthorizedError(
            "Too many failed OTP attempts. Please log in again to receive a new code."
        )

    # Constant-time comparison via passlib Argon2 verify.
    is_valid: bool = False
    try:
        is_valid = argon2.verify(plain_code, otp_row.otp_code_hash)
    except Exception:
        # passlib raises on malformed hash — treat as verification failure.
        is_valid = False

    if not is_valid:
        await db.flush()  # persist incremented attempt_count
        logger.warning(
            "OTP verification failed — wrong code",
            extra={
                "user_id": str(user_id),
                "otp_id": str(otp_row.id),
                "attempt_count": otp_row.attempt_count,
            },
        )
        remaining = MAX_OTP_ATTEMPTS - otp_row.attempt_count
        raise UnauthorizedError(
            f"Invalid OTP code. {max(remaining, 0)} attempt(s) remaining."
        )

    # Success — mark used so it cannot be replayed.
    otp_row.is_used = True
    await db.flush()

    logger.info(
        "OTP verified successfully",
        extra={"user_id": str(user_id), "otp_id": str(otp_row.id), "purpose": purpose},
    )
