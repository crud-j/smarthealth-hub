"""Quick one-shot SMS test — reads .env directly, no FastAPI needed.

Respects SMS_PROVIDER in .env:
  SMS_PROVIDER=textbee    → tests textbee.dev Android-phone gateway (RECOMMENDED)
  SMS_PROVIDER=semaphore  → tests Semaphore v4 API
  SMS_PROVIDER=itexmo     → tests iTExmo broadcast API
  SMS_PROVIDER=philsms    → tests PhilSMS send API

To override the destination number without editing this file, set TEST_PHONE_NUMBER
in .env (any Philippine format is accepted — the script normalises it):
  TEST_PHONE_NUMBER=09171234567   # local format
  TEST_PHONE_NUMBER=639171234567  # international, no +
  TEST_PHONE_NUMBER=+639171234567 # E.164 with +
"""
import asyncio
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

PROVIDER    = os.getenv("SMS_PROVIDER", "semaphore").lower()
# Read destination from env first; fall back to a hardcoded test number.
TO_NUMBER   = os.getenv("TEST_PHONE_NUMBER", "09755247821")
MESSAGE     = "SmartHealth Hub test message. SMS is working."


def _normalize_intl(number: str) -> str:
    """Convert any PH number variant to 639XXXXXXXXX (no +, no leading zero)."""
    n = number.strip().replace(" ", "").replace("-", "").lstrip("+")
    if n.startswith("63") and len(n) == 12:
        return n  # already international
    if n.startswith("0") and len(n) == 11:
        return "63" + n[1:]
    if n.startswith("9") and len(n) == 10:
        return "63" + n
    return n  # return as-is if format is unrecognised


async def test_textbee() -> None:
    api_key   = os.getenv("TEXTBEE_API_KEY", "")
    device_id = os.getenv("TEXTBEE_DEVICE_ID", "")
    base_url  = os.getenv("TEXTBEE_BASE_URL", "https://api.textbee.dev/api/v1").rstrip("/")

    if not api_key:
        print("ERROR: TEXTBEE_API_KEY is not set in backend/.env")
        print("  Sign up at https://textbee.dev, install the Android app, and copy your API key.")
        return

    # textbee expects E.164 with leading '+': +639XXXXXXXXX
    raw = _normalize_intl(TO_NUMBER)  # → 639XXXXXXXXX
    number = f"+{raw}" if not raw.startswith("+") else raw

    if device_id:
        send_url = f"{base_url}/gateway/devices/{device_id}/send-sms"
    else:
        send_url = f"{base_url}/gateway/send-sms"

    print(f"Provider    : textbee.dev")
    print(f"Endpoint    : {send_url}")
    print(f"API key     : {api_key[:8]}...{api_key[-4:]}")
    print(f"Device ID   : {device_id or '(auto-select)'}")
    print(f"To (raw)    : {TO_NUMBER}")
    print(f"To (E.164)  : {number}")
    print(f"Message     : {MESSAGE}\n")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            send_url,
            json={"recipients": [number], "message": MESSAGE},
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
        )

    print(f"HTTP status : {resp.status_code}")
    print(f"Response    : {resp.text}")

    if resp.is_success:
        print("\nSMS accepted by textbee. Check your phone — it should send within seconds.")
    else:
        print("\ntextbee returned an error — see response above.")
        if resp.status_code == 401:
            print("  [401] TEXTBEE_API_KEY is invalid or expired. Check the dashboard.")
        elif resp.status_code == 404:
            print("  [404] Device not found. Check TEXTBEE_DEVICE_ID, or leave it blank for auto-select.")


