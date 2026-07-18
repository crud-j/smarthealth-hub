"""
Security utilities: password hashing, JWT creation/verification, and FastAPI
authentication dependencies.

Public API
----------
hash_password(plain)         — Argon2id hash of a plaintext password.
verify_password(plain, hash) — Verify plaintext against an Argon2id hash.
create_access_token(...)     — Issue a short-lived JWT access token.
create_refresh_token(...)    — Issue a long-lived JWT refresh token.
decode_token(token)          — Decode and verify a JWT; raises UnauthorizedError.
get_current_user             — FastAPI dependency; resolves to a full User ORM object.
require_role(*roles)         — FastAPI dependency factory; enforces RBAC by role name.

Token extraction order in ``get_current_user``:
  1. ``Authorization: Bearer <token>`` header
  2. ``access_token`` httpOnly cookie

Role names (from SDP Section 6 RBAC matrix):
  "admin" | "bhw" | "physician" | "admin_staff"

Security notes:
  - Passwords are hashed with Argon2id (passlib default params — memory-hard).
  - JWTs are signed with HS256 using the ``JWT_SECRET_KEY`` from settings.
  - Access tokens carry the user's role so endpoints can make RBAC decisions
    without an extra DB round-trip in the common case.  Role is also verified
    against the DB-loaded User to prevent token-role drift if a role changes.
  - ``get_current_user`` loads the full User ORM object with its ``role``
    relationship (selectinload) so callers never encounter lazy-loading errors
    inside async routes.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Annotated, Any

from fastapi import Cookie, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from passlib.hash import argon2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.db.session import get_db
from app.models.user import User

if TYPE_CHECKING:
    pass  # kept for any future TYPE_CHECKING-only imports


# ---------------------------------------------------------------------------
# Algorithm constant
# ---------------------------------------------------------------------------

_ALGORITHM = "HS256"
_TOKEN_TYPE_ACCESS = "access"
_TOKEN_TYPE_REFRESH = "refresh"

# ---------------------------------------------------------------------------
# Password hashing (Argon2id via passlib)
# ---------------------------------------------------------------------------


def hash_password(plain: str) -> str:
    """
    Hash a plaintext password with Argon2id.

    Uses passlib's default Argon2 parameters (memory_cost=65536, time_cost=3,
    parallelism=4) which exceed the OWASP minimum recommendations.

    Args:
        plain: The plaintext password supplied by the user.

    Returns:
        An Argon2id hash string suitable for storing in ``users.password_hash``.
    """
    return argon2.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plaintext password against an Argon2id hash.

    Returns ``True`` if the password matches, ``False`` otherwise.
    Never raises — a mis-match simply returns ``False``.

    Args:
        plain:  Plaintext password from the login request.
        hashed: Stored Argon2id hash from ``users.password_hash``.
    """
    try:
        return argon2.verify(plain, hashed)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT creation
# ---------------------------------------------------------------------------


def create_access_token(subject: str, role: str) -> str:
    """
    Create a signed JWT access token.

    Payload fields:
      sub  — user UUID as string
      role — role name (e.g. "bhw", "admin")
      type — "access"
      exp  — expiry timestamp (UTC)
      iat  — issued-at timestamp (UTC)

    Args:
        subject: The user's UUID (as a string).
        role:    The user's role name from the ``roles`` table.

    Returns:
        A signed HS256 JWT string.
    """
    now = datetime.now(tz=UTC)
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": _TOKEN_TYPE_ACCESS,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """
    Create a signed JWT refresh token.

    Refresh tokens carry only the subject and no role claim — the role is
    re-resolved from the DB when the access token is refreshed.

    Payload fields:
      sub  — user UUID as string
      type — "refresh"
      exp  — expiry (7 days by default)
      iat  — issued-at

    Args:
        subject: The user's UUID (as a string).

    Returns:
        A signed HS256 JWT string.
    """
    now = datetime.now(tz=UTC)
    expire = now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": _TOKEN_TYPE_REFRESH,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=_ALGORITHM)


# ---------------------------------------------------------------------------
# JWT decoding
# ---------------------------------------------------------------------------


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and verify a JWT.

    Raises ``UnauthorizedError`` in all error cases so the caller never
    needs to handle ``JWTError`` or ``ExpiredSignatureError`` directly.

    Args:
        token: The raw JWT string.

    Returns:
        The decoded payload dict (e.g. ``{"sub": "...", "role": "bhw", ...}``).

    Raises:
        UnauthorizedError: Token is missing, malformed, expired, or the
                           signature does not verify.
    """
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[_ALGORITHM],
        )
        return payload
    except ExpiredSignatureError:
        raise UnauthorizedError("Token has expired. Please log in again.")
    except JWTError:
        raise UnauthorizedError("Invalid token. Please log in again.")


