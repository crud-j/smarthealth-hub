"""
Email service — Gmail SMTP OTP dispatch for SmartHealth Hub MFA.

Sends the 6-digit OTP via Gmail using an App Password (not the account
password). The SMTP call is synchronous (smtplib) and is offloaded to a
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
# Templates (Plain Text & HTML)
# ---------------------------------------------------------------------------


def _build_otp_text(otp_code: str, purpose: str) -> str:
    """Return a plain text fallback email body for non-HTML clients."""
    action = "Password Reset" if purpose == "password_reset" else "Account Login"
    return f"""SmartHealth Hub — Verification Code

Your authentication code for {action} is: {otp_code}

This code is valid for 10 minutes. For security reasons, do not share this code with anyone.

If you did not request this verification code, please ignore this email or contact your Barangay Health Center administrator immediately.

---
SmartHealth Hub — Barangay Health Center Management
This is an automated system message. Please do not reply to this email.
"""


def _build_otp_html(otp_code: str, purpose: str) -> str:
    """Return a responsive, professionally styled HTML email body containing the OTP."""
    action_title = (
        "Password Reset Request" if purpose == "password_reset" else "Identity Verification"
    )
    action_desc = (
        "reset your account password" if purpose == "password_reset" else "sign in to your account"
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>SmartHealth Hub — Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- Canvas Outer Container -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Email Card -->
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; border-collapse: separate; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">

          <!-- Header Banner -->
          <tr>
            <td style="background-color: #0f766e; background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 32px 32px 28px; text-align: center;">
              <table role="presentation" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: rgba(255, 255, 255, 0.15); border-radius: 12px; padding: 8px 14px; text-align: center;">
                    <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; vertical-align: middle;">
                      &#10010; SmartHealth Hub
                    </span>
                  </td>
                </tr>
              </table>
              <p style="color: #ccfbf1; font-size: 13px; font-weight: 500; margin: 12px 0 0 0; letter-spacing: 0.2px;">
                Barangay Health Center Portal
              </p>
            </td>
          </tr>

          <!-- Primary Body -->
          <tr>
            <td style="padding: 36px 32px 28px;">
              <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #0f172a; text-align: center;">
                {action_title}
              </h1>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569; text-align: center;">
                Use the verification code below to {action_desc}. This code is valid for <strong>10 minutes</strong>.
              </p>

              <!-- OTP Container -->
              <div style="margin: 28px 0; text-align: center;">
                <div style="display: inline-block; background-color: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; padding: 18px 36px;">
                  <span style="font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #15803d; margin-right: -12px; text-align: center; display: block;">
                    {otp_code}
                  </span>
                </div>
              </div>

              <!-- Security Callout Box -->
              <table role="presentation" width="100%" style="background-color: #fffbe0; border-left: 4px solid #f59e0b; border-radius: 6px; margin: 24px 0 16px;">
                <tr>
                  <td style="padding: 12px 16px;">
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #b45309;">
                      <strong>Security Notice:</strong> Never share this code with anyone, including health center staff or administrators.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">
                If you did not make this request, you can safely ignore this email or contact your portal system administrator.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="border-top: 1px solid #f1f5f9;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #64748b;">
                SmartHealth Hub System
              </p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">
                This is an automated operational notification. Please do not reply directly to this email message.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Internal Sync Sender (Runs in Thread Pool)
# ---------------------------------------------------------------------------


def _send_email_sync(to_address: str, subject: str, text_body: str, html_body: str) -> None:
    """
    Send dual-part (plain text + HTML) email via Gmail SMTP (STARTTLS on port 587).

    Runs synchronously — always call via asyncio.to_thread to avoid blocking
    the event loop.

    Raises:
        smtplib.SMTPException: On any SMTP-layer failure.
        OSError: On network connectivity or timeout issues.
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_HOST_USER}>"
    msg["To"] = to_address

    # Attach Plain Text first, then HTML (RFC 2046 standard requirement)
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=10) as smtp:
        smtp.ehlo()
        if settings.EMAIL_USE_TLS:
            smtp.starttls()
            smtp.ehlo()

        app_password = settings.EMAIL_HOST_PASSWORD.replace(" ", "")
        smtp.login(settings.EMAIL_HOST_USER, app_password)
        smtp.sendmail(settings.EMAIL_HOST_USER, to_address, msg.as_string())


# ---------------------------------------------------------------------------
# Public Async Interface
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
            to_address: Recipient email address.
            otp_code:   Plain-text 6-digit OTP string.
            purpose:    'login' or 'password_reset' — customizes email body/subject.

        Returns:
            True if dispatched successfully, False otherwise.
        """
        if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
            logger.warning(
                "EMAIL_HOST_USER or EMAIL_HOST_PASSWORD missing — "
                "OTP printed to console (dev mode).",
                extra={"to_address": to_address, "otp_code": otp_code, "purpose": purpose},
            )
            return False

        subject = (
            "SmartHealth Hub — Password Reset Code"
            if purpose == "password_reset"
            else "SmartHealth Hub — Your Verification Code"
        )

        text_body = _build_otp_text(otp_code, purpose)
        html_body = _build_otp_html(otp_code, purpose)

        try:
            await asyncio.to_thread(_send_email_sync, to_address, subject, text_body, html_body)
            logger.info(
                "OTP email sent successfully",
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
                    "otp_code": otp_code,
                },
            )
            return False


# Module-level singleton instance
email_service = EmailService()
