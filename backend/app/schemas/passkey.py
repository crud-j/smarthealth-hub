"""
Pydantic v2 request/response schemas for FIDO2/WebAuthn passkey endpoints.

These schemas are thin serialisation contracts — no business logic lives here.
All validation of WebAuthn ceremony data is handled by py_webauthn in
``app/services/passkey_service.py``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Registration flow
# ---------------------------------------------------------------------------


class PasskeyRegisterBeginRequest(BaseModel):
    """Body for POST /auth/passkey/register/begin."""

    device_name: str = Field(
        default="My Passkey",
        max_length=100,
        description="Human-readable label for this authenticator (e.g. 'Work Laptop').",
    )


class PasskeyRegisterBeginResponse(BaseModel):
    """PublicKeyCredentialCreationOptions JSON returned to the browser."""

    model_config = ConfigDict(from_attributes=True)

    options: dict[str, Any]


class PasskeyRegisterCompleteRequest(BaseModel):
    """Body for POST /auth/passkey/register/complete."""

    # Raw JSON object from navigator.credentials.create() — passed straight
    # through to py_webauthn's RegistrationCredential parser.
    credential: dict[str, Any]
    device_name: str = Field(default="My Passkey", max_length=100)


class PasskeyRegisterCompleteResponse(BaseModel):
    """Returned after successful passkey registration."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_name: str
    created_at: datetime
    message: str = "Passkey registered successfully."


# ---------------------------------------------------------------------------
# Authentication flow
# ---------------------------------------------------------------------------


class PasskeyAuthBeginRequest(BaseModel):
    """Body for POST /auth/passkey/authenticate/begin."""

    email: str = Field(description="Staff email address of the user attempting sign-in.")


class PasskeyAuthBeginResponse(BaseModel):
    """PublicKeyCredentialRequestOptions JSON returned to the browser."""

    model_config = ConfigDict(from_attributes=True)

    options: dict[str, Any]


class PasskeyAuthCompleteRequest(BaseModel):
    """Body for POST /auth/passkey/authenticate/complete."""

    email: str
    # Raw JSON object from navigator.credentials.get() — passed straight
    # through to py_webauthn's AuthenticationCredential parser.
    credential: dict[str, Any]


# ---------------------------------------------------------------------------
# Credential management
# ---------------------------------------------------------------------------


class PasskeyCredentialInfo(BaseModel):
    """Public-facing summary of a single registered passkey."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_name: str
    aaguid: str | None
    created_at: datetime
    last_used_at: datetime | None
    is_active: bool


class PasskeyListResponse(BaseModel):
    """Response for GET /auth/passkey/credentials."""

    model_config = ConfigDict(from_attributes=True)

    credentials: list[PasskeyCredentialInfo]