# ---------------------------------------------------------------------------
# Token extraction helper (header + cookie fallback)
# ---------------------------------------------------------------------------

# HTTPBearer is used in auto_error=False mode so we can fall back to a cookie
# instead of returning 403 immediately when the header is absent.
_bearer_scheme = HTTPBearer(auto_error=False)


async def _extract_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ],
    access_token: Annotated[str | None, Cookie()] = None,
) -> str:
    """
    Extract the raw JWT string from the request.

    Tries (in order):
      1. ``Authorization: Bearer <token>`` header
      2. ``access_token`` httpOnly cookie

    Raises ``UnauthorizedError`` if neither is present.
    """
    if credentials is not None:
        return credentials.credentials
    if access_token is not None:
        return access_token
    raise UnauthorizedError("Authentication required. Please log in.")


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


async def get_current_user(
    token: Annotated[str, Depends(_extract_token)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """
    FastAPI dependency that resolves the current authenticated user.

    Resolves the JWT, validates the token type, queries the DB for the user,
    and ensures the user is active.  The ``User`` ORM object is returned with
    the ``role`` relationship already loaded (via ``selectinload``) so callers
    can safely access ``current_user.role.name`` in async context.

    Raises:
        UnauthorizedError: Token is invalid/expired, wrong type, or the user
                           does not exist / is deactivated.

    Usage in endpoint::

        @router.get("/me")
        async def me(current_user: CurrentUser):
            return {"email": current_user.email}
    """
    # Import here to avoid circular imports (models import Base which is
    # independent, but importing at module level alongside TYPE_CHECKING
    # causes issues with SQLAlchemy's mapper configuration order).
    from app.models.user import User as UserModel

    payload = decode_token(token)

    # Enforce access-token type — reject refresh tokens used as access tokens.
    if payload.get("type") != _TOKEN_TYPE_ACCESS:
        raise UnauthorizedError("Invalid token type. An access token is required.")

    subject: str | None = payload.get("sub")
    if not subject:
        raise UnauthorizedError("Token payload is missing the subject claim.")

    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        raise UnauthorizedError("Token contains an invalid user identifier.")

    # Load user with role relationship in one query (avoids lazy-load error in async).
    result = await db.execute(
        select(UserModel)
        .where(UserModel.id == user_id)
        .options(selectinload(UserModel.role))
    )
    user: UserModel | None = result.scalar_one_or_none()

    if user is None:
        raise UnauthorizedError("User account not found.")
    if not user.is_active:
        raise UnauthorizedError("User account is deactivated. Contact your administrator.")

    return user


# Convenience type alias for use in endpoint signatures:
#   async def my_endpoint(current_user: CurrentUser): ...
CurrentUser = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Role-based access control dependency factory
# ---------------------------------------------------------------------------


def require_role(*roles: str) -> Any:
    """
    FastAPI dependency factory that enforces role-based access control.

    Returns a ``Depends(...)`` that first calls ``get_current_user`` to
    authenticate the request and then verifies that the user's role is one
    of the allowed roles.

    Role names must match the ``roles.name`` values seeded in the DB:
      "admin" | "bhw" | "physician" | "admin_staff"

    Args:
        *roles: One or more role name strings that are permitted.

    Returns:
        A FastAPI dependency that resolves to the authenticated ``User``
        object so endpoint functions can optionally receive it.

    Raises:
        UnauthorizedError: If the request is unauthenticated.
        ForbiddenError:    If the user's role is not in the allowed list.

    Usage::

        @router.post("/patients", dependencies=[require_role("bhw", "admin")])
        async def create_patient(current_user: CurrentUser, ...):
            ...

        # Or to also receive the user object:
        AdminOnly = Depends(require_role("admin"))

        @router.delete("/patients/{id}")
        async def delete_patient(current_user: User = AdminOnly, ...):
            ...
    """
    async def _role_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role.name not in roles:
            raise ForbiddenError(
                f"Role '{current_user.role.name}' is not authorized for this action. "
                f"Required: {', '.join(roles)}."
            )
        return current_user

    return Depends(_role_checker)
