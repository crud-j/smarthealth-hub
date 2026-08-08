"""
seed_db.py — Rich demo data seeder for SmartHealth Hub.

Populates the database with a realistic set of Barangay Health Center
records so every analytics chart, dashboard panel, and list view has
non-empty data to render during demos and UAT.

Run from the backend/ directory:
    python scripts/seed_db.py

Idempotent — checks for admin@bhc.local before inserting anything. If that
user already exists, the script prints a message and exits without
touching the database (safe to re-run in CI or on a shared dev DB).

Creates:
  - 4 roles (admin, bhw, physician, admin_staff) — upserted by name.
  - 3 users: admin@bhc.local, bhw@bhc.local, physician@bhc.local.
  - 60 patients (mixed sexes/ages/barangays in Marilao, Bulacan; includes
    >=10 seniors, >=5 PWDs, >=5 pregnant patients).
  - 1-3 immunization records per patient (~120 total), with 10 due within
    the next 3-10 days so the "immunizations due this week" counter is
    non-zero.
  - 0-2 medical history entries per patient (encrypted notes).
  - 80 visits spread over the last 3 months (>=15 within the last 7 days).
  - 40 appointments: 15 pending (upcoming), 10 completed, 10 missed,
    5 cancelled.
  - 10 health cards (first 10 patients) with correctly HMAC-signed QR
    payloads (patient_id + card_version only — no PHI).

IMPORTANT — encrypted fields: medical_history.notes, visits.diagnosis, and
visits.treatment_notes are encrypted with app.utils.encryption.encrypt_text
(AES-256-GCM) before being written, matching the encryption contract used
by the rest of the application (see CLAUDE.md §6, §10.6).

IMPORTANT — QR/NFC payloads never contain PHI: health cards are generated
via app.services.qr_service.encode_qr_payload(), which encodes only
patient_id + card_version + HMAC signature.
"""

from __future__ import annotations

import asyncio
import os
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.appointment import Appointment  # noqa: E402
from app.models.health_card import HealthCard  # noqa: E402
from app.models.immunization import Immunization  # noqa: E402
from app.models.medical_history import MedicalHistory  # noqa: E402
from app.models.patient import Patient  # noqa: E402
from app.models.user import Role, User  # noqa: E402
from app.models.visit import Visit  # noqa: E402
from app.services import qr_service  # noqa: E402
from app.utils.encryption import encrypt_text  # noqa: E402

# ---------------------------------------------------------------------------
# Deterministic randomness (reproducible demo data across runs)
# ---------------------------------------------------------------------------

random.seed(20260720)

# ---------------------------------------------------------------------------
# Credentials (printed in the summary; also used to create the accounts)
# ---------------------------------------------------------------------------

ADMIN_EMAIL = "unknownusers8273827@gmail.com"
ADMIN_PASSWORD = "@L03e1t3"
BHW_EMAIL = "bhw@bhc.local"
BHW_PASSWORD = "BhwUser@2026!"
PHYSICIAN_EMAIL = "physician@bhc.local"
PHYSICIAN_PASSWORD = "DocUser@2026!"

# ---------------------------------------------------------------------------
# Name / place pools — used to build realistic Filipino patient records
# ---------------------------------------------------------------------------

MALE_FIRST_NAMES = [
    "Juan", "Jose", "Pedro", "Roberto", "Antonio", "Ramon", "Ricardo",
    "Eduardo", "Fernando", "Miguel", "Carlos", "Rafael", "Manuel",
    "Francisco", "Alfredo", "Danilo", "Rodrigo", "Renato", "Arnel",
    "Bayani", "Nestor", "Romeo", "Efren", "Leonardo", "Marlon",
]

FEMALE_FIRST_NAMES = [
    "Maria", "Cristina", "Ana", "Rosario", "Teresita", "Corazon",
    "Josefina", "Remedios", "Angelica", "Perla", "Luz", "Erlinda",
    "Divina", "Gloria", "Marites", "Lourdes", "Estrella", "Carmela",
    "Jasmin", "Susana", "Grace", "Leonora", "Imelda", "Precious",
]

MIDDLE_NAMES = [
    "Santos", "Reyes", "Cruz", "Bautista", "Ramos", "Garcia", "Torres",
    "Flores", "Mendoza", "Castillo",
]

