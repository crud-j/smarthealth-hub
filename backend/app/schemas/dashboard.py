"""
Role-based dashboard payloads for GET /api/v1/dashboard/me.

The server decides what each role sees (like ``require_role``): the response
is a union discriminated by ``role``. Every section is counts or short lists.

PHI rules:
  - Never diagnosis, treatment notes, medical-history notes, allergies or
    known conditions (encrypted columns are not read at all).
  - Patient names/codes only for roles that can already open those patients.
  - Admin (model B) gets no clinical lists (no visits, no vital signs).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.analytics import ReminderEffectResponse
from app.schemas.system_config import SystemStatusResponse

# ---------------------------------------------------------------------------
# Shared rows
# ---------------------------------------------------------------------------


class PatientRef(BaseModel):
    id: str
    patient_code: str
    full_name: str


class AppointmentRow(BaseModel):
    id: str
    patient: PatientRef
    appointment_type: str
    scheduled_at: datetime
    status: str
    intake_completed: bool = Field(..., description="Pre-visit form completed")


class _DashboardBase(BaseModel):
    first_name: str = Field(..., description="Signed-in user's first name, for the greeting")
    today: date = Field(..., description="Manila calendar date the figures are for")


# ---------------------------------------------------------------------------
# Physician
# ---------------------------------------------------------------------------


class WaitingVisit(BaseModel):
    """A visit logged today that has no diagnosis yet (vital signs only)."""

    visit_id: str
    patient: PatientRef
    age: int | None
    visit_date: datetime
    visit_type: str
    recorded_by_name: str | None
    temperature: float | None
    blood_pressure: str | None
    pulse_rate: int | None
    oxygen_saturation: int | None
    weight_kg: float | None


class ConditionCount(BaseModel):
    condition_name: str
    count: int


class PhysicianDashboard(_DashboardBase):
    role: Literal["physician"] = "physician"
    waiting_count: int
    waiting: list[WaitingVisit]
    consultations_today: int
    consultations_week: int
    follow_ups_due_7d: int
    appointments_today_count: int
    appointments_today: list[AppointmentRow]
    top_conditions_month: list[ConditionCount]


# ---------------------------------------------------------------------------
# BHW
# ---------------------------------------------------------------------------


class ImmunizationDueRow(BaseModel):
    id: str
    patient: PatientRef
    sitio_purok: str | None
    vaccine_name: str
    dose_number: int
    next_due_date: date
    overdue: bool


class MissedAppointmentRow(BaseModel):
    id: str
    patient: PatientRef
    mobile_number: str | None
    appointment_type: str
    scheduled_at: datetime


class FailedSmsRow(BaseModel):
    id: str
    patient: PatientRef | None
    kind: Literal["appointment", "immunization", "other"]
    created_at: datetime
    reason: str | None
    resent: bool = Field(False, description="A resend of this SMS was already queued")
    can_resend: bool = Field(
        False, description="POST /sms/logs/{id}/resend would be accepted right now"
    )


class BhwDashboard(_DashboardBase):
    role: Literal["bhw"] = "bhw"
    immunizations_due_7d: int = Field(..., description="Scheduled doses due today..+7 days")
    immunizations_overdue: int
    immunizations_due: list[ImmunizationDueRow]
    missed_appointments_7d: int
    missed_appointments: list[MissedAppointmentRow]
    sms_today_sent: int
    sms_today_failed: int
    failed_sms: list[FailedSmsRow]
    appointments_today_count: int
    appointments_today: list[AppointmentRow] = Field(
        ..., description="Today's appointments, earliest first (for Start visit)"
    )
    previsit_forms_waiting: int
    visits_logged_by_me_week: int
    patients_without_active_card: int
    reminder_effect: ReminderEffectResponse = Field(
        ..., description="Return rate after SMS reminders, last 30 days (counts only)"
    )


# ---------------------------------------------------------------------------
# Admin (model B: system and registrations, nothing clinical)
# ---------------------------------------------------------------------------


class ApplicationRow(BaseModel):
    id: str
    reference_number: str
    applicant_name: str | None
    created_at: datetime


class StaffAccounts(BaseModel):
    active: int
    inactive: int
    not_signed_in_30d: int = Field(..., description="Active users with no sign-in for 30+ days")


class SecurityAlert(BaseModel):
    check_name: str
    detail: str
    severity: str


class AdminDashboard(_DashboardBase):
    role: Literal["admin"] = "admin"
    system: SystemStatusResponse
    online_applications_pending: int
    previsit_forms_waiting: int
    recent_applications: list[ApplicationRow]
    staff: StaffAccounts
    active_patients: int
    security_alerts: list[SecurityAlert]
    reminder_effect: ReminderEffectResponse = Field(
        ..., description="Return rate after SMS reminders, last 30 days (counts only)"
    )


# ---------------------------------------------------------------------------
# Admin staff (front desk)
# ---------------------------------------------------------------------------


class AdminStaffDashboard(_DashboardBase):
    role: Literal["admin_staff"] = "admin_staff"
    appointments_today_count: int
    intake_done_today: int
    previsit_forms_waiting: int
    appointments_today: list[AppointmentRow]
    appointments_tomorrow_count: int


RoleDashboard = Annotated[
    PhysicianDashboard | BhwDashboard | AdminDashboard | AdminStaffDashboard,
    Field(discriminator="role"),
]