async def test_semaphore() -> None:
    api_key     = os.getenv("SEMAPHORE_API_KEY", "")
    sender_name = os.getenv("SEMAPHORE_SENDER_NAME", "Semaphore")
    base_url    = os.getenv("SEMAPHORE_BASE_URL", "https://api.semaphore.co/api/v4")

    if not api_key:
        print("ERROR: SEMAPHORE_API_KEY is not set in backend/.env")
        print()
        print("Steps to fix:")
        print("  1. Go to https://semaphore.co and log in (or sign up — it's free).")
        print("  2. Click your name in the top-right corner → API.")
        print("  3. Copy the API key shown on that page.")
        print("  4. Open backend/.env and paste it as:")
        print("       SEMAPHORE_API_KEY=<paste-key-here>")
        print("  5. Re-run this script: python backend/scripts/test_sms.py")
        return

    # Semaphore expects E.164 international format WITHOUT the leading "+".
    # 09171234567 → 639171234567,  +639171234567 → 639171234567
    number = _normalize_intl(TO_NUMBER)

    print(f"Provider       : Semaphore")
    print(f"Endpoint       : {base_url}/messages")
    print(f"API key        : {api_key[:8]}...{api_key[-4:]}")
    print(f"Sender name    : {sender_name}")
    print(f"To (raw)       : {TO_NUMBER}")
    print(f"To (normalised): {number}  (must be 639XXXXXXXXX, no leading +)")
    print(f"Message        : {MESSAGE}\n")

    # Semaphore v4 API — POST application/json
    # Auth:   apikey field in JSON body (NOT an Authorization header)
    # Number: 639XXXXXXXXX — E.164 without the leading "+"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{base_url}/messages",
            json={
                "apikey":     api_key,
                "number":     number,
                "message":    MESSAGE,
                "sendername": sender_name,
            },
            headers={
                "Accept":       "application/json",
                "Content-Type": "application/json",
            },
        )

    print(f"HTTP status : {resp.status_code}")
    print(f"Response    : {resp.text}")

    resp_text_lower = resp.text.lower()

    if resp.is_success and "sendername" not in resp_text_lower and "error" not in resp_text_lower:
        print("\nSMS queued successfully.")
        return

    # Detect specific Semaphore error conditions
    if "no active sender name" in resp_text_lower:
        print("\nSemaphore error: No active sender name on this account.")
        print()
        print("You must register a sender name in the Semaphore dashboard before")
        print("any SMS can be sent.  Steps:")
        print("  1. Log in at https://semaphore.co")
        print("  2. Go to: Account (top right) -> Sender Names -> Add Sender Name")
        print("  3. Enter 'Semaphore' (the free default — no fee, instant approval)")
        print("     OR enter your desired name (may require approval from Semaphore)")
        print("  4. Once approved, update SEMAPHORE_SENDER_NAME in backend/.env")
        print("     to match exactly what you registered.")
        print("  5. Re-run this script.")
        return

    if "not valid" in resp_text_lower or "invalid" in resp_text_lower:
        print(f"\nSemaphore rejected the sender name '{sender_name}'.")
        print()
        print("The sender name must match one of your registered sender names.")
        print("Steps:")
        print("  1. Log in at https://semaphore.co")
        print("  2. Go to: Account (top right) -> Sender Names")
        print("  3. Note the exact name of your approved sender name.")
        print("  4. Update SEMAPHORE_SENDER_NAME in backend/.env to match exactly.")
        print("  5. Re-run this script.")
        return

    if not resp.is_success:
        print("\nSemaphore returned an error -- see response above.")
        if resp.status_code in (401, 403):
            print("  Check that SEMAPHORE_API_KEY in backend/.env is correct.")
        return

    # HTTP 200 but response body contains an error field
    print("\nSemaphore returned HTTP 200 but the response contains an error.")
    print("See the response body above for details.")


async def test_itexmo() -> None:
    api_key = os.getenv("ITEXMO_API_KEY", "")
    email   = os.getenv("ITEXMO_EMAIL", "")
    base_url = os.getenv("ITEXMO_BASE_URL", "https://api.itexmo.com/api")

    print(f"Provider    : iTExmo")
    print(f"API key     : {api_key[:8]}...{api_key[-4:]}" if api_key else "API key     : (not set)")
    print(f"Email       : {email}")
    print(f"To          : {TO_NUMBER}")
    print(f"Message     : {MESSAGE}\n")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{base_url}/broadcast",
            data={
                "api_key":        api_key,
                "email":          email,
                "recipients":     TO_NUMBER,
                "message":        MESSAGE,
                "sending_method": "0",
            },
        )

    print(f"HTTP status : {resp.status_code}")
    print(f"Response    : {resp.text}")
    print("\nSMS queued successfully." if resp.is_success else "\niTExmo returned an error -- see response above.")