SURNAMES = [
    "Dela Cruz", "Santos", "Reyes", "Garcia", "Torres", "Ramos", "Flores",
    "Mendoza", "Bautista", "Castillo", "Villanueva", "Aquino",
    "Del Rosario", "Aguilar", "Pascual", "Marquez", "Gonzales", "Domingo",
    "Manalo", "Navarro",
]

BARANGAYS = [
    "Abangan Norte", "Abangan Sur", "Ibayo", "Lambakin", "Loma de Gato",
    "Nagbalon", "Patubig", "Poblacion I", "Poblacion II", "Prenza I",
    "Prenza II", "Saog", "Santa Rosa I", "Santa Rosa II", "Tabing Ilog",
]

STREETS = [
    "Mabini St.", "Rizal St.", "Bonifacio St.", "Sampaguita St.",
    "Ilang-Ilang St.", "Malaya St.", "Kalayaan Ave.", "Sto. Nino St.",
    "Bagong Silang St.", "Pag-asa St.",
]

CIVIL_STATUSES = ["single", "married", "widowed", "separated"]

VACCINES = ["BCG", "Hepatitis B", "OPV", "DPT", "MMR", "Flu"]

CONDITIONS = [
    "Hypertension", "Diabetes Mellitus Type 2", "Asthma", "PTB", "UTI",
    "URTI", "Dengue", "Chickenpox",
]

VISIT_TYPES = ["consultation", "follow-up"]

CHIEF_COMPLAINTS = [
    "Fever and cough", "Headache and dizziness", "Abdominal pain",
    "Body weakness", "Colds and sore throat", "Skin rashes",
    "Routine prenatal check-up", "Follow-up for hypertension",
    "Follow-up for diabetes monitoring", "Difficulty breathing",
]

APPOINTMENT_TYPES = [
    "general_checkup", "follow_up", "prenatal", "immunization",
    "family_planning",
]

_now = datetime.now(tz=timezone.utc)
_today = _now.date()


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _random_date_between(days_ago_start: int, days_ago_end: int) -> date:
    """Return a random date between `days_ago_start` and `days_ago_end` days
    in the past (inclusive), where days_ago_start > days_ago_end."""
    delta = random.randint(days_ago_end, days_ago_start)
    return _today - timedelta(days=delta)


def _random_datetime_between(days_ago_start: int, days_ago_end: int) -> datetime:
    d = _random_date_between(days_ago_start, days_ago_end)
    return datetime.combine(
        d,
        datetime.min.time(),
        tzinfo=timezone.utc,
    ) + timedelta(hours=random.randint(8, 16), minutes=random.choice([0, 15, 30, 45]))


def _random_future_datetime(days_from_start: int, days_from_end: int) -> datetime:
    delta = random.randint(days_from_start, days_from_end)
    d = _today + timedelta(days=delta)
    return datetime.combine(
        d,
        datetime.min.time(),
        tzinfo=timezone.utc,
    ) + timedelta(hours=random.randint(8, 16), minutes=random.choice([0, 15, 30, 45]))


def _random_mobile() -> str:
    return f"+639{random.randint(100000000, 999999999)}"


def _random_name(sex: str) -> tuple[str, str, str]:
    first = random.choice(MALE_FIRST_NAMES if sex == "male" else FEMALE_FIRST_NAMES)
    middle = random.choice(MIDDLE_NAMES)
    last = random.choice(SURNAMES)
    return first, middle, last


def _random_address() -> str:
    house_no = random.randint(1, 999)
    street = random.choice(STREETS)
    brgy = random.choice(BARANGAYS)
    return f"{house_no} {street}, Brgy. {brgy}, Marilao, Bulacan"


async def _next_patient_code_seq(db: AsyncSession) -> int:
    """Continue the BHC-{year}-{seq} sequence from whatever already exists
    in the DB, so the seed never collides with pre-existing patient rows."""
    from sqlalchemy import func

    year = _today.year
    prefix = f"BHC-{year}-"
    result = await db.execute(
        select(func.max(Patient.patient_code)).where(
            Patient.patient_code.like(f"{prefix}%")
        )
    )
    max_code: str | None = result.scalar_one_or_none()
    if max_code:
        try:
            return int(max_code.rsplit("-", 1)[-1]) + 1
        except ValueError:
            return 1
    return 1


# ---------------------------------------------------------------------------
# Main seed routine
# ---------------------------------------------------------------------------


