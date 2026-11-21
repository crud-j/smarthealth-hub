"""
OTP email body (email_service._build_otp_html / _build_otp_text / subject).

Design: each digit in its own box (like the current sign-in code emails of
big services), plus the code once as plain text so it is easy to copy on a
phone and Gmail can offer its own "Copy code" button. No scripts, images or
remote content. The code never appears in the hidden preview text.
"""

from __future__ import annotations

import re

import pytest

from app.services.email_service import _build_otp_html, _build_otp_text, _otp_subject

CODE = "918341"


def _digit_cells(html: str) -> list[str]:
    return re.findall(r'<td class="otp-digit"[^>]*>\s*(\d)\s*</td>', html)


@pytest.mark.parametrize("purpose", ["login", "password_reset"])
def test_each_digit_has_its_own_box_in_order(purpose):
    assert _digit_cells(_build_otp_html(CODE, purpose)) == list(CODE)


@pytest.mark.parametrize("purpose", ["login", "password_reset"])
def test_code_appears_once_as_copyable_text(purpose):
    html = _build_otp_html(CODE, purpose)
    assert html.count(CODE) == 1
    assert re.search(rf'class="otp-copy"[^>]*>\s*{CODE}\s*<', html)


@pytest.mark.parametrize("purpose", ["login", "password_reset"])
def test_copy_box_says_how_to_copy(purpose):
    """No email can have a real copy button (no JavaScript), so the copyable
    code sits in its own box with a plain instruction right above it, and a
    tap selects the whole code (user-select: all)."""
    html = _build_otp_html(CODE, purpose)
    box = re.search(r'<td class="otp-copy-box"[^>]*>(.*?)</td>', html, re.S)
    assert box is not None
    assert re.search(r"Tap and hold[^<]*to copy", box.group(1))
    copy = re.search(r'class="otp-copy"([^>]*)>', box.group(1))
    assert copy is not None
    assert "user-select:all" in copy.group(1)
    assert "or copy:" not in html


def test_preview_text_does_not_contain_the_code():
    html = _build_otp_html(CODE, "login")
    preheader = re.search(r'<div class="preheader"[^>]*>(.*?)</div>', html, re.S)
    assert preheader is not None
    assert not re.search(r"\d{6}", preheader.group(1))


def test_wording_follows_the_purpose():
    login = _build_otp_html(CODE, "login")
    reset = _build_otp_html(CODE, "password_reset")
    assert "sign-in code" in login and "password reset" not in login.lower()
    assert "password reset code" in reset.lower()
    assert "10 minutes" in login and "10 minutes" in reset


def test_no_scripts_images_or_remote_content():
    html = _build_otp_html(CODE, "login").lower()
    for banned in ("<script", "<img", "http://", "https://", "url("):
        assert banned not in html


def test_plain_text_part_has_the_code():
    text = _build_otp_text(CODE, "login")
    assert CODE in text
    assert "10 minutes" in text


@pytest.mark.parametrize(
    ("purpose", "subject"),
    [
        ("login", f"{CODE} is your SmartHealth Hub sign-in code"),
        ("password_reset", f"{CODE} is your SmartHealth Hub password reset code"),
    ],
)
def test_subject_starts_with_the_code(purpose, subject):
    """The code leads the subject, like Google's and banks' code emails: Android
    then offers a one-tap "Copy" button on the new-mail notification and Gmail
    its "Copy code" button. Approved by the user (2026-11-22) knowing the code
    shows in notification previews; it expires in 10 minutes and is useless
    without the password."""
    assert _otp_subject(CODE, purpose) == subject
