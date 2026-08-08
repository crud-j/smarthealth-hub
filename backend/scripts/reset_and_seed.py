"""
reset_and_seed.py — Wipe all patient-related data and seed 25 sample patients
with complete demographic data, health cards, visit records, and appointments.

Patient mix (25 total):
  5 seniors (60+)
  3 PWD (Person with Disability)
  3 pregnant females (18-40)
  14 regular patients (male/female, ages 1-59)

For each patient:
  - 1 Visit  with vital signs + encrypted diagnosis/treatment_notes
  - 1 HealthCard with QR payload
  - 1-2 Appointments (one pending future, optionally one completed past)

User accounts (upserted, not wiped):
  admin@bhc.local    / Admin!2026      (admin role)
  bhw@bhc.local      / Bhw!2026        (bhw role)
  physician@bhc.local / Physician!2026  (physician role)

Run from the backend/ directory:
    python scripts/reset_and_seed.py

Prints all patient IDs and signed URLs at the end for easy test reference.
"""

from __future__ import annotations

import asyncio
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone

# Ensure the backend package is importable when run from backend/.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select, text

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.appointment import Appointment
from app.models.health_card import HealthCard
from app.models.patient import Patient
from app.models.user import Role, User
from app.models.visit import Visit
from app.services import qr_service
from app.utils.encryption import encrypt_text

# ---------------------------------------------------------------------------
# Tables to truncate (FK children before parents — users/roles are NOT wiped)
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

_TODAY = date.today()
_NOW = datetime.now(tz=timezone.utc)

# Philippine barangays in Marilao, Bulacan
_BARANGAYS = [
    "Brgy. Abangan Norte",
    "Brgy. Abangan Sur",
    "Brgy. Ibayo",
    "Brgy. Lias",
    "Brgy. Nagbalon",
    "Brgy. Patubig",
    "Brgy. Saog",
    "Brgy. San Jose",
    "Brgy. Santa Rosa I",
    "Brgy. Santa Rosa II",
    "Brgy. Tabing Ilog",
    "Brgy. Tumana",
]

_STREETS = [
    "Mabini Street",
    "Rizal Avenue",
    "Bonifacio Street",
    "Aguinaldo Highway",
    "Quezon Boulevard",
    "Luna Street",
    "Del Pilar Street",
    "Sampaguita Street",
    "Orchid Lane",
    "Maharlika Road",
]

_CIVIL_STATUSES = ["single", "married", "widowed", "separated"]

_APPOINTMENT_TYPES = [
    "general_checkup",
    "prenatal",
    "follow_up",
    "immunization",
    "family_planning",
    "dental",
]


def _ph_address(i: int) -> str:
    street = _STREETS[i % len(_STREETS)]
    brgy = _BARANGAYS[i % len(_BARANGAYS)]
    no = (i * 7 + 11) % 200 + 1
    return f"{no} {street}, {brgy}, Marilao, Bulacan"


def _mobile() -> str:
    return f"+639{random.randint(100000000, 999999999)}"


def _philhealth() -> str:
    return f"{random.randint(10, 99)}-{random.randint(100000000, 999999999)}-{random.randint(0, 9)}"


def _birth_date_for_age(age: int) -> date:
    """Return a birth date that produces the given age as of today."""
    return _TODAY.replace(year=_TODAY.year - age)


# ---------------------------------------------------------------------------
# 25-patient definitions
# ---------------------------------------------------------------------------