async def seed(db: AsyncSession) -> dict[str, int]:
    # -- Idempotency guard ----------------------------------------------------
    existing_admin = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
    if existing_admin.scalar_one_or_none() is not None:
        print(f"Seed already applied - {ADMIN_EMAIL} exists. Skipping all inserts.")
        return {}

    # -- Roles (upsert by name) ------------------------------------------------
    role_specs = [
        ("admin", {"all": True}),
        ("bhw", {"patients": ["read", "write"], "appointments": ["read", "write"], "sms": ["send"]}),
        ("physician", {"patients": ["read", "write"], "medical_history": ["read", "write"], "visits": ["read", "write"]}),
        ("admin_staff", {"patients": ["read", "write"], "appointments": ["read", "write"]}),
    ]
    roles: dict[str, Role] = {}
    for name, permissions in role_specs:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role is None:
            role = Role(id=uuid.uuid4(), name=name, permissions=permissions)
            db.add(role)
        roles[name] = role
    await db.flush()

    # -- Users ------------------------------------------------------------------
    admin_user = User(
        id=uuid.uuid4(),
        full_name="System Administrator",
        email=ADMIN_EMAIL,
        mobile_number="+639199990001",
        password_hash=hash_password(ADMIN_PASSWORD),
        role_id=roles["admin"].id,
        is_active=True,
        mfa_enabled=True,
    )
    bhw_user = User(
        id=uuid.uuid4(),
        full_name="Elena Marasigan",
        email=BHW_EMAIL,
        mobile_number="+639199990002",
        password_hash=hash_password(BHW_PASSWORD),
        role_id=roles["bhw"].id,
        is_active=True,
        mfa_enabled=True,
    )
    physician_user = User(
        id=uuid.uuid4(),
        full_name="Dr. Ramon Villareal",
        email=PHYSICIAN_EMAIL,
        mobile_number="+639199990003",
        password_hash=hash_password(PHYSICIAN_PASSWORD),
        role_id=roles["physician"].id,
        is_active=True,
        mfa_enabled=True,
    )
    db.add_all([admin_user, bhw_user, physician_user])
    await db.flush()

    # -- Patients -----------------------------------------------------------
    # 10 seniors (60+) + 5 PWD + 5 pregnant females + 40 regular = 60 total.
    patient_specs: list[dict] = []

    for _ in range(10):  # seniors
        sex = random.choice(["male", "female"])
        age = random.randint(60, 85)
        patient_specs.append({"sex": sex, "age": age, "is_senior": True, "is_pwd": False, "is_pregnant": False})

    for _ in range(5):  # PWD (any age, mixed sex)
        sex = random.choice(["male", "female"])
        age = random.randint(10, 70)
        patient_specs.append({"sex": sex, "age": age, "is_senior": age >= 60, "is_pwd": True, "is_pregnant": False})

    for _ in range(5):  # pregnant
        age = random.randint(18, 40)
        patient_specs.append({"sex": "female", "age": age, "is_senior": False, "is_pwd": False, "is_pregnant": True})

    for _ in range(40):  # regular mix, ages 0-59
        sex = random.choice(["male", "female"])
        age = random.randint(0, 59)
        patient_specs.append({"sex": sex, "age": age, "is_senior": False, "is_pwd": False, "is_pregnant": False})

    random.shuffle(patient_specs)

    seq_start = await _next_patient_code_seq(db)
    patients: list[Patient] = []
    for i, spec in enumerate(patient_specs):
        first, middle, last = _random_name(spec["sex"])
        birth_year = _today.year - spec["age"]
        birth_date = date(
            birth_year,
            random.randint(1, 12),
            random.randint(1, 28),
        )
        patient = Patient(
            id=uuid.uuid4(),
            patient_code=f"BHC-{_today.year}-{seq_start + i:06d}",
            first_name=first,
            middle_name=middle,
            last_name=last,
            birth_date=birth_date,
            sex=spec["sex"],
            civil_status=random.choice(CIVIL_STATUSES),
            mobile_number=_random_mobile(),
            address=_random_address(),
            is_pwd=spec["is_pwd"],
            is_senior=spec["is_senior"],
            is_pregnant=spec["is_pregnant"],
            is_active=True,
            created_by=bhw_user.id,
        )
        patients.append(patient)
    db.add_all(patients)
    await db.flush()

    # -- Download Unsplash profile photos (skipped if UNSPLASH_ACCESS_KEY not set)
    from scripts._unsplash_seed_photos import download_patient_photos  # noqa: PLC0415
    print("Downloading patient profile photos from Unsplash...")
    photo_map = await download_patient_photos(
        [(p.id, p.sex) for p in patients],
        settings.MEDIA_DIR,
    )
    if photo_map:
        for patient in patients:
            if patient.id in photo_map:
                patient.photo_path = photo_map[patient.id]
        await db.flush()

    # -- Immunizations (~1-3 per patient; 10 due within the next 3-10 days) --
    due_soon_offsets = [3, 4, 5, 5, 6, 6, 7, 8, 9, 10]
    random.shuffle(due_soon_offsets)
    due_soon_patient_indices = set(random.sample(range(len(patients)), len(due_soon_offsets)))

    immunizations: list[Immunization] = []
    for idx, patient in enumerate(patients):
        dose_count = random.randint(1, 3)
        for dose in range(1, dose_count + 1):
            vaccine = random.choice(VACCINES)
            administered = _random_date_between(730, 30)  # within last 2 years
            imm = Immunization(
                id=uuid.uuid4(),
                patient_id=patient.id,
                vaccine_name=vaccine,
                dose_number=dose,
                date_administered=administered,
                next_due_date=None,
                administered_by=bhw_user.id,
                status="completed",
            )
            immunizations.append(imm)

        if idx in due_soon_patient_indices:
            offset = due_soon_offsets.pop()
            imm = Immunization(
                id=uuid.uuid4(),
                patient_id=patient.id,
                vaccine_name=random.choice(VACCINES),
                dose_number=1,
                date_administered=None,
                next_due_date=_today + timedelta(days=offset),
                administered_by=bhw_user.id,
                status="scheduled",
            )
            immunizations.append(imm)
    db.add_all(immunizations)

    # -- Medical history (0-2 per patient, encrypted notes) ------------------
    medical_histories: list[MedicalHistory] = []
    for patient in patients:
        entry_count = random.choices([0, 1, 2], weights=[0.3, 0.45, 0.25])[0]
        for _ in range(entry_count):
            condition = random.choice(CONDITIONS)
            note_plain = f"Diagnosed with {condition}; monitored during routine visits."
            medical_histories.append(
                MedicalHistory(
                    id=uuid.uuid4(),
                    patient_id=patient.id,
                    condition_name=condition,
                    notes=encrypt_text(note_plain),
                    severity=random.choice(["mild", "moderate", "severe"]),
                    diagnosed_date=_random_date_between(548, 14),  # last 18 months
                    recorded_by=physician_user.id,
                )
            )
    db.add_all(medical_histories)

    # -- Visits (80 total; >=15 within the last 7 days) ----------------------
    visits: list[Visit] = []
    for i in range(80):
        patient = random.choice(patients)
        if i < 15:
            visit_dt = _random_datetime_between(7, 0)
        else:
            visit_dt = _random_datetime_between(90, 0)
        diagnosis_plain = f"Assessed for {random.choice(CONDITIONS).lower()} symptoms."
        treatment_plain = "Prescribed rest, hydration, and follow-up in 1 week."
        visits.append(
            Visit(
                id=uuid.uuid4(),
                patient_id=patient.id,
                recorded_by=random.choice([bhw_user.id, physician_user.id]),
                visit_date=visit_dt,
                case_no=f"BHC-VISIT-{_today.year}-{uuid.uuid4().hex[:8].upper()}",
                visit_type=random.choice(VISIT_TYPES),
                blood_pressure=f"{random.randint(100, 140)}/{random.randint(60, 90)} mmHg",
                temperature=round(random.uniform(36.0, 38.5), 1),
                pulse_rate=random.randint(60, 100),
                respiratory_rate=random.randint(16, 22),
                oxygen_saturation=random.randint(94, 100),
                weight_kg=round(random.uniform(8.0, 90.0), 2),
                height_cm=round(random.uniform(50.0, 175.0), 1),
                chief_complaint=random.choice(CHIEF_COMPLAINTS),
                past_medical_history=None,
                present_medical_history=None,
                diagnosis=encrypt_text(diagnosis_plain),
                treatment_notes=encrypt_text(treatment_plain),
            )
        )
    db.add_all(visits)

    # -- Appointments (40 total: 15 pending, 10 completed, 10 missed, 5 cancelled)
    appointments: list[Appointment] = []

    for _ in range(15):  # pending, upcoming
        patient = random.choice(patients)
        appointments.append(
            Appointment(
                id=uuid.uuid4(),
                patient_id=patient.id,
                appointment_type=random.choice(APPOINTMENT_TYPES),
                scheduled_at=_random_future_datetime(1, 14),
                status="pending",
                notes="Reminder sent via SMS.",
                created_by=bhw_user.id,
            )
        )

    for _ in range(10):  # completed, past
        patient = random.choice(patients)
        appointments.append(
            Appointment(
                id=uuid.uuid4(),
                patient_id=patient.id,
                appointment_type=random.choice(APPOINTMENT_TYPES),
                scheduled_at=_random_datetime_between(60, 8),
                status="completed",
                notes="Patient attended as scheduled.",
                created_by=bhw_user.id,
            )
        )

    for _ in range(10):  # missed, past — feeds the no-show-rate chart
        patient = random.choice(patients)
        appointments.append(
            Appointment(
                id=uuid.uuid4(),
                patient_id=patient.id,
                appointment_type=random.choice(APPOINTMENT_TYPES),
                scheduled_at=_random_datetime_between(60, 8),
                status="missed",
                notes="Patient did not show up.",
                created_by=bhw_user.id,
            )
        )

    for _ in range(5):  # cancelled
        patient = random.choice(patients)
        appointments.append(
            Appointment(
                id=uuid.uuid4(),
                patient_id=patient.id,
                appointment_type=random.choice(APPOINTMENT_TYPES),
                scheduled_at=_random_datetime_between(45, 5),
                status="cancelled",
                notes="Cancelled by patient request.",
                created_by=bhw_user.id,
            )
        )
    db.add_all(appointments)

    # -- Health cards (first 10 patients) — QR payload is patient_id + version
    # + HMAC only; no PHI is ever encoded (see qr_service.encode_qr_payload).
    health_cards: list[HealthCard] = []
    for i, patient in enumerate(patients[:10]):
        signed_url, _qr_data_uri = qr_service.encode_qr_payload(str(patient.id), 1)
        qr_hash = qr_service.hash_qr_url(signed_url)
        health_cards.append(
            HealthCard(
                id=uuid.uuid4(),
                patient_id=patient.id,
                card_number=f"HC-{_today.year}-{uuid.uuid4().hex[:8].upper()}",
                qr_payload_hash=qr_hash,
                card_version=1,
                status="active",
                issued_at=_now,
                issued_by=admin_user.id,
            )
        )
    db.add_all(health_cards)

    await db.commit()

    return {
        "patients": len(patients),
        "visits": len(visits),
        "appointments": len(appointments),
        "immunizations": len(immunizations),
        "medical_history": len(medical_histories),
        "health_cards": len(health_cards),
    }


