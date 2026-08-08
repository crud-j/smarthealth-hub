"""
FIDO2/WebAuthn passkey service — SmartHealth Hub.

Handles the full passkey lifecycle:
  1. Registration:  begin → browser ceremony → complete
  2. Authentication: begin → browser ceremony → complete → issue JWTs
  3. Management:  list active credentials, revoke a credential

Library: ``webauthn`` (PyPI: ``webauthn>=2.0.0``)
  - Uses ``parse_registration_credential_json`` / ``parse_authentication_credential_json``
    which accept a raw dict or JSON string (webauthn 2.x/3.x API).
  - ``options_to_json`` serialises PublicKeyCredential*Options to a JSON-safe dict.

Redis usage:
  - Challenges are stored with short TTLs (300s for registration, 120s for
    authentication) to prevent replay attacks.
  - Unlike JWT revocation, passkey ceremonies REQUIRE Redis — graceful degradation
    is not appropriate because a missing challenge cannot be safely assumed valid.
    Redis unavailability raises HTTP 503.

Security invariants:
  - Challenges are generated with ``secrets.token_bytes(32)`` (256-bit entropy).
  - Challenges are deleted from Redis immediately after retrieval (one-time use).
  - ``sign_count`` is updated on every successful authentication for clone detection.
  - ``user_verification=REQUIRED`` on all ceremonies — no UV-skipping allowed.
  - Audit rows written for PASSKEY_REGISTERED, PASSKEY_LOGIN, PASSKEY_REVOKED.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers import (
    parse_authentication_credential_json,
    parse_registration_credential_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import settings
from app.core.exceptions import NotFoundError, UnauthorizedError, ValidationError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_shared_redis,
)

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_redis_challenge(key: str) -> str | None:
    """Retrieve and return a stored challenge from Redis."""
    try:
        r = get_shared_redis()
        value: str | None = await r.get(key)
        return value
    except Exception as exc:  # noqa: BLE001
        logger.error("passkey: Redis read failed for key %s: %s", key, exc)
        return None


async def _set_redis_challenge(key: str, value: str, ttl: int) -> None:
    """
    Store a WebAuthn challenge in Redis.

    Unlike JWT revocation, passkey ceremonies REQUIRE Redis — there is no safe
    fallback if the challenge cannot be persisted.  Raises HTTP 503 on failure.
    """
    try:
        r = get_shared_redis()
        await r.setex(key, ttl, value)
    except Exception as exc:  # noqa: BLE001
        logger.error("passkey: Redis write failed for key %s: %s", key, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Passkey ceremony requires Redis to store the challenge. "
                "The Redis service is currently unavailable — please try again later."
            ),
        ) from exc


async def _delete_redis_key(key: str) -> None:
    """Delete a Redis key (best-effort — errors are logged, not raised)."""
    try:
        r = get_shared_redis()
        await r.delete(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("passkey: Redis delete failed for key %s: %s", key, exc)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


async def begin_registration(
    db: AsyncSession,
    user_id: uuid.UUID,
    device_name: str,
) -> dict[str, Any]:
    """
    Generate PublicKeyCredentialCreationOptions for a new passkey registration.

    Stores the challenge in Redis (key: ``passkey:reg:{user_id}``, TTL 300s).

    Args:
        db:          Active async database session.
        user_id:     UUID of the authenticated user registering the passkey.
        device_name: Human-readable label for the new authenticator.

    Returns:
        A JSON-serialisable dict representing PublicKeyCredentialCreationOptions.

    Raises:
        NotFoundError:       User does not exist.
        HTTP 503:            Redis is unavailable.
    """
    from app.models.user import User

    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.role))
    )
    user: User | None = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError(f"User {user_id} not found.")

    challenge = secrets.token_bytes(32)

    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.full_name,
        challenge=challenge,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        timeout=60000,
    )

    redis_key = f"passkey:reg:{user_id}"
    await _set_redis_challenge(redis_key, bytes_to_base64url(challenge), ttl=300)

    return json.loads(options_to_json(options))


async def complete_registration(
    db: AsyncSession,
    user_id: uuid.UUID,
    credential_dict: dict[str, Any],
    device_name: str,
) -> Any:  # returns PasskeyCredential ORM row
    """
    Verify the authenticator's attestation response and persist the credential.

    Retrieves the challenge from Redis (one-time use — deleted immediately).
    Writes a PASSKEY_REGISTERED audit log entry.

    Args:
        db:              Active async database session.
        user_id:         UUID of the authenticated user completing registration.
        credential_dict: Raw JSON dict from ``navigator.credentials.create()``.
        device_name:     Human-readable label for the new authenticator.

    Returns:
        The newly created ``PasskeyCredential`` ORM row.

    Raises:
        ValidationError: Challenge expired or registration ceremony failed.
    """
    from app.models.passkey_credential import PasskeyCredential
    from app.services import audit_service

    redis_key = f"passkey:reg:{user_id}"
    stored_challenge_b64: str | None = await _get_redis_challenge(redis_key)
    if not stored_challenge_b64:
        raise ValidationError(
            "Registration session expired. Please start the registration again."
        )
    await _delete_redis_key(redis_key)

    try:
        credential = parse_registration_credential_json(credential_dict)
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(stored_challenge_b64),
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise ValidationError(f"Passkey registration failed: {exc}") from exc

    aaguid_str: str | None = None
    if verification.aaguid:
        aaguid_str = str(verification.aaguid)

    row = PasskeyCredential(
        user_id=user_id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        aaguid=aaguid_str,
        device_name=device_name,
    )
    db.add(row)
    await db.flush()

    await audit_service.write_audit_log(
        db=db,
        user_id=user_id,
        action="PASSKEY_REGISTERED",
        entity_type="passkey_credential",
        entity_id=row.id,
        metadata={"device_name": device_name},
    )

    return row


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


async def begin_authentication(
    db: AsyncSession,
    email: str,
) -> dict[str, Any]:
    """
    Generate PublicKeyCredentialRequestOptions for a passkey sign-in.

    Stores the challenge in Redis (key: ``passkey:auth:{user.id}``, TTL 120s).
    Returns a generic error on unknown/inactive users to prevent enumeration.

    Args:
        db:    Active async database session.
        email: Email address of the user attempting passkey sign-in.

    Returns:
        A JSON-serialisable dict representing PublicKeyCredentialRequestOptions.

    Raises:
        UnauthorizedError: User not found, deactivated, or has no active passkeys.
        HTTP 503:          Redis is unavailable.
    """
    from app.models.passkey_credential import PasskeyCredential
    from app.models.user import User

    result = await db.execute(
        select(User)
        .where(User.email == email)
        .options(selectinload(User.role))
    )
    user: User | None = result.scalar_one_or_none()
    if user is None or not user.is_active:
        # Generic message — do not leak whether the account exists.
        raise UnauthorizedError(
            "Invalid credentials or no passkeys registered."
        )

    creds_result = await db.execute(
        select(PasskeyCredential).where(
            PasskeyCredential.user_id == user.id,
            PasskeyCredential.is_active.is_(True),
        )
    )
    creds = list(creds_result.scalars().all())
    if not creds:
        raise UnauthorizedError(
            "No passkeys registered for this account. Please use email OTP to sign in."
        )

    challenge = secrets.token_bytes(32)

    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=c.credential_id) for c in creds
        ],
        challenge=challenge,
        timeout=60000,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    redis_key = f"passkey:auth:{user.id}"
    await _set_redis_challenge(redis_key, bytes_to_base64url(challenge), ttl=120)

    return json.loads(options_to_json(options))


async def complete_authentication(
    db: AsyncSession,
    email: str,
    credential_dict: dict[str, Any],
) -> tuple[str, str]:
    """
    Verify the authenticator's assertion response and issue JWT tokens.

    Retrieves the challenge from Redis (one-time use — deleted immediately).
    Updates ``sign_count`` and ``last_used_at`` on the matched credential.
    Writes a PASSKEY_LOGIN audit log entry.

    Args:
        db:              Active async database session.
        email:           Email address of the user completing passkey sign-in.
        credential_dict: Raw JSON dict from ``navigator.credentials.get()``.

    Returns:
        ``(access_token, refresh_token)`` tuple ready to be set as cookies.

    Raises:
        UnauthorizedError: Any step of the assertion ceremony fails.
    """
    from app.models.passkey_credential import PasskeyCredential
    from app.models.user import User
    from app.services import audit_service

    result = await db.execute(
        select(User)
        .where(User.email == email)
        .options(selectinload(User.role))
    )
    user: User | None = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise UnauthorizedError("Invalid credentials.")

    # Extract the credential_id from the browser response to locate the DB row.
    try:
        cred_id_bytes = base64url_to_bytes(credential_dict["id"])
    except Exception as exc:  # noqa: BLE001
        raise UnauthorizedError("Invalid credential format.") from exc

    passkey_result = await db.execute(
        select(PasskeyCredential).where(
            PasskeyCredential.credential_id == cred_id_bytes,
            PasskeyCredential.user_id == user.id,
            PasskeyCredential.is_active.is_(True),
        )
    )
    passkey_row: PasskeyCredential | None = passkey_result.scalar_one_or_none()
    if passkey_row is None:
        raise UnauthorizedError("Passkey not found.")

    redis_key = f"passkey:auth:{user.id}"
    stored_challenge_b64: str | None = await _get_redis_challenge(redis_key)
    if not stored_challenge_b64:
        raise UnauthorizedError(
            "Authentication session expired. Please try signing in again."
        )
    await _delete_redis_key(redis_key)

    try:
        credential = parse_authentication_credential_json(credential_dict)
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(stored_challenge_b64),
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
            credential_public_key=passkey_row.public_key,
            credential_current_sign_count=passkey_row.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise UnauthorizedError("Passkey verification failed.") from exc

    # Update sign count and last-used timestamp.
    passkey_row.sign_count = verification.new_sign_count
    passkey_row.last_used_at = datetime.now(UTC)

    # Issue JWT pair.
    access_token = create_access_token(str(user.id), user.role.name)
    refresh_token = create_refresh_token(str(user.id))

    # Rotate refresh token hash (same pattern as auth_service).
    user.refresh_token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    user.last_login_at = datetime.now(UTC)

    await db.flush()

    await audit_service.write_audit_log(
        db=db,
        user_id=user.id,
        action="PASSKEY_LOGIN",
        entity_type="user",
        entity_id=user.id,
        metadata={
            "device_name": passkey_row.device_name,
            "role": user.role.name,
        },
    )

    return access_token, refresh_token


# ---------------------------------------------------------------------------
# Credential management
# ---------------------------------------------------------------------------


async def list_credentials(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[Any]:  # list[PasskeyCredential]
    """
    Return all active passkey credentials for the given user.

    Args:
        db:      Active async database session.
        user_id: UUID of the requesting user.

    Returns:
        List of ``PasskeyCredential`` ORM rows ordered newest-first.
    """
    from app.models.passkey_credential import PasskeyCredential

    result = await db.execute(
        select(PasskeyCredential)
        .where(
            PasskeyCredential.user_id == user_id,
            PasskeyCredential.is_active.is_(True),
        )
        .order_by(PasskeyCredential.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_credential(
    db: AsyncSession,
    user_id: uuid.UUID,
    credential_id: uuid.UUID,
    revoked_by: uuid.UUID,
) -> None:
    """
    Soft-delete a passkey credential by setting ``is_active=False``.

    IDOR guard: the credential must belong to ``user_id`` so a user can
    only revoke their own credentials even if they know another user's UUID.

    Args:
        db:            Active async database session.
        user_id:       UUID of the user who owns the credential.
        credential_id: UUID primary key of the ``passkey_credentials`` row.
        revoked_by:    UUID of the actor performing the revocation (audit).

    Raises:
        NotFoundError: Credential not found or does not belong to the user.
    """
    from app.models.passkey_credential import PasskeyCredential
    from app.services import audit_service

    result = await db.execute(
        select(PasskeyCredential).where(
            PasskeyCredential.id == credential_id,
            PasskeyCredential.user_id == user_id,
        )
    )
    row: PasskeyCredential | None = result.scalar_one_or_none()
    if row is None:
        raise NotFoundError("Passkey credential not found.")

    row.is_active = False
    await db.flush()

    await audit_service.write_audit_log(
        db=db,
        user_id=revoked_by,
        action="PASSKEY_REVOKED",
        entity_type="passkey_credential",
        entity_id=credential_id,
        metadata={"revoked_by": str(revoked_by), "owner_user_id": str(user_id)},
    )
