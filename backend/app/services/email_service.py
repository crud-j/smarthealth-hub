"""
Email service — Gmail SMTP OTP dispatch for SmartHealth Hub MFA.

Sends the 6-digit OTP via Gmail using an App Password (not the account
password).  The SMTP call is synchronous (smtplib) and is offloaded to a
thread pool via asyncio.to_thread so it never blocks the FastAPI event loop.

Configuration (set in .env under the Email section):
    EMAIL_HOST_USER     — the Gmail address (e.g. you@gmail.com)
    EMAIL_HOST_PASSWORD — Gmail App Password, spaces allowed
                          (generate at myaccount.google.com/apppasswords)
    EMAIL_FROM_NAME     — display name shown in the From field
    EMAIL_HOST          — default smtp.gmail.com
    EMAIL_PORT          — default 587 (STARTTLS)

Dev mode:
    When EMAIL_HOST_USER is empty the OTP is printed to the console
    (same behaviour as the Phase 1 SMS stub) so local dev works without
    configuring a real Gmail account.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------

def _build_otp_html(otp_code: str, purpose: str) -> str:
    """Return a simple HTML email body containing the OTP."""
    action = "password reset" if purpose == "password_reset" else "login"
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;
                    border:1px solid #e2e8f0;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#0d9488;padding:28px 32px;text-align:center;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;">
              &#x2665; SmartHealth Hub
            </span>
            <p style="color:#ccfbf1;font-size:13px;margin:6px 0 0;">
              Barangay Health Center — Secure Login
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#374151;">
              Your one-time verification code for <strong>{action}</strong>:
            </p>

            <!-- OTP box -->
            <div style="margin:24px 0;text-align:center;">
              <span style="display:inline-block;padding:16px 40px;
                           background:#f0fdf4;border:2px solid #16a34a;
                           border-radius:10px;font-size:36px;font-weight:700;
                           letter-spacing:12px;color:#15803d;">
                {otp_code}
              </span>
            </div>

            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
              This code expires in <strong>10 minutes</strong>.
              Do not share it with anyone.
            </p>
            <p style="margin:0;font-size:13px;color:#6b7280;">
              If you did not request this code, please ignore this email or
              contact your BHC administrator immediately.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f1f5f9;
                     text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              This is an automated message from SmartHealth Hub.
              Please do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Internal sync sender (runs in thread pool)
# ---------------------------------------------------------------------------

def _send_email_sync(to_address: str, subject: str, html_body: str) -> None:
    """
    Send one email via Gmail SMTP (STARTTLS on port 587).

    Runs synchronously — always call via asyncio.to_thread to avoid
    blocking the event loop.

    Raises:
        smtplib.SMTPException: On any SMTP-layer error.
        OSError: On network-level connection failure.
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_HOST_USER}>"
    msg["To"] = to_address

    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT) as smtp:
        smtp.ehlo()
        if settings.EMAIL_USE_TLS:
            smtp.starttls()
            smtp.ehlo()
        # Gmail App Passwords work with or without spaces — strip to be safe.
        app_password = settings.EMAIL_HOST_PASSWORD.replace(" ", "")
        smtp.login(settings.EMAIL_HOST_USER, app_password)
        smtp.sendmail(settings.EMAIL_HOST_USER, to_address, msg.as_string())


# ---------------------------------------------------------------------------
# Public async interface
# ---------------------------------------------------------------------------

class EmailService:
    """Async email sender backed by Gmail SMTP."""

    async def send_otp_email(
        self,
        to_address: str,
        otp_code: str,
        purpose: str = "login",
    ) -> bool:
        """
        Send a 6-digit OTP to ``to_address`` via Gmail.

        Args:
            to_address: Recipient email (staff member's registered email).
            otp_code:   Plain-text 6-digit OTP — never stored after this call.
            purpose:    'login' or 'password_reset' — changes the email subject
                        and body copy.

        Returns:
            True if the email was dispatched successfully, False otherwise.
            Failures are logged but never raised so a transient Gmail outage
            does not break the login flow (the OTP can still be found in the
            server console in dev mode as a fallback).
        """
        if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
            logger.warning(
                "EMAIL_HOST_USER or EMAIL_HOST_PASSWORD not set — "
                "OTP printed to console (dev mode).",
                extra={"to_address": to_address, "otp_code": otp_code, "purpose": purpose},
            )
            return False

        subject = (
            "SmartHealth Hub — Password Reset Code"
            if purpose == "password_reset"
            else "SmartHealth Hub — Your Login Code"
        )
        html_body = _build_otp_html(otp_code, purpose)

        try:
            await asyncio.to_thread(
                _send_email_sync, to_address, subject, html_body
            )
            logger.info(
                "OTP email sent",
                extra={"to_address": to_address, "purpose": purpose},
            )
            return True
        except Exception as exc:
            logger.error(
                "Failed to send OTP email — falling back to console log",
                extra={
                    "to_address": to_address,
                    "purpose": purpose,
                    "error": str(exc),
                    "otp_code": otp_code,  # visible in server log as fallback
                },
            )
            return False


# Module-level singleton — import and reuse across the app.
email_service = EmailService()