def _patient_data() -> list[dict]:
    """
    Return a list of 25 patient dicts.  Each dict contains both Patient-model
    fields and extra keys prefixed with '_' for visit/appointment data:
      _chief_complaint, _diagnosis, _treatment_notes,
      _blood_pressure, _temperature, _weight_kg, _height_cm,
      _pulse_rate, _respiratory_rate, _oxygen_saturation
    """
    random.seed(42)  # reproducible seed

    patients = [
        # ── Seniors (60+) ─────────────────────────────────────────────────
        {
            "first_name": "Ricardo",
            "middle_name": "Andres",
            "last_name": "Santos",
            "birth_date": _birth_date_for_age(73),
            "sex": "male",
            "civil_status": "widowed",
            "guardian_name": "Elena Santos-Reyes",
            "guardian_contact": _mobile(),
            "is_senior": True,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "145/90 mmHg",
            "_temperature": 37.1,
            "_weight_kg": 72.0,
            "_height_cm": 165.0,
            "_pulse_rate": 78,
            "_respiratory_rate": 18,
            "_oxygen_saturation": 96,
            "_chief_complaint": "Hypertension monitoring and diabetes follow-up",
            "_diagnosis": "Hypertension Stage 2; Type 2 Diabetes Mellitus",
            "_treatment_notes": "Continue Amlodipine 10mg OD, Metformin 500mg BID. HbA1c check in 3 months.",
        },
        {
            "first_name": "Consuelo",
            "middle_name": "Bautista",
            "last_name": "Villanueva",
            "birth_date": _birth_date_for_age(68),
            "sex": "female",
            "civil_status": "widowed",
            "guardian_name": "Jose Villanueva Jr.",
            "guardian_contact": _mobile(),
            "is_senior": True,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "130/85 mmHg",
            "_temperature": 36.9,
            "_weight_kg": 58.0,
            "_height_cm": 152.0,
            "_pulse_rate": 82,
            "_respiratory_rate": 19,
            "_oxygen_saturation": 97,
            "_chief_complaint": "Knee pain and difficulty walking",
            "_diagnosis": "Osteoarthritis, bilateral knee",
            "_treatment_notes": "Celecoxib 200mg OD, physical therapy referral.",
        },
        {
            "first_name": "Aurelio",
            "middle_name": "Crisostomo",
            "last_name": "Mendoza",
            "birth_date": _birth_date_for_age(75),
            "sex": "male",
            "civil_status": "married",
            "guardian_name": "Rosario Mendoza",
            "guardian_contact": _mobile(),
            "is_senior": True,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "160/95 mmHg",
            "_temperature": 36.8,
            "_weight_kg": 80.0,
            "_height_cm": 168.0,
            "_pulse_rate": 88,
            "_respiratory_rate": 20,
            "_oxygen_saturation": 95,
            "_chief_complaint": "Chest tightness and shortness of breath",
            "_diagnosis": "Hypertensive heart disease; Stable angina",
            "_treatment_notes": "Refer to cardiology. Isosorbide mononitrate 20mg BID.",
        },
        {
            "first_name": "Remedios",
            "middle_name": "Lozano",
            "last_name": "Aquino",
            "birth_date": _birth_date_for_age(65),
            "sex": "female",
            "civil_status": "married",
            "guardian_name": "Ernesto Aquino",
            "guardian_contact": _mobile(),
            "is_senior": True,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "128/82 mmHg",
            "_temperature": 36.6,
            "_weight_kg": 62.0,
            "_height_cm": 156.0,
            "_pulse_rate": 74,
            "_respiratory_rate": 17,
            "_oxygen_saturation": 98,
            "_chief_complaint": "Annual wellness check for senior citizen",
            "_diagnosis": "Controlled hypertension; Age-appropriate health status",
            "_treatment_notes": "Continue Losartan 50mg OD. Vitamin D supplementation.",
        },
        {
            "first_name": "Domingo",
            "middle_name": "Palma",
            "last_name": "Ramos",
            "birth_date": _birth_date_for_age(71),
            "sex": "male",
            "civil_status": "widowed",
            "guardian_name": "Maricel Ramos-Cruz",
            "guardian_contact": _mobile(),
            "is_senior": True,
            "is_pwd": True,
            "is_pregnant": False,
            "_blood_pressure": "138/88 mmHg",
            "_temperature": 37.0,
            "_weight_kg": 65.0,
            "_height_cm": 162.0,
            "_pulse_rate": 76,
            "_respiratory_rate": 18,
            "_oxygen_saturation": 96,
            "_chief_complaint": "Mobility difficulty after stroke — rehabilitation follow-up",
            "_diagnosis": "Post-CVA hemiplegia; Hypertension",
            "_treatment_notes": "Aspirin 80mg OD, Atorvastatin 40mg OD. Continue PT.",
        },
        # ── PWD (3 total — one already counted above with senior, 2 more here) ─
        {
            "first_name": "Luisa",
            "middle_name": "Fernandez",
            "last_name": "Garcia",
            "birth_date": _birth_date_for_age(38),
            "sex": "female",
            "civil_status": "married",
            "guardian_name": "Roberto Garcia",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": True,
            "is_pregnant": False,
            "_blood_pressure": "115/75 mmHg",
            "_temperature": 36.6,
            "_weight_kg": 50.0,
            "_height_cm": 152.0,
            "_pulse_rate": 72,
            "_respiratory_rate": 16,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Routine check-up and rehabilitation assessment",
            "_diagnosis": "Spastic cerebral palsy; Well-controlled",
            "_treatment_notes": "Continue baclofen 10mg TID. Refer to OT for ADL training.",
        },
        {
            "first_name": "Arturo",
            "middle_name": "Buencamino",
            "last_name": "Dela Torre",
            "birth_date": _birth_date_for_age(29),
            "sex": "male",
            "civil_status": "single",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": True,
            "is_pregnant": False,
            "_blood_pressure": "118/76 mmHg",
            "_temperature": 36.5,
            "_weight_kg": 55.0,
            "_height_cm": 158.0,
            "_pulse_rate": 70,
            "_respiratory_rate": 16,
            "_oxygen_saturation": 98,
            "_chief_complaint": "Eye check — visual impairment follow-up",
            "_diagnosis": "Bilateral retinitis pigmentosa; Moderate visual impairment",
            "_treatment_notes": "Refer to ophthalmology for visual aids assessment.",
        },
        # ── Pregnant females ───────────────────────────────────────────────
        {
            "first_name": "Carmela",
            "middle_name": "Dizon",
            "last_name": "Bautista",
            "birth_date": _birth_date_for_age(28),
            "sex": "female",
            "civil_status": "married",
            "guardian_name": "Marco Bautista",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": True,
            "_blood_pressure": "105/65 mmHg",
            "_temperature": 36.8,
            "_weight_kg": 62.0,
            "_height_cm": 160.0,
            "_pulse_rate": 90,
            "_respiratory_rate": 18,
            "_oxygen_saturation": 98,
            "_chief_complaint": "Prenatal check-up — 28 weeks AOG",
            "_diagnosis": "G1P0, 28 weeks AOG; Low-risk pregnancy",
            "_treatment_notes": "Ferrous sulfate + folic acid. Next prenatal visit in 4 weeks.",
        },
        {
            "first_name": "Maribel",
            "middle_name": "Santos",
            "last_name": "Ocampo",
            "birth_date": _birth_date_for_age(24),
            "sex": "female",
            "civil_status": "married",
            "guardian_name": "Rodrigo Ocampo",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": True,
            "_blood_pressure": "108/68 mmHg",
            "_temperature": 36.7,
            "_weight_kg": 55.0,
            "_height_cm": 155.0,
            "_pulse_rate": 88,
            "_respiratory_rate": 17,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Prenatal check-up — 16 weeks AOG",
            "_diagnosis": "G2P1, 16 weeks AOG; Well pregnancy",
            "_treatment_notes": "Prenatal vitamins continued. FHT 148 bpm. Next visit in 4 weeks.",
        },
        {
            "first_name": "Jessa",
            "middle_name": "Reyes",
            "last_name": "Tolentino",
            "birth_date": _birth_date_for_age(32),
            "sex": "female",
            "civil_status": "married",
            "guardian_name": "Carlos Tolentino",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": True,
            "_blood_pressure": "110/70 mmHg",
            "_temperature": 36.9,
            "_weight_kg": 70.0,
            "_height_cm": 162.0,
            "_pulse_rate": 86,
            "_respiratory_rate": 18,
            "_oxygen_saturation": 98,
            "_chief_complaint": "Prenatal check-up — 36 weeks AOG, mild edema",
            "_diagnosis": "G3P2, 36 weeks AOG; Mild gestational edema",
            "_treatment_notes": "Bed rest advised. Monitor BP. Return immediately if severe headache.",
        },
        # ── Regular patients (14 remaining) ───────────────────────────────
        {
            "first_name": "Juan",
            "middle_name": "Santos",
            "last_name": "Dela Cruz",
            "birth_date": _birth_date_for_age(36),
            "sex": "male",
            "civil_status": "married",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "120/80 mmHg",
            "_temperature": 36.7,
            "_weight_kg": 68.5,
            "_height_cm": 170.0,
            "_pulse_rate": 72,
            "_respiratory_rate": 16,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Annual physical check-up",
            "_diagnosis": "Generally healthy; BMI within normal range",
            "_treatment_notes": "Routine labs advised. No medications required.",
        },
        {
            "first_name": "Maria",
            "middle_name": "Cristina",
            "last_name": "Reyes",
            "birth_date": _birth_date_for_age(31),
            "sex": "female",
            "civil_status": "single",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "110/70 mmHg",
            "_temperature": 37.8,
            "_weight_kg": 55.0,
            "_height_cm": 158.5,
            "_pulse_rate": 92,
            "_respiratory_rate": 20,
            "_oxygen_saturation": 97,
            "_chief_complaint": "Fever and colds for 3 days",
            "_diagnosis": "Acute upper respiratory tract infection",
            "_treatment_notes": "Paracetamol 500mg q4h PRN fever. Warm fluids, rest.",
        },
        {
            "first_name": "Michael",
            "middle_name": "Lorenzo",
            "last_name": "Tan",
            "birth_date": _birth_date_for_age(22),
            "sex": "male",
            "civil_status": "single",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "118/76 mmHg",
            "_temperature": 36.4,
            "_weight_kg": 62.0,
            "_height_cm": 172.0,
            "_pulse_rate": 68,
            "_respiratory_rate": 15,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Skin rash on forearms — possible allergic reaction",
            "_diagnosis": "Contact dermatitis",
            "_treatment_notes": "Cetirizine 10mg OD, Hydrocortisone cream BID x5 days.",
        },
        {
            "first_name": "Angelica",
            "middle_name": "Morales",
            "last_name": "Navarro",
            "birth_date": _birth_date_for_age(19),
            "sex": "female",
            "civil_status": "single",
            "guardian_name": "Perla Navarro",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "106/68 mmHg",
            "_temperature": 36.3,
            "_weight_kg": 48.0,
            "_height_cm": 153.0,
            "_pulse_rate": 74,
            "_respiratory_rate": 16,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Dysmenorrhea — painful menstruation",
            "_diagnosis": "Primary dysmenorrhea",
            "_treatment_notes": "Mefenamic acid 500mg TID during menses. Warm compress.",
        },
        {
            "first_name": "Roberto",
            "middle_name": "Magno",
            "last_name": "Cruz",
            "birth_date": _birth_date_for_age(45),
            "sex": "male",
            "civil_status": "married",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "135/85 mmHg",
            "_temperature": 36.8,
            "_weight_kg": 85.0,
            "_height_cm": 175.0,
            "_pulse_rate": 80,
            "_respiratory_rate": 17,
            "_oxygen_saturation": 97,
            "_chief_complaint": "Persistent headache and dizziness",
            "_diagnosis": "Stage 1 Hypertension",
            "_treatment_notes": "Start Amlodipine 5mg OD. Low-salt diet. Return in 2 weeks.",
        },
        {
            "first_name": "Liza",
            "middle_name": "Ponce",
            "last_name": "Soriano",
            "birth_date": _birth_date_for_age(40),
            "sex": "female",
            "civil_status": "separated",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "112/72 mmHg",
            "_temperature": 36.5,
            "_weight_kg": 58.0,
            "_height_cm": 159.0,
            "_pulse_rate": 76,
            "_respiratory_rate": 16,
            "_oxygen_saturation": 98,
            "_chief_complaint": "Fatigue and weight loss for 2 months",
            "_diagnosis": "Iron deficiency anemia; Stress-related fatigue",
            "_treatment_notes": "Ferrous sulfate 325mg OD x3 months. CBC in 1 month.",
        },
        {
            "first_name": "Dennis",
            "middle_name": "Felipe",
            "last_name": "Pascual",
            "birth_date": _birth_date_for_age(17),
            "sex": "male",
            "civil_status": "single",
            "guardian_name": "Gloria Pascual",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "112/74 mmHg",
            "_temperature": 38.2,
            "_weight_kg": 52.0,
            "_height_cm": 165.0,
            "_pulse_rate": 96,
            "_respiratory_rate": 21,
            "_oxygen_saturation": 97,
            "_chief_complaint": "Sore throat and fever for 2 days",
            "_diagnosis": "Acute pharyngotonsillitis",
            "_treatment_notes": "Amoxicillin 500mg TID x7 days. Paracetamol PRN fever.",
        },
        {
            "first_name": "Edna",
            "middle_name": "Lacson",
            "last_name": "Flores",
            "birth_date": _birth_date_for_age(52),
            "sex": "female",
            "civil_status": "married",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "132/84 mmHg",
            "_temperature": 36.7,
            "_weight_kg": 67.0,
            "_height_cm": 157.0,
            "_pulse_rate": 80,
            "_respiratory_rate": 18,
            "_oxygen_saturation": 97,
            "_chief_complaint": "Diabetes follow-up — fasting blood sugar check",
            "_diagnosis": "Type 2 Diabetes Mellitus; Controlled on medication",
            "_treatment_notes": "FBS 6.8 mmol/L — improving. Continue Metformin 1g BID.",
        },
        {
            "first_name": "Francis",
            "middle_name": "Aguilar",
            "last_name": "Miranda",
            "birth_date": _birth_date_for_age(5),
            "sex": "male",
            "civil_status": "single",
            "guardian_name": "Teresita Miranda",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "90/60 mmHg",
            "_temperature": 37.5,
            "_weight_kg": 18.0,
            "_height_cm": 108.0,
            "_pulse_rate": 102,
            "_respiratory_rate": 24,
            "_oxygen_saturation": 98,
            "_chief_complaint": "Cough and colds for 4 days — child patient",
            "_diagnosis": "Acute nasopharyngitis",
            "_treatment_notes": "Salbutamol nebulization PRN wheeze. Cetirizine syrup OD.",
        },
        {
            "first_name": "Rowena",
            "middle_name": "Castillo",
            "last_name": "Bernardo",
            "birth_date": _birth_date_for_age(34),
            "sex": "female",
            "civil_status": "married",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "114/74 mmHg",
            "_temperature": 36.6,
            "_weight_kg": 60.0,
            "_height_cm": 161.0,
            "_pulse_rate": 74,
            "_respiratory_rate": 16,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Family planning consultation — OCP counseling",
            "_diagnosis": "Family planning — oral contraceptive initiation",
            "_treatment_notes": "Prescribed combined OCP 21-day pack. Educated on adherence.",
        },
        {
            "first_name": "Antonio",
            "middle_name": "Burgos",
            "last_name": "Santiago",
            "birth_date": _birth_date_for_age(58),
            "sex": "male",
            "civil_status": "married",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "140/90 mmHg",
            "_temperature": 36.9,
            "_weight_kg": 78.0,
            "_height_cm": 169.0,
            "_pulse_rate": 84,
            "_respiratory_rate": 18,
            "_oxygen_saturation": 96,
            "_chief_complaint": "Back pain and leg numbness for 1 week",
            "_diagnosis": "Lumbar disc herniation — L4-L5 level",
            "_treatment_notes": "Methocarbamol 500mg TID. Ibuprofen 400mg TID with food. PT referral.",
        },
        {
            "first_name": "Sheryl",
            "middle_name": "Gomez",
            "last_name": "Reyes",
            "birth_date": _birth_date_for_age(26),
            "sex": "female",
            "civil_status": "single",
            "guardian_name": None,
            "guardian_contact": None,
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "108/70 mmHg",
            "_temperature": 36.4,
            "_weight_kg": 51.0,
            "_height_cm": 154.0,
            "_pulse_rate": 70,
            "_respiratory_rate": 15,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Well-woman check-up and Pap smear",
            "_diagnosis": "No gynecological abnormalities detected",
            "_treatment_notes": "Pap smear result normal. Next screening in 3 years.",
        },
        {
            "first_name": "Benjamin",
            "middle_name": "Iglesia",
            "last_name": "Sison",
            "birth_date": _birth_date_for_age(1),
            "sex": "male",
            "civil_status": "single",
            "guardian_name": "Anna Sison",
            "guardian_contact": _mobile(),
            "is_senior": False,
            "is_pwd": False,
            "is_pregnant": False,
            "_blood_pressure": "80/50 mmHg",
            "_temperature": 36.8,
            "_weight_kg": 10.2,
            "_height_cm": 75.0,
            "_pulse_rate": 110,
            "_respiratory_rate": 28,
            "_oxygen_saturation": 99,
            "_chief_complaint": "Routine well-baby check — 12-month immunization",
            "_diagnosis": "Healthy infant; appropriate growth milestones",
            "_treatment_notes": "MMR and Varicella given. Next visit at 18 months.",
        },
    ]

    # Assign addresses, mobile numbers, philhealth, and patient codes
    for i, p in enumerate(patients):
        p["patient_code"] = f"BHC-2026-{i + 1:06d}"
        if "mobile_number" not in p or p.get("mobile_number") is None:
            p["mobile_number"] = _mobile()
        p["address"] = _ph_address(i)
        p["civil_status"] = p.get("civil_status", random.choice(_CIVIL_STATUSES))
        # Assign PhilHealth to ~70% of patients
        if random.random() < 0.70:
            p["philhealth_no"] = _philhealth()
            p["philhealth_member_type"] = random.choice(["member", "dependent"])
        else:
            p["philhealth_no"] = None
            p["philhealth_member_type"] = None
        p["is_active"] = True

    return patients


