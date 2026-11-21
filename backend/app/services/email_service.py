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
import html
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Templates (Plain Text & HTML)
# ---------------------------------------------------------------------------

# Rose palette of the sign-in pages (frontend/web/app/globals.css,
# [data-theme="rose"]: derived from the BHC logo seal).
_ROSE = "#b5343e"
_INK = "#1a0808"
_MUTED = "#7a5252"
_PANEL = "#fdf0eb"
_LINE = "#e5d4cc"
_PAGE = "#f5efe9"
_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
_SERIF = "Georgia, 'Times New Roman', serif"


def _otp_subject(purpose: str) -> str:
    """Email subject. Names the code but never contains it (lock-screen previews)."""
    if purpose == "password_reset":
        return "Your SmartHealth Hub password reset code"
    return "Your SmartHealth Hub sign-in code"


def _otp_wording(purpose: str) -> tuple[str, str, str]:
    """(heading, panel label, what the code is for)."""
    if purpose == "password_reset":
        return (
            "Your password reset code",
            "Password reset code requested",
            "reset your SmartHealth Hub password",
        )
    return (
        "Your sign-in code",
        "Sign-in code requested",
        "finish signing in to SmartHealth Hub",
    )


def _build_otp_text(otp_code: str, purpose: str) -> str:
    """Return a plain text fallback email body for non-HTML clients."""
    heading, _, use = _otp_wording(purpose)
    return f"""{heading}

{otp_code}

Enter this code to {use}. It is valid for 10 minutes.
Never share this code with anyone, including health center staff.

If you did not ask for this code, ignore this email. If it keeps happening,
tell your Barangay Health Center administrator.

---
SmartHealth Hub · Barangay Health Center
Automated message. Please do not reply.
"""


def _digit_boxes(otp_code: str) -> str:
    """One white box per digit. Spacer cells, not margins (Outlook ignores margins)."""
    cells: list[str] = []
    for i, digit in enumerate(html.escape(otp_code)):
        if i:
            cells.append('<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>')
        cells.append(
            f'<td class="otp-digit" align="center" valign="middle" width="44" height="56" '
            f'style="width:44px;height:56px;background-color:#ffffff;border:1px solid {_LINE};'
            f"border-radius:10px;font-family:{_SANS};font-size:30px;font-weight:600;"
            f'color:{_INK};text-align:center;">{digit}</td>'
        )
    return "".join(cells)


def _build_otp_html(otp_code: str, purpose: str) -> str:
    """HTML email: big heading, panel with one box per digit, short notes.

    Inline styles and tables only (email clients drop <style> and flexbox).
    No images, scripts or remote content. The code appears once as plain text
    under the boxes: easy to long-press on a phone, and lets Gmail offer its
    own "Copy code" button. A real copy button is impossible in email (no
    JavaScript).
    """
    heading, label, use = _otp_wording(purpose)
    code = html.escape(otp_code)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <title>{heading}</title>
</head>
<body style="margin:0;padding:0;background-color:{_PAGE};">
  <div class="preheader" style="display:none;max-height:0;overflow:hidden;opacity:0;color:{_PAGE};">Valid for 10 minutes. Never share it with anyone.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_PAGE};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid {_LINE};border-radius:16px;">
          <tr>
            <td style="padding:28px 24px 8px;font-family:{_SANS};">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background-color:{_ROSE};border-radius:8px;color:#ffffff;font-size:16px;font-weight:700;line-height:28px;text-align:center;">&#10010;</td>
                  <td style="padding-left:10px;font-size:14px;font-weight:600;color:{_INK};">SmartHealth Hub</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 0;">
              <h1 style="margin:0;font-family:{_SERIF};font-size:28px;line-height:1.25;font-weight:400;color:{_INK};">{heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_PANEL};border-radius:16px;">
                <tr>
                  <td style="padding:22px 18px 20px;font-family:{_SANS};">
                    <p style="margin:0 0 14px;font-size:15px;color:{_MUTED};">{label}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>{_digit_boxes(otp_code)}</tr>
                    </table>
                    <p style="margin:14px 0 0;font-size:13px;color:{_MUTED};">or copy: <span class="otp-copy" style="font-family:Consolas,Menlo,'Courier New',monospace;font-size:15px;font-weight:600;color:{_INK};letter-spacing:1px;-webkit-user-select:all;user-select:all;">{code}</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 0;font-family:{_SANS};font-size:15px;line-height:1.55;color:{_INK};">
              Enter this code to {use}. It is valid for <strong>10 minutes</strong>.
            </td>
          </tr>
          <tr>
            <td style="padding:12px 24px 0;font-family:{_SANS};font-size:14px;line-height:1.55;color:{_ROSE};">
              <strong>Never share this code</strong> with anyone, including health center staff.
            </td>
          </tr>
          <tr>
            <td style="padding:12px 24px 28px;font-family:{_SANS};font-size:13px;line-height:1.55;color:{_MUTED};">
              Didn't ask for this code? Ignore this email. If it keeps happening, tell your Barangay Health Center administrator.
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:{_SANS};font-size:12px;line-height:1.5;color:{_MUTED};text-align:center;">
          SmartHealth Hub &middot; Barangay Health Center<br>Automated message. Please do not reply.
        </p>
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

        subject = _otp_subject(purpose)

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
