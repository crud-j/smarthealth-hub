"""
Pydantic v2 schemas for user (staff account) management.

SDP Reference: Section 6.9 — Users & Audit API
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    """Body for POST /users — Admin creates a new staff account."""

    full_name: str
    email: EmailStr
    mobile_number: str
    role_id: uuid.UUID
    send_welcome_sms: bool = True

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("full_name must be at least 2 characters.")
        if len(v) > 120:
            raise ValueError("full_name must be at most 120 characters.")
        return v

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile_number(cls, v: str) -> str:
        import re
        if not re.fullmatch(r"^\+639\d{9}$", v):
            raise ValueError(
                "mobile_number must be in Philippine E.164 format: +639XXXXXXXXX"
            )
        return v


class UserUpdate(BaseModel):
    """Body for PUT /users/{id} — Admin updates a staff account."""

    full_name: str | None = None
    email: EmailStr | None = None
    mobile_number: str | None = None
    role_id: uuid.UUID | None = None
    is_active: bool | None = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("full_name must be at least 2 characters.")
        if len(v) > 120:
            raise ValueError("full_name must be at most 120 characters.")
        return v

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile_number(cls, v: str | None) -> str | None:
        import re
        if v is None:
            return v
        if not re.fullmatch(r"^\+639\d{9}$", v):
            raise ValueError(
                "mobile_number must be in Philippine E.164 format: +639XXXXXXXXX"
            )
        return v


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    """Response shape for a single staff user."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    mobile_number: str
    role: str  # role NAME string, extracted from user.role.name
    is_active: bool
    mfa_enabled: bool
    last_login_at: datetime | None
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def extract_role_name(cls, data: Any) -> Any:
        """
        Extract the role name string from the ORM User object.

        ``User.role`` is loaded via ``lazy="selectin"`` so it is always
        available when a User ORM object is passed.  If a plain dict is passed
        (e.g. from tests), it is returned as-is.
        """
        if isinstance(data, dict):
            return data
        # ORM object — pull the role name from the relationship
        if hasattr(data, "role") and data.role is not None:
            role_name = data.role.name
            # Build a dict so Pydantic can populate all fields uniformly
            return {
                "id": data.id,
                "full_name": data.full_name,
                "email": data.email,
                "mobile_number": data.mobile_number,
                "role": role_name,
                "is_active": data.is_active,
                "mfa_enabled": data.mfa_enabled,
                "last_login_at": data.last_login_at,
                "created_at": data.created_at,
            }
        return data


class RoleItem(BaseModel):
    """A single role entry for the roles list endpoint."""

    id: uuid.UUID
    name: str


class PaginatedUsers(BaseModel):
    """Paginated response for GET /users."""

    items: list[UserResponse]
    total: int
    page: int
    page_size: int
