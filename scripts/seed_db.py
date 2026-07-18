#!/usr/bin/env python3
"""
Seed script for SmartHealth Hub — local development data.

Populates:
  - 4 roles (admin, bhw, physician, admin_staff)
  - 1 Admin user + 1 BHW user
  - 8 realistic Filipino patients with varied demographics
  - Medical history records for 3 patients
  - Immunization records for 4 patients
  - Upcoming appointments for 3 patients

Usage:
  # From the backend/ directory (recommended — ensures app package is importable):
  cd backend && python ../scripts/seed_db.py

  # From the repo root (also works — script adjusts sys.path):
  python scripts/seed_db.py

The script is idempotent: running it multiple times will not duplicate data.
Records are identified by a stable natural key (email for users,
patient_code for patients, name for roles) and skipped if they already exist.

Security note: the admin password below is intentionally obvious for local
development only.  Change it before deploying to any shared or production
environment.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Make the backend package importable regardless of the working directory.
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parent.parent
_BACKEND_DIR = _REPO_ROOT / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# ---------------------------------------------------------------------------
# Imports that require the backend package on sys.path
# ---------------------------------------------------------------------------
from passlib.hash import argon2  # noqa: E402
from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

# Try to load DATABASE_URL from the app settings (.env file); fall back to
# environment variable so the script stays usable outside the venv.
try:
    from app.core.config import settings as _settings  # noqa: E402

    DATABASE_URL: str = _settings.DATABASE_URL
except ImportError:
    DATABASE_URL = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://shh_admin:SmartHealthHub@localhost:5433/smarthealthhub",
    )

# ---------------------------------------------------------------------------
# SQLAlchemy engine & session
# ---------------------------------------------------------------------------
_engine = create_async_engine(DATABASE_URL, echo=False)
_SessionLocal = async_sessionmaker(
    bind=_engine, class_=AsyncSession, expire_on_commit=False
)

# ---------------------------------------------------------------------------
# Seed data definitions
# ---------------------------------------------------------------------------

ROLES: list[dict] = [
    {
        "name": "admin",
        "permissions": {
            "patients": ["read", "write", "delete"],
            "users": ["read", "write", "delete"],
            "medical_history": ["read", "write", "delete"],
            "immunizations": ["read", "write", "delete"],
            "appointments": ["read", "write", "delete"],
            "visits": ["read", "write", "delete"],
            "health_cards": ["read", "write", "delete"],
            "sms": ["read", "write"],
            "analytics": ["read"],
            "audit_logs": ["read"],
        },
    },
    {
        "name": "bhw",
        "permissions": {
            "patients": ["read", "write"],
            "health_cards": ["read", "write"],
            "appointments": ["read", "write"],
            "immunizations": ["read", "write"],
            "sms": ["read"],
            "analytics": ["read"],
        },
    },
    {
        "name": "physician",
        "permissions": {
            "patients": ["read", "write"],
            "medical_history": ["read", "write"],
            "immunizations": ["read", "write"],
            "visits": ["read", "write"],
            "appointments": ["read", "write"],
            "health_cards": ["read"],
            "analytics": ["read"],
        },
    },
    {
        "name": "admin_staff",
        "permissions": {
            "patients": ["read"],
            "appointments": ["read"],
            "analytics": ["read"],
        },
    },
]

# Plaintext passwords (local dev only — CHANGE before deploying)
# admin123! hashed with Argon2
USERS: list[dict] = [
    {
        "full_name": "System Admin",
        "email": "admin@smarthealthhub.local",
        "mobile_number": "+639170000001",
        "plaintext_password": "admin123!",  # local dev only
        "role_name": "admin",
        "mfa_enabled": True,
    },
    {
        "full_name": "Maria Santos",
        "email": "bhw@smarthealthhub.local",
        "mobile_number": "+639170000002",
        "plaintext_password": "Bhw12345!",  # local dev only
        "role_name": "bhw",
        "mfa_enabled": True,
    },
]

# 8 realistic Filipino patients
PATIENTS: list[dict] = [
    {
        "patient_code": "BHC-2026-000001",
        "first_name": "Luzviminda",
        "middle_name": "Reyes",
        "last_name": "Dela Cruz",
        "birth_date": date(1958, 3, 12),  # 68 years old — senior
        "sex": "female",
        "civil_status": "widowed",
        "mobile_number": "+639171000001",
        "address": "Blk 3 Lot 5, Sampaguita St., Brgy. San Isidro, Caloocan City",
        "guardian_name": "Jose Dela Cruz Jr.",
        "guardian_contact": "+639171000099",
        "philhealth_no": "0101-2345-6789",
        "is_pwd": False,
        "is_senior": True,
        "is_pregnant": False,
    },
    {
        "patient_code": "BHC-2026-000002",
        "first_name": "Rolando",
        "middle_name": "Bautista",
        "last_name": "Mendoza",
        "birth_date": date(1985, 7, 22),
        "sex": "male",
        "civil_status": "married",
        "mobile_number": "+639172000002",
        "address": "123 Mabini St., Brgy. Poblacion, Marikina City",
        "guardian_name": None,
        "guardian_contact": None,
        "philhealth_no": "0202-3456-7890",
        "is_pwd": True,  # PWD
        "is_senior": False,
        "is_pregnant": False,
    },
    {
        "patient_code": "BHC-2026-000003",
        "first_name": "Ana Maria",
        "middle_name": "Garcia",
        "last_name": "Reyes",
        "birth_date": date(1998, 11, 5),
        "sex": "female",
        "civil_status": "single",
        "mobile_number": "+639173000003",
        "address": "456 Rizal Ave., Brgy. Holy Spirit, Quezon City",
        "guardian_name": None,
        "guardian_contact": None,
        "philhealth_no": None,
        "is_pwd": False,
        "is_senior": False,
        "is_pregnant": True,  # pregnant
    },
    {
        "patient_code": "BHC-2026-000004",
        "first_name": "Eduardo",
        "middle_name": "Santos",
        "last_name": "Villanueva",
        "birth_date": date(1955, 9, 30),  # 70 years old — senior
        "sex": "male",
        "civil_status": "married",
        "mobile_number": "+639174000004",
        "address": "789 Bonifacio St., Brgy. Bagong Silang, Caloocan City",
        "guardian_name": "Cecilia Villanueva",
        "guardian_contact": "+639174000088",
        "philhealth_no": "0303-4567-8901",
        "is_pwd": False,
        "is_senior": True,
        "is_pregnant": False,
    },
    {
        "patient_code": "BHC-2026-000005",
        "first_name": "Carmelita",
        "middle_name": "Torres",
        "last_name": "Aquino",
        "birth_date": date(1990, 4, 18),
        "sex": "female",
        "civil_status": "married",
        "mobile_number": "+639175000005",
        "address": "22 Katipunan Rd., Brgy. Loyola Heights, Quezon City",
        "guardian_name": None,
        "guardian_contact": None,
        "philhealth_no": "0404-5678-9012",
        "is_pwd": False,
        "is_senior": False,
        "is_pregnant": False,
    },
    {
        "patient_code": "BHC-2026-000006",
        "first_name": "Bienvenido",
        "middle_name": "Cruz",
        "last_name": "Navarro",
        "birth_date": date(2010, 1, 7),  # 16 years old — minor
        "sex": "male",
        "civil_status": "single",
        "mobile_number": None,
        "address": "34 Macapagal Blvd., Brgy. San Antonio, Paranaque City",
        "guardian_name": "Elvira Navarro",
        "guardian_contact": "+639176000006",
        "philhealth_no": None,
        "is_pwd": False,
        "is_senior": False,
        "is_pregnant": False,
    },
    {
        "patient_code": "BHC-2026-000007",
        "first_name": "Rosario",
        "middle_name": "Lopez",
        "last_name": "Fernandez",
        "birth_date": date(1975, 6, 14),
        "sex": "female",
        "civil_status": "separated",
        "mobile_number": "+639177000007",
        "address": "67 Aguinaldo Hwy., Brgy. Salitran, Dasmarinas, Cavite",
        "guardian_name": None,
        "guardian_contact": None,
        "philhealth_no": "0505-6789-0123",
        "is_pwd": True,  # PWD
        "is_senior": False,
        "is_pregnant": False,
    },
    {
        "patient_code": "BHC-2026-000008",
        "first_name": "Dante",
        "middle_name": "Ramos",
        "last_name": "Castillo",
        "birth_date": date(2000, 8, 25),
        "sex": "male",
        "civil_status": "single",
        "mobile_number": "+639178000008",
        "address": "89 Quezon Ave., Brgy. Sacred Heart, Quezon City",
        "guardian_name": None,
        "guardian_contact": None,
        "philhealth_no": None,
        "is_pwd": False,
        "is_senior": False,
        "is_pregnant": False,
    },
]

# Medical history for patients BHC-2026-000001, 000004, 000007
# (3 patients: the two seniors and one PWD adult)
MEDICAL_HISTORIES: list[dict] = [
    {
        "patient_code": "BHC-2026-000001",
        "condition_name": "Hypertension",
        "notes": "Patient has been managing with Amlodipine 5mg daily since 2015.",
        "severity": "moderate",
        "diagnosed_date": date(2015, 6, 1),
    },
    {
        "patient_code": "BHC-2026-000001",
        "condition_name": "Type 2 Diabetes Mellitus",
        "notes": "Controlled with Metformin 500mg BID. HbA1c last checked at 7.2%.",
        "severity": "moderate",
        "diagnosed_date": date(2018, 3, 15),
    },
    {
        "patient_code": "BHC-2026-000004",
        "condition_name": "Chronic Obstructive Pulmonary Disease (COPD)",
        "notes": "Former smoker. Uses Salbutamol inhaler PRN. Spirometry done 2024.",
        "severity": "severe",
        "diagnosed_date": date(2020, 9, 10),
    },
    {
        "patient_code": "BHC-2026-000007",
        "condition_name": "Rheumatoid Arthritis",
        "notes": "Bilateral hand joint involvement. On Hydroxychloroquine 200mg.",
        "severity": "moderate",
        "diagnosed_date": date(2019, 11, 22),
    },
]

# Immunization records for 4 patients
IMMUNIZATIONS: list[dict] = [
    # BHC-2026-000001 (senior) — flu vaccine completed, COVID booster completed
    {
        "patient_code": "BHC-2026-000001",
        "vaccine_name": "Influenza Vaccine",
        "dose_number": 1,
        "date_administered": date(2025, 10, 5),
        "next_due_date": date(2026, 10, 5),
        "status": "completed",
    },
    {
        "patient_code": "BHC-2026-000001",
        "vaccine_name": "COVID-19 Booster (Pfizer-BioNTech)",
        "dose_number": 4,
        "date_administered": date(2025, 9, 20),
        "next_due_date": None,
        "status": "completed",
    },
    # BHC-2026-000003 (pregnant) — Hepatitis B and Tetanus
    {
        "patient_code": "BHC-2026-000003",
        "vaccine_name": "Hepatitis B Vaccine",
        "dose_number": 1,
        "date_administered": date(2026, 5, 10),
        "next_due_date": date(2026, 6, 10),
        "status": "completed",
    },
    {
        "patient_code": "BHC-2026-000003",
        "vaccine_name": "Hepatitis B Vaccine",
        "dose_number": 2,
        "date_administered": None,
        "next_due_date": date(2026, 8, 1),
        "status": "scheduled",
    },
    {
        "patient_code": "BHC-2026-000003",
        "vaccine_name": "Tetanus Toxoid (TT2)",
        "dose_number": 2,
        "date_administered": None,
        "next_due_date": date(2026, 7, 25),
        "status": "scheduled",
    },
    # BHC-2026-000006 (minor 16y) — routine childhood vaccines
    {
        "patient_code": "BHC-2026-000006",
        "vaccine_name": "MMR (Measles, Mumps, Rubella)",
        "dose_number": 2,
        "date_administered": date(2024, 1, 15),
        "next_due_date": None,
        "status": "completed",
    },
    # BHC-2026-000008 — COVID primary series
    {
        "patient_code": "BHC-2026-000008",
        "vaccine_name": "COVID-19 Primary Series (Sinovac)",
        "dose_number": 2,
        "date_administered": date(2022, 3, 1),
        "next_due_date": None,
        "status": "completed",
    },
    {
        "patient_code": "BHC-2026-000008",
        "vaccine_name": "COVID-19 Booster (Moderna)",
        "dose_number": 3,
        "date_administered": None,
        "next_due_date": date(2026, 8, 15),
        "status": "scheduled",
    },
]

# Upcoming appointments for 3 patients
_NOW = datetime.now(tz=timezone.utc)
APPOINTMENTS: list[dict] = [
    {
        "patient_code": "BHC-2026-000001",
        "appointment_type": "follow_up",
        "scheduled_at": _NOW + timedelta(days=7),
        "status": "confirmed",
        "notes": "Monthly BP monitoring and medication review.",
    },
    {
        "patient_code": "BHC-2026-000003",
        "appointment_type": "prenatal",
        "scheduled_at": _NOW + timedelta(days=14),
        "status": "pending",
        "notes": "Second trimester prenatal checkup — OB-Gyne referral needed.",
    },
    {
        "patient_code": "BHC-2026-000005",
        "appointment_type": "general_checkup",
        "scheduled_at": _NOW + timedelta(days=3),
        "status": "confirmed",
        "notes": "Annual physical examination.",
    },
]


# ---------------------------------------------------------------------------
# Helper — upsert-style insert (check-before-insert for idempotency)
# ---------------------------------------------------------------------------


async def _get_or_create(
    session: AsyncSession,
    table: str,
    where_column: str,
    where_value: object,
    insert_values: dict,
) -> uuid.UUID:
    """
    Return the ``id`` of an existing row or insert a new one.
    Uses a raw-text query so the seed script has no ORM model dependency.
    """
    stmt = text(f"SELECT id FROM {table} WHERE {where_column} = :val")
    result = await session.execute(stmt, {"val": where_value})
    row = result.fetchone()
    if row:
        return row[0]
    new_id = uuid.uuid4()
    insert_values["id"] = new_id
    cols = ", ".join(insert_values.keys())
    placeholders = ", ".join(f":{k}" for k in insert_values.keys())
    await session.execute(
        text(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})"),
        insert_values,
    )
    return new_id


# ---------------------------------------------------------------------------
# Seeding functions
# ---------------------------------------------------------------------------


async def seed_roles(session: AsyncSession) -> dict[str, uuid.UUID]:
    """Insert the 4 RBAC roles; return name → id mapping."""
    import json

    role_ids: dict[str, uuid.UUID] = {}
    for role in ROLES:
        role_id = await _get_or_create(
            session,
            table="roles",
            where_column="name",
            where_value=role["name"],
            insert_values={
                "name": role["name"],
                "permissions": json.dumps(role["permissions"]),
                "created_at": datetime.now(tz=timezone.utc),
            },
        )
        role_ids[role["name"]] = role_id
        print(f"  [roles] {role['name']} → {role_id}")
    return role_ids


async def seed_users(
    session: AsyncSession, role_ids: dict[str, uuid.UUID]
) -> dict[str, uuid.UUID]:
    """Insert seed users; return email → id mapping."""
    user_ids: dict[str, uuid.UUID] = {}
    for u in USERS:
        # Plaintext password: "admin123!" for admin, "bhw123!" for bhw
        # Using Argon2 hashing — bcrypt would also be acceptable but Argon2
        # is the project standard per pyproject.toml (passlib[argon2]).
        pw_hash = argon2.hash(u["plaintext_password"])
        now = datetime.now(tz=timezone.utc)
        user_id = await _get_or_create(
            session,
            table="users",
            where_column="email",
            where_value=u["email"],
            insert_values={
                "full_name": u["full_name"],
                "email": u["email"],
                "mobile_number": u["mobile_number"],
                "password_hash": pw_hash,
                "role_id": role_ids[u["role_name"]],
                "is_active": True,
                "mfa_enabled": u["mfa_enabled"],
                "last_login_at": None,
                "created_at": now,
                "updated_at": now,
            },
        )
        user_ids[u["email"]] = user_id
        print(f"  [users] {u['email']} ({u['role_name']}) → {user_id}")
    return user_ids


async def seed_patients(
    session: AsyncSession, admin_user_id: uuid.UUID
) -> dict[str, uuid.UUID]:
    """Insert 8 seed patients; return patient_code → id mapping."""
    patient_ids: dict[str, uuid.UUID] = {}
    for p in PATIENTS:
        now = datetime.now(tz=timezone.utc)
        patient_id = await _get_or_create(
            session,
            table="patients",
            where_column="patient_code",
            where_value=p["patient_code"],
            insert_values={
                "patient_code": p["patient_code"],
                "first_name": p["first_name"],
                "middle_name": p.get("middle_name"),
                "last_name": p["last_name"],
                "birth_date": p["birth_date"],
                "sex": p["sex"],
                "civil_status": p.get("civil_status"),
                "mobile_number": p.get("mobile_number"),
                "address": p["address"],
                "guardian_name": p.get("guardian_name"),
                "guardian_contact": p.get("guardian_contact"),
                "philhealth_no": p.get("philhealth_no"),
                "is_pwd": p["is_pwd"],
                "is_senior": p["is_senior"],
                "is_pregnant": p["is_pregnant"],
                "is_active": True,
                "created_by": admin_user_id,
                "created_at": now,
                "updated_at": now,
            },
        )
        patient_ids[p["patient_code"]] = patient_id
        print(
            f"  [patients] {p['patient_code']} "
            f"{p['last_name']}, {p['first_name']} → {patient_id}"
        )
    return patient_ids


async def seed_medical_history(
    session: AsyncSession,
    patient_ids: dict[str, uuid.UUID],
    physician_user_id: uuid.UUID | None,
) -> None:
    """Insert medical history records (NOTE: notes field is plaintext here for
    seeding — in production the service layer encrypts before INSERT)."""
    # We use a composite uniqueness check on (patient_id, condition_name)
    for mh in MEDICAL_HISTORIES:
        pid = patient_ids[mh["patient_code"]]
        existing = await session.execute(
            text(
                "SELECT id FROM medical_history "
                "WHERE patient_id = :pid AND condition_name = :cname"
            ),
            {"pid": pid, "cname": mh["condition_name"]},
        )
        if existing.fetchone():
            print(
                f"  [medical_history] skip existing: {mh['patient_code']} / "
                f"{mh['condition_name']}"
            )
            continue
        mh_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO medical_history "
                "(id, patient_id, condition_name, notes, severity, "
                "diagnosed_date, recorded_by, created_at) "
                "VALUES (:id, :patient_id, :condition_name, :notes, "
                ":severity, :diagnosed_date, :recorded_by, :created_at)"
            ),
            {
                "id": mh_id,
                "patient_id": pid,
                "condition_name": mh["condition_name"],
                "notes": mh.get("notes"),
                "severity": mh.get("severity"),
                "diagnosed_date": mh.get("diagnosed_date"),
                "recorded_by": physician_user_id,
                "created_at": datetime.now(tz=timezone.utc),
            },
        )
        print(
            f"  [medical_history] {mh['patient_code']} / "
            f"{mh['condition_name']} → {mh_id}"
        )


async def seed_immunizations(
    session: AsyncSession,
    patient_ids: dict[str, uuid.UUID],
    bhw_user_id: uuid.UUID,
) -> None:
    """Insert immunization records."""
    for imm in IMMUNIZATIONS:
        pid = patient_ids[imm["patient_code"]]
        existing = await session.execute(
            text(
                "SELECT id FROM immunizations "
                "WHERE patient_id = :pid AND vaccine_name = :vname "
                "AND dose_number = :dose"
            ),
            {
                "pid": pid,
                "vname": imm["vaccine_name"],
                "dose": imm["dose_number"],
            },
        )
        if existing.fetchone():
            print(
                f"  [immunizations] skip existing: {imm['patient_code']} / "
                f"{imm['vaccine_name']} dose {imm['dose_number']}"
            )
            continue
        imm_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO immunizations "
                "(id, patient_id, vaccine_name, dose_number, "
                "date_administered, next_due_date, administered_by, "
                "status, created_at) "
                "VALUES (:id, :patient_id, :vaccine_name, :dose_number, "
                ":date_administered, :next_due_date, :administered_by, "
                ":status, :created_at)"
            ),
            {
                "id": imm_id,
                "patient_id": pid,
                "vaccine_name": imm["vaccine_name"],
                "dose_number": imm["dose_number"],
                "date_administered": imm.get("date_administered"),
                "next_due_date": imm.get("next_due_date"),
                "administered_by": bhw_user_id if imm["status"] == "completed" else None,
                "status": imm["status"],
                "created_at": datetime.now(tz=timezone.utc),
            },
        )
        print(
            f"  [immunizations] {imm['patient_code']} / "
            f"{imm['vaccine_name']} dose {imm['dose_number']} → {imm_id}"
        )


async def seed_appointments(
    session: AsyncSession,
    patient_ids: dict[str, uuid.UUID],
    bhw_user_id: uuid.UUID,
) -> None:
    """Insert upcoming appointments."""
    for appt in APPOINTMENTS:
        pid = patient_ids[appt["patient_code"]]
        existing = await session.execute(
            text(
                "SELECT id FROM appointments "
                "WHERE patient_id = :pid AND appointment_type = :atype "
                "AND status NOT IN ('completed', 'cancelled', 'missed')"
            ),
            {"pid": pid, "atype": appt["appointment_type"]},
        )
        if existing.fetchone():
            print(
                f"  [appointments] skip existing open: {appt['patient_code']} / "
                f"{appt['appointment_type']}"
            )
            continue
        appt_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO appointments "
                "(id, patient_id, appointment_type, scheduled_at, "
                "status, notes, created_by, created_at) "
                "VALUES (:id, :patient_id, :appointment_type, :scheduled_at, "
                ":status, :notes, :created_by, :created_at)"
            ),
            {
                "id": appt_id,
                "patient_id": pid,
                "appointment_type": appt["appointment_type"],
                "scheduled_at": appt["scheduled_at"],
                "status": appt["status"],
                "notes": appt.get("notes"),
                "created_by": bhw_user_id,
                "created_at": datetime.now(tz=timezone.utc),
            },
        )
        print(
            f"  [appointments] {appt['patient_code']} / "
            f"{appt['appointment_type']} @ "
            f"{appt['scheduled_at'].strftime('%Y-%m-%d %H:%M')} → {appt_id}"
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    print("\n=== SmartHealth Hub — Database Seed ===\n")
    async with _SessionLocal() as session:
        async with session.begin():
            print("Seeding roles...")
            role_ids = await seed_roles(session)

            print("\nSeeding users...")
            user_ids = await seed_users(session, role_ids)

            admin_id = user_ids["admin@smarthealthhub.local"]
            bhw_id = user_ids["bhw@smarthealthhub.local"]

            print("\nSeeding patients...")
            patient_ids = await seed_patients(session, admin_id)

            print("\nSeeding medical history records...")
            # physician role user doesn't exist yet in seed — use None (recorded_by is nullable)
            await seed_medical_history(session, patient_ids, physician_user_id=None)

            print("\nSeeding immunization records...")
            await seed_immunizations(session, patient_ids, bhw_user_id=bhw_id)

            print("\nSeeding upcoming appointments...")
            await seed_appointments(session, patient_ids, bhw_user_id=bhw_id)

    await _engine.dispose()
    print("\n=== Seed complete ===\n")
    print("Default credentials (local dev only — change before any deployment):")
    print("  Admin  | email: admin@smarthealthhub.local | password: admin123!")
    print("  BHW    | email: bhw@smarthealthhub.local   | password: bhw123!")


if __name__ == "__main__":
    asyncio.run(main())
