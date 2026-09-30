"""
FIDO2/WebAuthn passkey endpoints.

Routes (all under /auth/passkey):

  Authenticated (requires valid JWT access token):
    POST /auth/passkey/register/begin      — generate registration options
    POST /auth/passkey/register/complete   — verify attestation, persist credential
    GET  /auth/passkey/credentials         — list user's active passkeys
    DELETE /auth/passkey/credentials/{id}  — revoke a passkey (soft-delete)

  Public (rate-limited 10 req/min per IP):
    POST /auth/passkey/authenticate/begin    — generate assertion options
    POST /auth/passkey/authenticate/complete — verify assertion, issue JWT cookies

Token delivery on authenticate/complete:
  - Same httpOnly cookie pattern as /auth/verify-otp via set_auth_cookies().
  - JWT access + refresh tokens are ALSO returned in the JSON body for Swagger.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response, status

from app.api.v1.endpoints._cookies import set_auth_cookies
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser
from app.db.session import DbDep
from app.schemas.auth import TokenResponse
from app.schemas.passkey import (
    PasskeyAuthBeginRequest,
    PasskeyAuthBeginResponse,
    PasskeyAuthCompleteRequest,
    PasskeyCredentialInfo,
    PasskeyListResponse,
    PasskeyRegisterBeginRequest,
    PasskeyRegisterBeginResponse,
    PasskeyRegisterCompleteRequest,
    PasskeyRegisterCompleteResponse,
)
from app.services import passkey_service

logger = get_logger(__name__)

router = APIRouter(prefix="/auth/passkey", tags=["passkey"])


# ---------------------------------------------------------------------------
# POST /auth/passkey/register/begin — start credential registration
# ---------------------------------------------------------------------------


@router.post(
    "/register/begin",
    response_model=PasskeyRegisterBeginResponse,
    summary="Begin passkey registration (generates PublicKeyCredentialCreationOptions)",
)
async def passkey_register_begin(
    body: PasskeyRegisterBeginRequest,
    current_user: CurrentUser,
    db: DbDep,
) -> PasskeyRegisterBeginResponse:
    """
    Generate WebAuthn creation options for registering a new passkey.

    The returned ``options`` dict must be passed to
    ``navigator.credentials.create(options)`` in the browser.  The response
    from that call should be sent to ``POST /auth/passkey/register/complete``.

    Requires: valid JWT access token (any role).
    """
    options = await passkey_service.begin_registration(
        db=db,
        user_id=current_user.id,
        device_name=body.device_name,
    )
    return PasskeyRegisterBeginResponse(options=options)


# ---------------------------------------------------------------------------
# POST /auth/passkey/register/complete — finish credential registration
# ---------------------------------------------------------------------------


@router.post(
    "/register/complete",
    response_model=PasskeyRegisterCompleteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Complete passkey registration (verify attestation, persist credential)",
)
async def passkey_register_complete(
    body: PasskeyRegisterCompleteRequest,
    current_user: CurrentUser,
    db: DbDep,
) -> PasskeyRegisterCompleteResponse:
    """
    Verify the authenticator's attestation response and store the public key.

    ``body.credential`` is the raw JSON object returned by
    ``navigator.credentials.create()`` — forward it unmodified.

    Requires: valid JWT access token (any role).
    """
    row = await passkey_service.complete_registration(
        db=db,
        user_id=current_user.id,
        credential_dict=body.credential,
        device_name=body.device_name,
    )
    await db.commit()

    return PasskeyRegisterCompleteResponse(
        id=row.id,
        device_name=row.device_name,
        created_at=row.created_at,
    )


# ---------------------------------------------------------------------------
# POST /auth/passkey/authenticate/begin — PUBLIC, rate-limited
# ---------------------------------------------------------------------------


@router.post(
    "/authenticate/begin",
    response_model=PasskeyAuthBeginResponse,
    summary="Begin passkey authentication (generates PublicKeyCredentialRequestOptions)",
)
async def passkey_authenticate_begin(
    body: PasskeyAuthBeginRequest,
    request: Request,
    db: DbDep,
) -> PasskeyAuthBeginResponse:
    """
    Generate WebAuthn request options for a passkey sign-in.

    The returned ``options`` dict must be passed to
    ``navigator.credentials.get(options)`` in the browser.  The response
    from that call should be sent to ``POST /auth/passkey/authenticate/complete``.

    Public endpoint — no JWT required.  Rate-limited: 10 requests/min per IP.
    """
    ip = request.client.host if request.client else "unknown"

    await limiter.check_rate_limit(
        key=f"passkey_auth_begin:{ip}",
        max_attempts=10,
        window_seconds=60,
    )

    options = await passkey_service.begin_authentication(db=db, email=body.email)
    return PasskeyAuthBeginResponse(options=options)


# ---------------------------------------------------------------------------
# POST /auth/passkey/authenticate/complete — PUBLIC, rate-limited
# ---------------------------------------------------------------------------


@router.post(
    "/authenticate/complete",
    response_model=TokenResponse,
    summary="Complete passkey authentication (verify assertion, issue JWT cookies)",
)
async def passkey_authenticate_complete(
    body: PasskeyAuthCompleteRequest,
    request: Request,
    response: Response,
    db: DbDep,
) -> TokenResponse:
    """
    Verify the authenticator's assertion response and issue JWT access +
    refresh tokens (same cookie pattern as ``POST /auth/verify-otp``).

    ``body.credential`` is the raw JSON object returned by
    ``navigator.credentials.get()`` — forward it unmodified.

    Public endpoint — no JWT required.  Rate-limited: 10 requests/min per IP.
    """
    ip = request.client.host if request.client else "unknown"

    await limiter.check_rate_limit(
        key=f"passkey_auth_complete:{ip}",
        max_attempts=10,
        window_seconds=60,
    )

    access_token, refresh_token = await passkey_service.complete_authentication(
        db=db,
        email=body.email,
        credential_dict=body.credential,
    )
    await db.commit()

    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


# ---------------------------------------------------------------------------
# GET /auth/passkey/credentials — list active passkeys
# ---------------------------------------------------------------------------


@router.get(
    "/credentials",
    response_model=PasskeyListResponse,
    summary="List the current user's active passkeys",
)
async def passkey_list_credentials(
    current_user: CurrentUser,
    db: DbDep,
) -> PasskeyListResponse:
    """
    Return all active passkey credentials registered by the current user.

    Requires: valid JWT access token (any role).
    """
    creds = await passkey_service.list_credentials(db=db, user_id=current_user.id)
    return PasskeyListResponse(
        credentials=[
            PasskeyCredentialInfo(
                id=c.id,
                device_name=c.device_name,
                aaguid=c.aaguid,
                created_at=c.created_at,
                last_used_at=c.last_used_at,
                is_active=c.is_active,
            )
            for c in creds
        ]
    )


# ---------------------------------------------------------------------------
# DELETE /auth/passkey/credentials/{credential_id} — revoke a passkey
# ---------------------------------------------------------------------------


@router.delete(
    "/credentials/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,  # 204 must have no body — explicit no-content class
    summary="Revoke (soft-delete) a passkey credential",
)
async def passkey_revoke_credential(
    credential_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
) -> Response:
    """
    Revoke a passkey by setting ``is_active=False``.

    Users can only revoke their own credentials (IDOR guard enforced in the
    service layer).

    Requires: valid JWT access token (any role).
    """
    await passkey_service.revoke_credential(
        db=db,
        user_id=current_user.id,
        credential_id=credential_id,
        revoked_by=current_user.id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
