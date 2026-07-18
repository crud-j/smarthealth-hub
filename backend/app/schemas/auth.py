"""
Pydantic v2 schemas for authentication request/response serialization.

All password and OTP fields use ``SecretStr`` so that the raw values are
never accidentally serialized into logs or error messages.

Schema overview:
  LoginRequest           — email + password (step 1 of MFA flow)
  LoginResponse          — signals that OTP has been dispatched
  VerifyOtpRequest       — user_id + 6-digit OTP code (step 2 of MFA flow)
  TokenResponse          — JWT access + refresh tokens returned after OTP success
  ResendOtpRequest       — user_id to re-trigger OTP dispatch
  ForgotPasswordRequest  — email address to initiate password reset
  ResetPasswordRequest   — user_id + reset OTP + new password
  ChangePasswordRequest  — current password + new password (for authenticated users)
  RefreshRequest         — optional body-based refresh token (fallback for non-cookie clients)
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


# ---------------------------------------------------------------------------
# Login (step 1 of MFA flow)
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    """Credential submission — triggers OTP dispatch on success."""

    model_config = ConfigDict(from_attributes=True)

    # Use plain str — email format validation is not needed at login;
    # if the address doesn't match any user the service returns 401.
    # EmailStr rejects reserved TLDs like .local used in dev seeds.
    email: str = Field(
        ...,
        description="Registered staff email address.",
        examples=["admin@smarthealthhub.local"],
    )
    password: SecretStr = Field(
        ...,
        min_length=8,
        description="Account password (never logged or stored in this form).",
    )


class LoginResponse(BaseModel):
    """Returned after successful credential validation; OTP has been dispatched."""

    model_config = ConfigDict(from_attributes=True)

    message: str = Field(
        default="OTP sent to registered mobile number",
        description="Human-readable status message.",
    )
    session_hint: uuid.UUID = Field(
        ...,
        description=(
            "User's UUID — pass this as ``user_id`` to /auth/verify-otp. "
            "This is not a secret; the OTP itself is the second factor."
        ),
    )


# ---------------------------------------------------------------------------
# OTP verification (step 2 of MFA flow)
# ---------------------------------------------------------------------------


class VerifyOtpRequest(BaseModel):
    """OTP code submission — issues JWT tokens on success."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID = Field(
        ...,
        description="UUID returned as ``session_hint`` from /auth/login.",
    )
    otp_code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit numeric OTP sent via SMS.",
        examples=["123456"],
    )


class TokenResponse(BaseModel):
    """JWT pair returned on successful authentication."""

    model_config = ConfigDict(from_attributes=True)

    access_token: str = Field(..., description="Short-lived JWT access token (15 min).")
    refresh_token: str = Field(..., description="Long-lived JWT refresh token (7 days).")
    token_type: str = Field(default="bearer", description="OAuth2 token type.")


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


class LogoutResponse(BaseModel):
    """Confirmation that cookies have been cleared."""

    model_config = ConfigDict(from_attributes=True)

    message: str = Field(default="Logged out successfully")


# ---------------------------------------------------------------------------
# Resend OTP
# ---------------------------------------------------------------------------


class ResendOtpRequest(BaseModel):
    """Re-triggers OTP dispatch for the same login session."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID = Field(
        ...,
        description="UUID returned as ``session_hint`` from /auth/login.",
    )


class ResendOtpResponse(BaseModel):
    """Confirmation that a new OTP has been dispatched."""

    model_config = ConfigDict(from_attributes=True)

    message: str = Field(default="OTP resent to registered mobile number")


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


class RefreshRequest(BaseModel):
    """
    Optional body-based refresh token for non-cookie clients (e.g. Swagger UI).
    If absent, the ``refresh_token`` httpOnly cookie is used instead.
    """

    model_config = ConfigDict(from_attributes=True)

    refresh_token: str | None = Field(
        default=None,
        description="Refresh token (optional — falls back to httpOnly cookie).",
    )


# ---------------------------------------------------------------------------
# Forgot password / reset password
# ---------------------------------------------------------------------------


class ForgotPasswordRequest(BaseModel):
    """Initiates an OTP-based password reset flow."""

    model_config = ConfigDict(from_attributes=True)

    email: str = Field(
        ...,
        description="Email address of the account to reset.",
        examples=["admin@smarthealthhub.local"],
    )


class ForgotPasswordResponse(BaseModel):
    """Confirmation that a reset OTP has been dispatched (always returns 200 to prevent enumeration)."""

    model_config = ConfigDict(from_attributes=True)

    message: str = Field(
        default="If the email is registered, a reset OTP has been sent to the linked mobile number."
    )


class ResetPasswordRequest(BaseModel):
    """Completes the password-reset flow using the OTP dispatched by /auth/forgot-password."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID = Field(..., description="UUID from the forgot-password response context.")
    otp_code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit reset OTP sent via SMS.",
    )
    new_password: SecretStr = Field(
        ...,
        min_length=8,
        description="New password to set.",
    )

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: SecretStr) -> SecretStr:
        """
        Enforce minimum password complexity:
          - At least one uppercase letter
          - At least one digit
        """
        raw = v.get_secret_value()
        if not any(c.isupper() for c in raw):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in raw):
            raise ValueError("Password must contain at least one digit.")
        return v


class ResetPasswordResponse(BaseModel):
    """Confirmation that the password has been changed."""

    model_config = ConfigDict(from_attributes=True)

    message: str = Field(default="Password has been reset successfully. Please log in again.")


# ---------------------------------------------------------------------------
# Change password (authenticated flow)
# ---------------------------------------------------------------------------


class ChangePasswordRequest(BaseModel):
    """Authenticated password change — requires the current password for verification."""

    model_config = ConfigDict(from_attributes=True)

    current_password: SecretStr = Field(..., description="The user's existing password.")
    new_password: SecretStr = Field(
        ...,
        min_length=8,
        description="Desired new password.",
    )

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: SecretStr) -> SecretStr:
        raw = v.get_secret_value()
        if not any(c.isupper() for c in raw):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in raw):
            raise ValueError("Password must contain at least one digit.")
        return v


class ChangePasswordResponse(BaseModel):
    """Confirmation that the password change was applied."""

    model_config = ConfigDict(from_attributes=True)

    message: str = Field(default="Password changed successfully.")