_TRUNCATE_SQL = """
TRUNCATE TABLE
    card_verifications,
    health_cards,
    immunizations,
    appointments,
    sms_logs,
    visits,
    audit_logs,
    medical_history,
    patients,
    trusted_devices,
    users,
    roles
RESTART IDENTITY CASCADE;
"""


async def reset_and_seed(db: AsyncSession) -> dict[str, int]:
    """Truncate ALL tables (including users/roles) then run the full seed."""
    from sqlalchemy import text
    print("Truncating all tables (including users and roles)...")
    await db.execute(text(_TRUNCATE_SQL))
    await db.commit()
    print("Tables cleared. Running rich seed...")
    return await seed(db)


async def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="SmartHealth Hub demo seeder")
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Truncate all patient-related tables and re-seed with 60 patients, "
            "80 visits, 40 appointments, ~120 immunizations. "
            "WARNING: destroys all existing patient data."
        ),
    )
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        if args.force:
            summary = await reset_and_seed(db)
        else:
            summary = await seed(db)

    print("=" * 64)
    if not summary:
        print("No new data inserted (seed already applied).")
        print("Run with --force to truncate and re-seed.")
    else:
        print("SmartHealth Hub demo seed complete.")
        print(
            f"  Patients: {summary['patients']} | "
            f"Visits: {summary['visits']} | "
            f"Appointments: {summary['appointments']} | "
            f"Immunizations: ~{summary['immunizations']} | "
            f"Medical History: {summary['medical_history']} | "
            f"Health Cards: {summary['health_cards']}"
        )
        print()
        print(f"  Admin:     {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"  BHW:       {BHW_EMAIL} / {BHW_PASSWORD}")
        print(f"  Physician: {PHYSICIAN_EMAIL} / {PHYSICIAN_PASSWORD}")
    print("=" * 64)


if __name__ == "__main__":
    asyncio.run(main())
