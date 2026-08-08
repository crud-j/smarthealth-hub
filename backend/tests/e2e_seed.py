"""
E2E test data seeder — run before Playwright tests in CI.

Creates deterministic test fixtures with known credentials so Playwright
tests can log in without dynamic data discovery.

Usage:
    python tests/e2e_seed.py

Idempotent — safe to run multiple times (upserts by email/patient_code).

Test credentials (written to stdout at the end for CI log confirmation):
  Admin:   e2e-admin@bhc.local  / E2eAdmin!2026
  BHW:     e2e-bhw@bhc.local    / E2eBhw!2026
  Patient: BHC-E2E-000001 (Juan E2E dela Cruz, DOB 1990-01-15)

OTP: In CI the backend logs the OTP to console (Phase 1 behaviour).
     Playwright tests read the OTP from the backend log via the
     EMAIL_HOST_USER=test@example.com path which prints to stdout.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, timedelta, timezone, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# ---------------------------------------------------------------------------
# Bootstrap settings before importing app modules
# ---------------------------------------------------------------------------

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.user import Role, User  # noqa: E402
from app.models.patient import Patient  # noqa: E402
from app.models.appointment import Appointment  # noqa: E402
from app.models.immunization import Immunization  # noqa: E402
from app.models.health_card import HealthCard  # noqa: E402
from app.services.qr_service import encode_qr_payload  # noqa: E402

# ---------------------------------------------------------------------------
# Test constants (used by Playwright specs)
# ---------------------------------------------------------------------------

E2E_ADMIN_EMAIL = "e2e-admin@bhc.local"
E2E_ADMIN_PASSWORD = "E2eAdmin!2026"
E2E_BHW_EMAIL = "e2e-bhw@bhc.local"
E2E_BHW_PASSWORD = "E2eBhw!2026"

# Fixed UUIDs for deterministic seeding
_ADMIN_ROLE_ID = uuid.UUID("00000001-0000-0000-0000-000000000001")
_BHW_ROLE_ID = uuid.UUID("00000001-0000-0000-0000-000000000002")
_ADMIN_USER_ID = uuid.UUID("00000002-0000-0000-0000-000000000001")
_BHW_USER_ID = uuid.UUID("00000002-0000-0000-0000-000000000002")
_PATIENT_ID = uuid.UUID("00000003-0000-0000-0000-000000000001")
_PATIENT2_ID = uuid.UUID("00000003-0000-0000-0000-000000000002")
_HEALTH_CARD_ID = uuid.UUID("00000004-0000-0000-0000-000000000001")
_APPT_ID = uuid.UUID("00000005-0000-0000-0000-000000000001")


async def seed(db: AsyncSession) -> None:
    """Insert or skip all E2E fixtures."""
    now = datetime.now(tz=timezone.utc)

    # -- Roles ----------------------------------------------------------------
    for role_id, name, permissions in [
        (_ADMIN_ROLE_ID, "admin", {"all": True}),
        (_BHW_ROLE_ID, "bhw", {"patients": ["read", "write"], "appointments": ["read", "write"]}),
    ]:
        existing = await db.get(Role, role_id)
        if existing is None:
            db.add(Role(id=role_id, name=name, permissions=permissions))

    await db.flush()

    # -- Users ----------------------------------------------------------------
    for user_id, email, password, role_id, full_name, mobile in [
        (_ADMIN_USER_ID, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, _ADMIN_ROLE_ID, "E2E Admin", "+639000000001"),
        (_BHW_USER_ID, E2E_BHW_EMAIL, E2E_BHW_PASSWORD, _BHW_ROLE_ID, "E2E BHW", "+639000000002"),
    ]:
        existing = await db.execute(select(User).where(User.email == email))
        user: User | None = existing.scalar_one_or_none()
        if user is None:
            db.add(User(
                id=user_id,
                full_name=full_name,
                email=email,
                mobile_number=mobile,
                password_hash=hash_password(password),
                role_id=role_id,
                is_active=True,
                mfa_enabled=True,
            ))

    await db.flush()

    # -- Patients -------------------------------------------------------------
    existing_p = await db.execute(select(Patient).where(Patient.id == _PATIENT_ID))
    if existing_p.scalar_one_or_none() is None:
        db.add(Patient(
            id=_PATIENT_ID,
            patient_code="BHC-E2E-000001",
            first_name="Juan",
            middle_name="E2E",
            last_name="dela Cruz",
            birth_date=date(1990, 1, 15),
            sex="male",
            civil_status="single",
            mobile_number="+639111111111",
            address="123 Test Street, Marilao, Bulacan",
            is_pwd=False,
            is_senior=False,
            is_pregnant=False,
            is_active=True,
            created_by=_ADMIN_USER_ID,
        ))

    existing_p2 = await db.execute(select(Patient).where(Patient.id == _PATIENT2_ID))
    if existing_p2.scalar_one_or_none() is None:
        db.add(Patient(
            id=_PATIENT2_ID,
            patient_code="BHC-E2E-000002",
            first_name="Maria",
            middle_name="E2E",
            last_name="Santos",
            birth_date=date(1985, 6, 20),
            sex="female",
            civil_status="married",
            mobile_number="+639222222222",
            address="456 Test Ave, Marilao, Bulacan",
            is_pwd=False,
            is_senior=False,
            is_pregnant=False,
            is_active=True,
            created_by=_ADMIN_USER_ID,
        ))

    await db.flush()

    # -- Health card for patient 1 -------------------------------------------
    existing_card = await db.execute(select(HealthCard).where(HealthCard.patient_id == _PATIENT_ID))
    if existing_card.scalar_one_or_none() is None:
        # Generate HMAC-signed QR URL (pointer-only — no PHI in payload)
        _signed_url, _qr_uri = encode_qr_payload(str(_PATIENT_ID), 1)
        # qr_payload_hash stores only the HMAC sig portion
        import hashlib
        import hmac
        sig = hmac.new(
            settings.QR_HMAC_SECRET.encode(),
            f"{_PATIENT_ID}:1".encode(),
            hashlib.sha256,
        ).hexdigest()

        db.add(HealthCard(
            id=_HEALTH_CARD_ID,
            patient_id=_PATIENT_ID,
            card_number="BHC-E2E-HC001",
            qr_payload_hash=sig,
            card_version=1,
            status="active",
            issued_at=now,
            issued_by=_ADMIN_USER_ID,
        ))

    await db.flush()

    # -- Upcoming appointment ------------------------------------------------
    existing_appt = await db.execute(select(Appointment).where(Appointment.id == _APPT_ID))
    if existing_appt.scalar_one_or_none() is None:
        scheduled = now + timedelta(days=3)
        db.add(Appointment(
            id=_APPT_ID,
            patient_id=_PATIENT_ID,
            appointment_type="consultation",
            scheduled_at=scheduled,
            status="pending",
            notes="E2E test appointment",
            created_by=_ADMIN_USER_ID,
        ))

    # -- Immunization record -------------------------------------------------
    existing_imm = await db.execute(
        select(Immunization).where(Immunization.patient_id == _PATIENT_ID)
    )
    if existing_imm.scalar_one_or_none() is None:
        db.add(Immunization(
            patient_id=_PATIENT_ID,
            vaccine_name="BCG",
            dose_number=1,
            date_administered=date(2026, 1, 10),
            next_due_date=date.today() + timedelta(days=5),
            administered_by=_BHW_USER_ID,
            status="completed",
        ))

    await db.commit()


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as db:
        await seed(db)

    await engine.dispose()

    print("=" * 60)
    print("E2E seed complete.")
    print(f"  Admin: {E2E_ADMIN_EMAIL} / {E2E_ADMIN_PASSWORD}")
    print(f"  BHW:   {E2E_BHW_EMAIL} / {E2E_BHW_PASSWORD}")
    print(f"  Patient code: BHC-E2E-000001")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
