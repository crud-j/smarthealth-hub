"""Quick one-shot Semaphore SMS test — reads .env directly, no FastAPI needed."""
import asyncio
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

API_KEY     = os.getenv("SEMAPHORE_API_KEY", "")
SENDER_NAME = os.getenv("SEMAPHORE_SENDER_NAME", "Semaphore")
BASE_URL    = os.getenv("SEMAPHORE_BASE_URL", "https://api.semaphore.co/api/v4")
TO_NUMBER   = "09755247821"
MESSAGE     = "SmartHealth Hub test message. Semaphore SMS is working."


async def main() -> None:
    print(f"API key  : {API_KEY[:8]}...{API_KEY[-4:]}")
    print(f"Sender   : {SENDER_NAME}")
    print(f"To       : {TO_NUMBER}")
    print(f"Message  : {MESSAGE}\n")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{BASE_URL}/messages",
            data={
                "apikey":     API_KEY,
                "number":     TO_NUMBER,
                "message":    MESSAGE,
                "sendername": SENDER_NAME,
            },
        )

    print(f"HTTP status : {resp.status_code}")
    print(f"Response    : {resp.text}")

    if resp.is_success:
        print("\nSMS queued successfully.")
    else:
        print("\nSemaphore returned an error -- see response above.")


asyncio.run(main())