async def test_philsms() -> None:
    token     = os.getenv("PHILSMS_TOKEN", "")
    sender_id = os.getenv("PHILSMS_SENDER_ID", "PhilSMS")
    # Fix: correct default host is dashboard.philsms.com, NOT app.philsms.com.
    # Fix: strip trailing slash — the service appends "/send", so a trailing slash
    #      would produce a double-slash URL (e.g. ".../v3/sms//send").
    base_url  = os.getenv(
        "PHILSMS_BASE_URL",
        "https://dashboard.philsms.com/api/v3/sms",  # correct host + path
    ).rstrip("/")

    # Fix 1 — Mobile number format:
    #   PhilSMS requires 639XXXXXXXXX (E.164 without the leading "+").
    #   _normalize_intl() handles 09XX..., +639XX..., and 639XX... inputs.
    number = _normalize_intl(TO_NUMBER)

    print(f"Provider     : PhilSMS")
    print(f"Endpoint     : {base_url}/send")
    print(f"Token        : {token[:8]}...{token[-4:]}" if token else "Token        : (not set)")
    print(f"Sender ID    : {sender_id}")
    print(f"To (raw)     : {TO_NUMBER}")
    print(f"To (normalised): {number}  (must be 639XXXXXXXXX, no leading +)")
    print(f"Message      : {MESSAGE}\n")

    # Fix 2 — Authorization: header MUST be "Bearer <token>" (OAuth 2.0).
    #          Sending the raw token without the "Bearer " prefix causes HTTP 401.
    # Fix 4 — Content-Type: application/json must be set explicitly for JSON bodies.
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{base_url}/send",
            json={
                "recipient": number,
                "sender_id": sender_id,  # Fix 3: must match a registered sender ID in PhilSMS dashboard
                "type": "plain",
                "message": MESSAGE,
            },
            headers={
                "Authorization": f"Bearer {token.strip()}",  # Fix 2: "Bearer " prefix is mandatory
                "Accept": "application/json",
                "Content-Type": "application/json",  # Fix 4: explicit Content-Type
            },
        )

    body = resp.text.encode("ascii", errors="replace").decode("ascii")
    print(f"HTTP status  : {resp.status_code}")
    print(f"Response     : {body}")

    if not resp.is_success:
        print("\nPhilSMS returned an HTTP error -- see response above.")
        if resp.status_code == 401:
            print("  [401] check PHILSMS_TOKEN -- ensure the Bearer token is correct and not expired.")
        elif resp.status_code == 422:
            print("  [422] payload validation failed -- check recipient number format (must be 639XXXXXXXXX).")
        elif resp.status_code == 404:
            print("  [404] endpoint not found or sender ID unauthorized.")
            print("        - Verify PHILSMS_BASE_URL in .env (should be https://dashboard.philsms.com/api/v3/sms).")
            print("        - Register the sender ID in the PhilSMS dashboard under Settings -> Sender IDs.")
        return
    try:
        data = resp.json()
        if data.get("status") == "error":
            print(f"\nPhilSMS API error: {data.get('message', body)}")
        else:
            print("\nSMS queued successfully.")
    except Exception:
        print("\nSMS queued successfully.")


async def main() -> None:
    runners = {
        "textbee":   test_textbee,
        "semaphore": test_semaphore,
        "itexmo":    test_itexmo,
        "philsms":   test_philsms,
    }
    runner = runners.get(PROVIDER)
    if runner is None:
        print(f"Unknown SMS_PROVIDER '{PROVIDER}'. Valid: textbee, semaphore, itexmo, philsms")
        return
    await runner()


asyncio.run(main())
