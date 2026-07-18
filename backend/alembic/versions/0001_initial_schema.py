"""Initial schema — all 12 tables for SmartHealth Hub.

Revision ID: 0001
Revises: (none — this is the first migration)
Create Date: 2026-07-17

Tables created in FK dependency order:
  1.  roles
  2.  users
  3.  patients
  4.  medical_history
  5.  immunizations
  6.  appointments
  7.  visits
  8.  health_cards
  9.  card_verifications
  10. mfa_otp
  11. sms_logs
  12. audit_logs

PostgreSQL extensions required:
  - pgcrypto  → gen_random_uuid() for UUID primary keys
  - uuid-ossp → uuid_generate_v4() (belt-and-suspenders; pgcrypto preferred)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

# ---------------------------------------------------------------------------
# Alembic revision identifiers
# ---------------------------------------------------------------------------
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # ── PostgreSQL extensions ──────────────────────────────────────────────
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # ── 1. roles ──────────────────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column(
            "permissions",
            pg.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # ── 2. users ──────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(150), unique=True, nullable=False),
        sa.Column("mobile_number", sa.String(20), unique=True, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column(
            "role_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("roles.id", name="fk_users_role_id_roles"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.Column(
            "mfa_enabled",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.Column("last_login_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_users_role", "users", ["role_id"])
    op.create_index("idx_users_email", "users", ["email"])

    # ── 3. patients ───────────────────────────────────────────────────────
    op.create_table(
        "patients",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("patient_code", sa.String(20), unique=True, nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("middle_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("birth_date", sa.Date, nullable=False),
        sa.Column("sex", sa.String(10), nullable=False),
        sa.Column("civil_status", sa.String(20), nullable=True),
        sa.Column("mobile_number", sa.String(20), nullable=True),
        sa.Column("address", sa.Text, nullable=False),
        sa.Column("guardian_name", sa.String(150), nullable=True),
        sa.Column("guardian_contact", sa.String(20), nullable=True),
        sa.Column("philhealth_no", sa.String(20), nullable=True),
        sa.Column(
            "is_pwd",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "is_senior",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "is_pregnant",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.Column(
            "created_by",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_patients_created_by_users"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("sex IN ('male', 'female')", name="patients_sex_check"),
    )
    op.create_index("idx_patients_name", "patients", ["last_name", "first_name"])
    op.create_index("idx_patients_code", "patients", ["patient_code"])
    op.create_index("idx_patients_mobile", "patients", ["mobile_number"])

    # ── 4. medical_history ────────────────────────────────────────────────
    op.create_table(
        "medical_history",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "patients.id",
                name="fk_medical_history_patient_id_patients",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("condition_name", sa.String(150), nullable=False),
        # Encrypted at application layer (AES-256-GCM) before INSERT
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("severity", sa.String(20), nullable=True),
        sa.Column("diagnosed_date", sa.Date, nullable=True),
        sa.Column(
            "recorded_by",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_medical_history_recorded_by_users"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "severity IN ('mild', 'moderate', 'severe')",
            name="medical_history_severity_check",
        ),
    )
    op.create_index("idx_medhist_patient", "medical_history", ["patient_id"])

    # ── 5. immunizations ──────────────────────────────────────────────────
    op.create_table(
        "immunizations",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "patients.id",
                name="fk_immunizations_patient_id_patients",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("vaccine_name", sa.String(100), nullable=False),
        sa.Column(
            "dose_number",
            sa.Integer,
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("date_administered", sa.Date, nullable=True),
        sa.Column("next_due_date", sa.Date, nullable=True),
        sa.Column(
            "administered_by",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_immunizations_administered_by_users",
            ),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'scheduled'"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'completed', 'missed', 'cancelled')",
            name="immunizations_status_check",
        ),
    )
    op.create_index("idx_immun_patient", "immunizations", ["patient_id"])
    op.create_index("idx_immun_next_due", "immunizations", ["next_due_date"])

    # ── 6. appointments ───────────────────────────────────────────────────
    op.create_table(
        "appointments",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "patients.id",
                name="fk_appointments_patient_id_patients",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("appointment_type", sa.String(50), nullable=False),
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_by",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_appointments_created_by_users"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'completed', 'missed', 'cancelled')",
            name="appointments_status_check",
        ),
    )
    op.create_index("idx_appt_patient", "appointments", ["patient_id"])
    op.create_index("idx_appt_schedule", "appointments", ["scheduled_at"])
    op.create_index("idx_appt_status", "appointments", ["status"])

    # ── 7. visits ─────────────────────────────────────────────────────────
    op.create_table(
        "visits",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "patients.id",
                name="fk_visits_patient_id_patients",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column(
            "recorded_by",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_visits_recorded_by_users"),
            nullable=True,
        ),
        sa.Column(
            "visit_date",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("visit_type", sa.String(50), nullable=False),
        sa.Column("chief_complaint", sa.Text, nullable=True),
        # Encrypted at application layer (AES-256-GCM) before INSERT
        sa.Column("diagnosis", sa.Text, nullable=True),
        # Encrypted at application layer (AES-256-GCM) before INSERT
        sa.Column("treatment_notes", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_visits_patient", "visits", ["patient_id"])
    op.create_index("idx_visits_date", "visits", ["visit_date"])

    # ── 8. health_cards ───────────────────────────────────────────────────
    op.create_table(
        "health_cards",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        # UNIQUE enforces one active card record per patient
        sa.Column(
            "patient_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "patients.id",
                name="fk_health_cards_patient_id_patients",
                ondelete="CASCADE",
            ),
            unique=True,
            nullable=False,
        ),
        sa.Column("card_number", sa.String(30), unique=True, nullable=False),
        # HMAC-SHA256 hex digest of canonical QR payload (patient_id + card_version)
        sa.Column("qr_payload_hash", sa.Text, nullable=False),
        # NFC chip UID — nullable until physical NFC chip is provisioned
        sa.Column("nfc_uid", sa.String(64), unique=True, nullable=True),
        sa.Column(
            "card_version",
            sa.Integer,
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column(
            "issued_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "issued_by",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_health_cards_issued_by_users"),
            nullable=True,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'lost', 'reissued', 'revoked')",
            name="health_cards_status_check",
        ),
    )
    op.create_index("idx_cards_patient", "health_cards", ["patient_id"])
    op.create_index("idx_cards_number", "health_cards", ["card_number"])

    # ── 9. card_verifications ─────────────────────────────────────────────
    op.create_table(
        "card_verifications",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "health_card_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "health_cards.id",
                name="fk_card_verifications_health_card_id_health_cards",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("verification_method", sa.String(10), nullable=False),
        sa.Column(
            "verified_by",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_card_verifications_verified_by_users",
            ),
            nullable=True,
        ),
        sa.Column(
            "verified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "success",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.CheckConstraint(
            "verification_method IN ('nfc', 'qr')",
            name="card_verifications_method_check",
        ),
    )
    op.create_index("idx_cardverif_card", "card_verifications", ["health_card_id"])

    # ── 10. mfa_otp ───────────────────────────────────────────────────────
    op.create_table(
        "mfa_otp",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_mfa_otp_user_id_users",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        # Argon2 hash of the 6-digit OTP — never store plaintext
        sa.Column("otp_code_hash", sa.Text, nullable=False),
        sa.Column(
            "purpose",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'login'"),
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "is_used",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "attempt_count",
            sa.Integer,
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "purpose IN ('login', 'password_reset')",
            name="mfa_otp_purpose_check",
        ),
    )
    op.create_index("idx_otp_user", "mfa_otp", ["user_id"])

    # ── 11. sms_logs ──────────────────────────────────────────────────────
    op.create_table(
        "sms_logs",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "patients.id",
                name="fk_sms_logs_patient_id_patients",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.Column(
            "appointment_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "appointments.id",
                name="fk_sms_logs_appointment_id_appointments",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.Column(
            "immunization_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "immunizations.id",
                name="fk_sms_logs_immunization_id_immunizations",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.Column("mobile_number", sa.String(20), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column("provider_message_id", sa.String(100), nullable=True),
        sa.Column("error_detail", sa.Text, nullable=True),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'sent', 'failed', 'delivered')",
            name="sms_logs_status_check",
        ),
    )
    op.create_index("idx_sms_patient", "sms_logs", ["patient_id"])
    op.create_index("idx_sms_status", "sms_logs", ["status"])

    # ── 12. audit_logs ────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_audit_logs_user_id_users",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "metadata",
            pg.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_audit_user", "audit_logs", ["user_id"])
    op.create_index(
        "idx_audit_entity", "audit_logs", ["entity_type", "entity_id"]
    )
    op.create_index("idx_audit_created", "audit_logs", ["created_at"])


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    # Drop tables in reverse FK dependency order to avoid constraint violations.
    op.drop_table("audit_logs")
    op.drop_table("sms_logs")
    op.drop_table("mfa_otp")
    op.drop_table("card_verifications")
    op.drop_table("health_cards")
    op.drop_table("visits")
    op.drop_table("appointments")
    op.drop_table("immunizations")
    op.drop_table("medical_history")
    op.drop_table("patients")
    op.drop_table("users")
    op.drop_table("roles")

    # Drop extensions last (only if no other DB objects depend on them)
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
    op.execute('DROP EXTENSION IF EXISTS "pgcrypto"')
