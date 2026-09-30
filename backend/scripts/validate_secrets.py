#!/usr/bin/env python3
"""
Validate required SmartHealth Hub secrets before deployment.

Usage:
    python scripts/validate_secrets.py            # development check
    python scripts/validate_secrets.py --strict   # production gate (fails if not production env)

Exit code 0 = all checks pass. Exit code 1 = one or more checks failed.
"""
from __future__ import annotations

import argparse
import base64
import sys

# ── ANSI colors ────────────────────────────────────────────────────────────────
GREEN  = "\033[0;32m"
RED    = "\033[0;31m"
YELLOW = "\033[1;33m"
BOLD   = "\033[1m"
NC     = "\033[0m"


def _ok(label: str, detail: str = "") -> None:
    suffix = f"  ({detail})" if detail else ""
    print(f"  {GREEN}OK{NC} {label}{suffix}")


def _fail(label: str, detail: str = "") -> None:
    suffix = f"  -- {detail}" if detail else ""
    print(f"  {RED}FAIL{NC} {label}{suffix}", file=sys.stderr)


def _warn(label: str, detail: str = "") -> None:
    suffix = f"  -- {detail}" if detail else ""
    print(f"  {YELLOW}WARN{NC} {label}{suffix}")


def check_jwt_secret(value: str) -> tuple[bool, str]:
    """
    Validate JWT_SECRET_KEY is present and meets minimum length.

    Args:
        value: The raw JWT_SECRET_KEY string from settings.

    Returns:
        A (passed, detail) tuple where ``passed`` is True on success.
    """
    if not value:
        return False, "JWT_SECRET_KEY is not set"
    if len(value) < 32:
        return False, f"JWT_SECRET_KEY is only {len(value)} chars (minimum 32)"
    return True, f"{len(value)} chars"


def check_encryption_key(value: str) -> tuple[bool, str]:
    """
    Validate ENCRYPTION_KEY is present, valid base64, and decodes to 32 bytes.

    The encryption utility (``app/utils/encryption.py``) expects a base64-encoded
    32-byte AES-256-GCM key stored in this field.  This function mirrors the same
    validation logic so the check can run without importing the full app.

    Args:
        value: The raw ENCRYPTION_KEY string from settings.

    Returns:
        A (passed, detail) tuple where ``passed`` is True on success.
    """
    if not value:
        return False, "ENCRYPTION_KEY is not set"
    try:
        decoded = base64.b64decode(value)
    except Exception as exc:
        return False, f"ENCRYPTION_KEY is not valid base64: {exc}"
    if len(decoded) != 32:
        return False, (
            f"ENCRYPTION_KEY decodes to {len(decoded)} bytes "
            f"(must be exactly 32 for AES-256-GCM)"
        )
    return True, "valid base64, 32-byte AES-256-GCM key"


def check_sms_provider(
    provider: str,
    semaphore: str,
    itexmo: str,
    philsms: str,
) -> tuple[bool | None, str]:
    """
    Validate that the active SMS provider has a corresponding API key.

    Returns a tri-state:
      True  — correct provider key is present
      False — provider key for the selected provider is missing
      None  — no provider keys at all (warn-only, treated as optional in dev)

    Args:
        provider:  The SMS_PROVIDER setting value (e.g. "semaphore").
        semaphore: SEMAPHORE_API_KEY value.
        itexmo:    ITEXMO_API_KEY value.
        philsms:   PHILSMS_TOKEN value.

    Returns:
        A (result, detail) tuple.
    """
    active_key = {"semaphore": semaphore, "itexmo": itexmo, "philsms": philsms}.get(
        provider, ""
    )
    if not active_key:
        if not any([semaphore, itexmo, philsms]):
            return None, (
                "No SMS provider key is set "
                "(SEMAPHORE_API_KEY / ITEXMO_API_KEY / PHILSMS_TOKEN)"
            )
        return False, f"SMS_PROVIDER={provider!r} but its key is empty"
    return True, f"SMS_PROVIDER={provider!r}, key present"


def check_email(host_user: str, host_password: str) -> tuple[bool | None, str]:
    """
    Validate Gmail SMTP credentials used for MFA OTP emails.

    Returns a tri-state:
      True  — both EMAIL_HOST_USER and EMAIL_HOST_PASSWORD are set
      False — exactly one is set (misconfigured)
      None  — neither is set (OTP emails disabled — warn-only in dev)

    Args:
        host_user:     EMAIL_HOST_USER value (Gmail address).
        host_password: EMAIL_HOST_PASSWORD value (Gmail App Password).

    Returns:
        A (result, detail) tuple.
    """
    if not host_user and not host_password:
        return None, "EMAIL_HOST_USER / EMAIL_HOST_PASSWORD not set (OTP emails disabled)"
    if host_user and not host_password:
        return False, "EMAIL_HOST_USER is set but EMAIL_HOST_PASSWORD is empty"
    if not host_user and host_password:
        return False, "EMAIL_HOST_PASSWORD is set but EMAIL_HOST_USER is empty"
    return True, f"Gmail SMTP configured for {host_user}"