# ---------------------------------------------------------------------------
# User / role upserts
# ---------------------------------------------------------------------------

async def _upsert_roles(db) -> dict[str, Role]:
    """Ensure admin, bhw, and physician roles exist. Return mapping name→Role."""
    role_defs = {
        "admin": {"patients": ["read", "write", "delete"], "analytics": ["read"], "users": ["read", "write", "delete"], "audit_logs": ["read"]},
        "bhw": {"patients": ["read", "write"], "analytics": ["read"], "sms": ["send"]},
        "physician": {"patients": ["read", "write"], "analytics": ["read"]},
    }
    roles: dict[str, Role] = {}
    for name, perms in role_defs.items():
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role is None:
            role = Role(name=name, permissions=perms)
            db.add(role)
            await db.flush()
            print(f"  Created role: {name}")
        else:
            print(f"  Role exists: {name}")
        roles[name] = role
    return roles


async def _upsert_user(
    db,
    roles: dict[str, Role],
    email: str,
    full_name: str,
    mobile: str,
    password: str,
    role_name: str,
) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            full_name=full_name,
            email=email,
            mobile_number=mobile,
            password_hash=hash_password(password),
            role_id=roles[role_name].id,
            is_active=True,
            mfa_enabled=True,
        )
        db.add(user)
        await db.flush()
        print(f"  Created user: {email} ({role_name})")
    else:
        print(f"  User exists: {email} ({role_name})")
    return user


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    async with AsyncSessionLocal() as db:
        # ── 1. Wipe patient-related tables ────────────────────────────────
        print("Truncating patient-related tables...")
        await db.execute(text(_TRUNCATE_SQL))
        await db.commit()
        print("Done.\n")

        # ── 2. Upsert roles and users ──────────────────────────────────────
        print("Upserting roles and user accounts...")
        roles = await _upsert_roles(db)
        await _upsert_user(db, roles, "admin@bhc.local", "System Administrator", "+639100000001", "Admin!2026", "admin")
        await _upsert_user(db, roles, "bhw@bhc.local", "BHW Staff", "+639100000002", "Bhw!2026", "bhw")
        await _upsert_user(db, roles, "physician@bhc.local", "Clinic Physician", "+639100000003", "Physician!2026", "physician")
        await db.commit()
        print("Done.\n")

        # ── 3. Seed 25 patients ────────────────────────────────────────────
        print("Creating 25 sample patients with visits, health cards, and appointments...\n")

        results: list[dict] = []
        seeded_patients: list[Patient] = []
        all_patients = _patient_data()

        test_nfc_uid: str = os.getenv("TEST_NFC_UID", "").strip()

        for idx, data in enumerate(all_patients, start=1):
            # Pull out visit-specific keys (prefixed with '_')
            chief_complaint = data.pop("_chief_complaint")
            diagnosis = data.pop("_diagnosis")
            treatment_notes = data.pop("_treatment_notes")
            blood_pressure = data.pop("_blood_pressure")
            temperature = data.pop("_temperature")
            weight_kg = data.pop("_weight_kg")
            height_cm = data.pop("_height_cm")
            pulse_rate = data.pop("_pulse_rate")
            respiratory_rate = data.pop("_respiratory_rate")
            oxygen_saturation = data.pop("_oxygen_saturation")

            # ── Create Patient ─────────────────────────────────────────
            patient = Patient(**data)
            db.add(patient)
            await db.flush()
            seeded_patients.append(patient)

            patient_id = str(patient.id)

            # ── Create Visit ───────────────────────────────────────────
            visit = Visit(
                patient_id=patient.id,
                visit_date=_NOW,
                visit_type="consultation",
                blood_pressure=blood_pressure,
                temperature=temperature,
                weight_kg=weight_kg,
                height_cm=height_cm,
                pulse_rate=pulse_rate,
                respiratory_rate=respiratory_rate,
                oxygen_saturation=oxygen_saturation,
                chief_complaint=chief_complaint,
                diagnosis=encrypt_text(diagnosis),
                treatment_notes=encrypt_text(treatment_notes),
            )
            db.add(visit)

            # ── Create Health Card + QR payload ───────────────────────
            card_number = f"HC-2026-{idx:05d}"
            signed_url, _qr_uri = qr_service.encode_qr_payload(patient_id, 1)
            qr_hash = qr_service.hash_qr_url(signed_url)

            card = HealthCard(
                patient_id=patient.id,
                card_number=card_number,
                qr_payload_hash=qr_hash,
                card_version=1,
                status="active",
                issued_at=_NOW,
                issued_by=None,
                # Link the test NFC UID to patient #1 only so /scan/<UID> works
                # immediately after seeding. Use /view/HC-XXXX for all others.
                nfc_uid=test_nfc_uid if (idx == 1 and test_nfc_uid) else None,
            )
            db.add(card)

            # ── Create pending appointment (1-14 days from now) ────────
            appt_offset_days = (idx % 14) + 1
            appt_pending = Appointment(
                patient_id=patient.id,
                appointment_type=_APPOINTMENT_TYPES[idx % len(_APPOINTMENT_TYPES)],
                scheduled_at=_NOW + timedelta(days=appt_offset_days),
                status="pending",
                notes=f"Follow-up after initial visit — patient #{idx}",
            )
            db.add(appt_pending)

            # ── Create completed appointment (past) for even-indexed patients ──
            if idx % 2 == 0:
                appt_past = Appointment(
                    patient_id=patient.id,
                    appointment_type=_APPOINTMENT_TYPES[(idx + 2) % len(_APPOINTMENT_TYPES)],
                    scheduled_at=_NOW - timedelta(days=(idx % 30) + 5),
                    status="completed",
                    notes="Previous appointment — completed.",
                )
                db.add(appt_past)

            category_flags = [
                k for k in ("is_senior", "is_pwd", "is_pregnant")
                if data.get(k)
            ]
            results.append(
                {
                    "idx": idx,
                    "patient_id": patient_id,
                    "code": data["patient_code"],
                    "name": f"{data['last_name']}, {data['first_name']}",
                    "card_number": card_number,
                    "signed_url": signed_url,
                    "flags": category_flags if category_flags else ["regular"],
                }
            )

        await db.commit()

        # ── Download Unsplash profile photos (skipped if UNSPLASH_ACCESS_KEY not set)
        from scripts._unsplash_seed_photos import download_patient_photos  # noqa: PLC0415
        print("\nDownloading patient profile photos from Unsplash...")
        photo_map = await download_patient_photos(
            [(p.id, p.sex) for p in seeded_patients],
            settings.MEDIA_DIR,
        )
        if photo_map:
            for patient in seeded_patients:
                if patient.id in photo_map:
                    patient.photo_path = photo_map[patient.id]
            await db.flush()
            await db.commit()

        # ── Print summary table ────────────────────────────────────────────
        print("=" * 80)
        print(f"{'#':<4} {'Code':<20} {'Name':<28} {'Flags'}")
        print("-" * 80)
        for r in results:
            flags_str = ", ".join(r["flags"])
            print(f"{r['idx']:<4} {r['code']:<20} {r['name']:<28} {flags_str}")

        print("=" * 80)
        print(f"\nTotal patients seeded: {len(results)}")
        print("\nPatient UUIDs and QR signed URLs (for API testing):")
        for r in results:
            print(f"  [{r['idx']:>2}] {r['code']}  →  {r['patient_id']}")
            print(f"        Card: {r['card_number']}  URL: {r['signed_url'][:72]}...")

        if test_nfc_uid:
            first = results[0]
            print(f"\nNFC test UID '{test_nfc_uid}' linked to → {first['card_number']} ({first['name']})")
            print(f"  Scan URL : http://192.168.100.6:9000/scan/{test_nfc_uid}")
            print( "  Other patients: change NFC Tools Task URL to http://192.168.100.6:9000/view/HC-2026-XXXXX")

        print(
            "\nDone! Accounts: admin@bhc.local / Admin!2026 | bhw@bhc.local / Bhw!2026 | physician@bhc.local / Physician!2026"
        )


if __name__ == "__main__":
    asyncio.run(main())
