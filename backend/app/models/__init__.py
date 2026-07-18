"""
ORM model package.

Importing this package registers all SQLAlchemy models with ``Base.metadata``,
which is required for:
  - Alembic autogenerate (``alembic revision --autogenerate``)
  - ``Base.metadata.create_all()`` in test fixtures

Import order respects FK dependency:
  roles → users → patients → medical_history → immunizations →
  appointments → visits → health_cards → card_verifications →
  mfa_otp → sms_logs → audit_logs
"""

from app.models.user import Role, User  # noqa: F401
from app.models.patient import Patient  # noqa: F401
from app.models.medical_history import MedicalHistory  # noqa: F401
from app.models.immunization import Immunization  # noqa: F401
from app.models.appointment import Appointment  # noqa: F401
from app.models.visit import Visit  # noqa: F401
from app.models.health_card import HealthCard  # noqa: F401
from app.models.card_verification import CardVerification  # noqa: F401
from app.models.mfa_otp import MfaOtp  # noqa: F401
from app.models.sms_log import SmsLog  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401

__all__ = [
    "Role",
    "User",
    "Patient",
    "MedicalHistory",
    "Immunization",
    "Appointment",
    "Visit",
    "HealthCard",
    "CardVerification",
    "MfaOtp",
    "SmsLog",
    "AuditLog",
]