def main() -> int:
    """
    Run all secret validation checks and print a summary.

    Returns:
        0 if all checks pass, 1 if any check fails.
    """
    parser = argparse.ArgumentParser(description="Validate SmartHealth Hub secrets")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail if ENVIRONMENT is not 'production' (use as pre-deploy gate)",
    )
    args = parser.parse_args()

    # Import settings after arg parse so --help works without a valid .env
    try:
        from app.core.config import settings  # noqa: PLC0415
    except Exception as exc:
        print(f"{RED}ERROR: Could not import settings: {exc}{NC}", file=sys.stderr)
        print(
            "  Ensure you are running from backend/ with .env present.",
            file=sys.stderr,
        )
        return 1

    print(f"\n{BOLD}SmartHealth Hub -- Secrets Validation{NC}")
    print(f"  Environment : {BOLD}{settings.ENVIRONMENT}{NC}")
    print("=" * 48)

    failures: int = 0

    # ── 1. JWT_SECRET_KEY ──────────────────────────────────────────────────────
    ok, detail = check_jwt_secret(settings.JWT_SECRET_KEY)
    if ok:
        _ok("JWT_SECRET_KEY", detail)
    else:
        _fail("JWT_SECRET_KEY", detail)
        failures += 1

    # ── 2. ENCRYPTION_KEY ──────────────────────────────────────────────────────
    # Encrypts: medical_history.notes, visits.diagnosis, visits.treatment_notes
    ok2, detail2 = check_encryption_key(settings.ENCRYPTION_KEY)
    if ok2:
        _ok("ENCRYPTION_KEY", detail2)
    else:
        _fail("ENCRYPTION_KEY", detail2)
        failures += 1

    # ── 3. SMS provider ────────────────────────────────────────────────────────
    sms_result, sms_detail = check_sms_provider(
        provider=getattr(settings, "SMS_PROVIDER", "semaphore"),
        semaphore=getattr(settings, "SEMAPHORE_API_KEY", ""),
        itexmo=getattr(settings, "ITEXMO_API_KEY", ""),
        philsms=getattr(settings, "PHILSMS_TOKEN", ""),
    )
    if sms_result is True:
        _ok("SMS provider key", sms_detail)
    elif sms_result is False:
        _fail("SMS provider key", sms_detail)
        failures += 1
    else:
        _warn("SMS provider key", sms_detail)  # optional in dev

    # ── 4. Email / Gmail SMTP ──────────────────────────────────────────────────
    email_result, email_detail = check_email(
        host_user=getattr(settings, "EMAIL_HOST_USER", ""),
        host_password=getattr(settings, "EMAIL_HOST_PASSWORD", ""),
    )
    if email_result is True:
        _ok("Gmail SMTP", email_detail)
    elif email_result is False:
        _fail("Gmail SMTP", email_detail)
        failures += 1
    else:
        _warn("Gmail SMTP", email_detail)  # not set -> OTP emails disabled

    # ── 5. ADMIN_ALERT_PHONE (optional but recommended) ────────────────────────
    alert_phone: str = getattr(settings, "ADMIN_ALERT_PHONE", "")
    if alert_phone:
        _ok("ADMIN_ALERT_PHONE", alert_phone[:5] + "***")
    else:
        _warn("ADMIN_ALERT_PHONE", "not set -- admin SMS alerts disabled")

    # ── 6. Strict mode: must be production ────────────────────────────────────
    if args.strict:
        print("\n  [strict] Checking ENVIRONMENT == 'production'...")
        if settings.ENVIRONMENT != "production":
            _fail(
                "ENVIRONMENT",
                f"is {settings.ENVIRONMENT!r} -- must be 'production' for --strict mode",
            )
            failures += 1
        else:
            _ok("ENVIRONMENT", "production")

    # ── Summary ────────────────────────────────────────────────────────────────
    print("=" * 48)
    if failures == 0:
        print(f"  {GREEN}{BOLD}All checks passed.{NC}\n")
        return 0
    else:
        print(f"  {RED}{BOLD}{failures} check(s) failed.{NC}\n", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
