"""
reset_and_seed.py — Wipe all patient-related data and create one sample patient
with a freshly generated health card.

Run from the backend/ directory:
    python scripts/reset_and_seed.py

Prints the signed_url (scan this QR or paste into /verify) and the patient UUID.
"""

from __future__ import annotations

import asyncio
import sys
import os

# Ensure the backend package is importable when run from backend/.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import date

from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.models.patient import Patient
from app.services import qr_service


# ---------------------------------------------------------------------------
# Tables to truncate (order matters — FK children first)
# ---------------------------------------------------------------------------
_TRUNCATE_SQL = """
TRUNCATE TABLE
    card_verifications,
    health_cards,
    immunizations,
    appointments,
    visits,
    medical_history,
    sms_logs,
    audit_logs,
    patients
RESTART IDENTITY CASCADE;
"""


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # ── 1. Wipe all patient-related data ──────────────────────────────
        print("Truncating patient-related tables...")
        await db.execute(text(_TRUNCATE_SQL))
        await db.commit()
        print("Done.")

        # ── 2. Create sample patient ───────────────────────────────────────
        print("\nCreating sample patient...")
        sample = Patient(
            patient_code="BHC-2026-000001",
            first_name="Juan",
            middle_name="Santos",
            last_name="Dela Cruz",
            birth_date=date(1990, 3, 15),
            sex="male",
            address="123 Mabini Street, Brgy. San Jose",
            mobile_number="09171234567",
            is_senior=False,
            is_pwd=False,
            is_pregnant=False,
            is_active=True,
        )
        db.add(sample)
        await db.flush()  # get the generated UUID

        patient_id = str(sample.id)
        print(f"  Patient ID : {patient_id}")
        print(f"  Name       : Juan Santos Dela Cruz")
        print(f"  Code       : BHC-2026-000001")

        # ── 3. Generate health card + QR ───────────────────────────────────
        from app.models.health_card import HealthCard
        from datetime import datetime

        signed_url, _qr_uri = qr_service.encode_qr_payload(patient_id, 1)
        qr_hash = qr_service.hash_qr_url(signed_url)

        card = HealthCard(
            patient_id=sample.id,
            card_number="HC-2026-000001",
            qr_payload_hash=qr_hash,
            card_version=1,
            status="active",
            issued_at=datetime.utcnow(),
            issued_by=None,
        )
        db.add(card)
        await db.commit()

        print(f"\n  Card #     : HC-2026-000001")
        print(f"  Card ver.  : 1")
        print(f"\n  signed_url : {signed_url}")
        print(f"\n  Scan the QR on the health card PDF or open this URL on your phone:")
        print(f"  {signed_url}")
        print("\nDone! Regenerate the health card PDF via Swagger to get the printed QR.")


if __name__ == "__main__":
    asyncio.run(main())
