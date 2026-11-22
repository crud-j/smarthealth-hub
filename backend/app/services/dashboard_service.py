"""
Role-based dashboard content for GET /api/v1/dashboard/me.

One builder per role. The server decides what a role sees (the frontend only
renders it), so the rules live here next to the queries:

  physician   — visits logged today with no diagnosis yet (the waiting
                queue), consultations done, follow-ups due, today's
                appointments, top conditions this month
  bhw         — today's appointments, immunizations due/overdue (with
                sitio/purok), missed appointments, today's SMS, failed
                reminders, pre-visit
                drafts, own visits this week, patients without a card,
                return rate after SMS reminders (last 30 days)
  admin       — system status, registrations to review, staff accounts,
                security alerts, return rate after SMS reminders (counts
                only).  Admin model B: no visits, vital signs or conditions.
  admin_staff — today's appointments with pre-visit form status, drafts

PHI: encrypted columns (visits.diagnosis / treatment_notes, medical-history
notes, allergies, known conditions) are never selected; the waiting queue
only tests ``diagnosis IS NULL``.  Lists carry patient names/codes, like
GET /patients, which is not PHI-VIEW audited either; opening a patient from
the dashboard goes through the audited detail endpoints.

"Today" and "this week" (Monday start) are Manila calendar dates.
Queries run one after another on the single request session.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import ForbiddenError
from app.models.appointment import Appointment
from app.models.health_card import HealthCard
from app.models.immunization import Immunization
from app.models.intake_application import IntakeApplication
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.user import User
from app.models.visit import Visit
from app.schemas.analytics import ReminderEffectResponse
from app.schemas.dashboard import (
    AdminDashboard,
    AdminStaffDashboard,
    ApplicationRow,
    AppointmentRow,
    BhwDashboard,
    ConditionCount,
    FailedSmsRow,
    ImmunizationDueRow,
    MissedAppointmentRow,
    PatientRef,
    PhysicianDashboard,
    SecurityAlert,
    StaffAccounts,
    WaitingVisit,
)
from app.services import (
    analytics_service,
    audit_anomaly_service,
    intake_service,
    sms_resend_service,
)
from app.services.system_status_service import collect_system_status

MANILA = ZoneInfo("Asia/Manila")

LIST_LIMIT = 10
IMMUNIZATION_LIST_LIMIT = 15
FOLLOW_UP_DAYS = 7
MISSED_LOOKBACK_DAYS = 7
FAILED_SMS_LOOKBACK_DAYS = 7
INACTIVE_STAFF_DAYS = 30
REMINDER_EFFECT_DAYS = 30

#: Appointment types a physician follows up (plus scheduled immunizations).
FOLLOW_UP_TYPES = ("prenatal", "follow_up")
#: Appointments still on the day's schedule (cancelled ones are not).
OPEN_DAY_STATUSES = ("pending", "confirmed", "completed", "missed")
#: Appointments that may still happen.
UPCOMING_STATUSES = ("pending", "confirmed")
SMS_SENT_STATUSES = ("sent", "delivered", "replied")

DashboardModel = PhysicianDashboard | BhwDashboard | AdminDashboard | AdminStaffDashboard


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------


class _Clock:
    """Manila calendar boundaries for one request, as aware datetimes."""

    def __init__(self, now: datetime) -> None:
        self.now = now
        self.today: date = now.astimezone(MANILA).date()
        self.day_start = self.start_of(self.today)
        self.day_end = self.start_of(self.today + timedelta(days=1))
        self.week_start = self.start_of(self.today - timedelta(days=self.today.weekday()))
        self.month_start = self.start_of(self.today.replace(day=1))

    @staticmethod
    def start_of(day: date) -> datetime:
        return datetime.combine(day, time.min, tzinfo=MANILA)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _full_name(patient: Patient) -> str:
    parts = [patient.first_name, patient.middle_name, patient.last_name]
    return " ".join(p for p in parts if p)


def _ref(patient: Patient) -> PatientRef:
    return PatientRef(
        id=str(patient.id), patient_code=patient.patient_code, full_name=_full_name(patient)
    )


def _age(birth_date: date | None, today: date) -> int | None:
    if birth_date is None:
        return None
    return (
        today.year
        - birth_date.year
        - ((today.month, today.day) < (birth_date.month, birth_date.day))
    )


def _first_name(user: User) -> str:
    return (user.full_name or "").split(" ")[0] if user.full_name else ""


def _float(value: object) -> float | None:
    return float(value) if value is not None else None  # type: ignore[arg-type]


async def _count(db: AsyncSession, stmt: sa.Select[Any]) -> int:
    # Select[Any]: SQLAlchemy 2.0 types a count query as Select[tuple[int]],
    # 2.1 as Select[int]; pyproject allows both.
    return int((await db.execute(stmt)).scalar_one())


def _active_patient() -> sa.ColumnElement[bool]:
    """
    A patient in daily work: not deactivated and not archived.

    Both take no new visits, doses or bookings (patient_service.
    require_patient_in_use) and the Patients page hides archived ones, so
    dashboard lists and counts leave both out.
    """
    return and_(Patient.is_active.is_(True), Patient.archived_at.is_(None))


async def _reminder_effect(db: AsyncSession, clock: _Clock) -> ReminderEffectResponse:
    """Return rate after SMS reminders, last 30 Manila days (counts only)."""
    data = await analytics_service.get_reminder_effect_last_days(
        db, REMINDER_EFFECT_DAYS, now=clock.now
    )
    return ReminderEffectResponse.model_validate(data)


async def _previsit_drafts_waiting(db: AsyncSession) -> int:
    # Same rule as GET /intake/pending (has_draft): unused, unexpired tokens
    # whose form has data.  Checked in Python because a JSONB column set to
    # None can be stored as JSON null rather than SQL NULL.
    tokens = await intake_service.list_pending_intakes(db)
    return sum(1 for t in tokens if t.draft_data)


async def _appointments_on(
    db: AsyncSession, start: datetime, end: datetime, limit: int
) -> tuple[int, list[AppointmentRow]]:
    where = and_(
        Appointment.scheduled_at >= start,
        Appointment.scheduled_at < end,
        Appointment.status.in_(OPEN_DAY_STATUSES),
        _active_patient(),
    )
    total = await _count(
        db, select(func.count()).select_from(Appointment).join(Patient).where(where)
    )
    rows = (
        await db.execute(
            select(Appointment, Patient)
            .join(Patient, Appointment.patient_id == Patient.id)
            .where(where)
            .order_by(Appointment.scheduled_at.asc())
            .limit(limit)
        )
    ).all()
    return total, [
        AppointmentRow(
            id=str(a.id),
            patient=_ref(p),
            appointment_type=a.appointment_type,
            scheduled_at=a.scheduled_at,
            status=a.status,
            intake_completed=a.intake_completed,
        )
        for a, p in rows
    ]


# ---------------------------------------------------------------------------
# Physician
# ---------------------------------------------------------------------------


async def build_physician(db: AsyncSession, user: User, clock: _Clock) -> PhysicianDashboard:
    today_visit = and_(
        Visit.visit_date >= clock.day_start, Visit.visit_date < clock.day_end, _active_patient()
    )
    waiting_where = and_(today_visit, Visit.diagnosis.is_(None))

    waiting_count = await _count(
        db, select(func.count()).select_from(Visit).join(Patient).where(waiting_where)
    )
    recorder = aliased(User)
    waiting_rows = (
        await db.execute(
            select(
                Visit.id,
                Visit.visit_date,
                Visit.visit_type,
                Visit.temperature,
                Visit.blood_pressure,
                Visit.pulse_rate,
                Visit.oxygen_saturation,
                Visit.weight_kg,
                Patient,
                recorder.full_name.label("recorded_by_name"),
            )
            .join(Patient, Visit.patient_id == Patient.id)
            .outerjoin(recorder, Visit.recorded_by == recorder.id)
            .where(waiting_where)
            .order_by(Visit.visit_date.asc())
            .limit(LIST_LIMIT)
        )
    ).all()
    waiting = [
        WaitingVisit(
            visit_id=str(r.id),
            patient=_ref(r.Patient),
            age=_age(r.Patient.birth_date, clock.today),
            visit_date=r.visit_date,
            visit_type=r.visit_type,
            recorded_by_name=r.recorded_by_name,
            temperature=_float(r.temperature),
            blood_pressure=r.blood_pressure,
            pulse_rate=r.pulse_rate,
            oxygen_saturation=r.oxygen_saturation,
            weight_kg=_float(r.weight_kg),
        )
        for r in waiting_rows
    ]

    diagnosed = Visit.diagnosis.is_not(None)
    consultations_today = await _count(
        db, select(func.count()).select_from(Visit).join(Patient).where(today_visit, diagnosed)
    )
    consultations_week = await _count(
        db,
        select(func.count())
        .select_from(Visit)
        .join(Patient)
        .where(
            Visit.visit_date >= clock.week_start,
            Visit.visit_date < clock.day_end,
            diagnosed,
            _active_patient(),
        ),
    )

    follow_up_end = clock.start_of(clock.today + timedelta(days=FOLLOW_UP_DAYS + 1))
    follow_up_appointments = await _count(
        db,
        select(func.count())
        .select_from(Appointment)
        .join(Patient)
        .where(
            Appointment.appointment_type.in_(FOLLOW_UP_TYPES),
            Appointment.status.in_(UPCOMING_STATUSES),
            Appointment.scheduled_at >= clock.day_start,
            Appointment.scheduled_at < follow_up_end,
            _active_patient(),
        ),
    )
    doses_due = await _count(
        db,
        select(func.count())
        .select_from(Immunization)
        .join(Patient)
        .where(
            Immunization.status == "scheduled",
            Immunization.next_due_date >= clock.today,
            Immunization.next_due_date <= clock.today + timedelta(days=FOLLOW_UP_DAYS),
            _active_patient(),
        ),
    )

    appointments_today_count, appointments_today = await _appointments_on(
        db, clock.day_start, clock.day_end, LIST_LIMIT
    )

    count_col = func.count(MedicalHistory.id).label("cnt")
    condition_rows = (
        await db.execute(
            select(MedicalHistory.condition_name, count_col)
            .where(MedicalHistory.created_at >= clock.month_start)
            .group_by(MedicalHistory.condition_name)
            .order_by(count_col.desc(), MedicalHistory.condition_name.asc())
            .limit(5)
        )
    ).all()

    return PhysicianDashboard(
        first_name=_first_name(user),
        today=clock.today,
        waiting_count=waiting_count,
        waiting=waiting,
        consultations_today=consultations_today,
        consultations_week=consultations_week,
        follow_ups_due_7d=follow_up_appointments + doses_due,
        appointments_today_count=appointments_today_count,
        appointments_today=appointments_today,
        top_conditions_month=[
            ConditionCount(condition_name=name, count=int(cnt)) for name, cnt in condition_rows
        ],
    )


# ---------------------------------------------------------------------------
# BHW
# ---------------------------------------------------------------------------


def _sms_kind(log: SmsLog) -> Literal["appointment", "immunization", "other"]:
    if log.appointment_id is not None:
        return "appointment"
    if log.immunization_id is not None:
        return "immunization"
    return "other"


async def build_bhw(db: AsyncSession, user: User, clock: _Clock) -> BhwDashboard:
    week_end = clock.today + timedelta(days=FOLLOW_UP_DAYS)
    scheduled = and_(
        Immunization.status == "scheduled",
        Immunization.next_due_date.is_not(None),
        _active_patient(),
    )
    due_7d = await _count(
        db,
        select(func.count())
        .select_from(Immunization)
        .join(Patient)
        .where(
            scheduled,
            Immunization.next_due_date >= clock.today,
            Immunization.next_due_date <= week_end,
        ),
    )
    overdue = await _count(
        db,
        select(func.count())
        .select_from(Immunization)
        .join(Patient)
        .where(scheduled, Immunization.next_due_date < clock.today),
    )
    dose_rows = (
        await db.execute(
            select(Immunization, Patient)
            .join(Patient, Immunization.patient_id == Patient.id)
            .where(scheduled, Immunization.next_due_date <= week_end)
            .order_by(Immunization.next_due_date.asc(), Patient.sitio_purok.asc())
            .limit(IMMUNIZATION_LIST_LIMIT)
        )
    ).all()
    immunizations_due = [
        ImmunizationDueRow(
            id=str(i.id),
            patient=_ref(p),
            sitio_purok=p.sitio_purok,
            vaccine_name=i.vaccine_name,
            dose_number=i.dose_number,
            next_due_date=i.next_due_date,  # type: ignore[arg-type]  # filtered NOT NULL
            overdue=i.next_due_date < clock.today,  # type: ignore[operator]
        )
        for i, p in dose_rows
    ]

    missed_where = and_(
        Appointment.status == "missed",
        Appointment.scheduled_at
        >= clock.start_of(clock.today - timedelta(days=MISSED_LOOKBACK_DAYS)),
        Appointment.scheduled_at < clock.day_end,
        _active_patient(),
    )
    missed_count = await _count(
        db, select(func.count()).select_from(Appointment).join(Patient).where(missed_where)
    )
    missed_rows = (
        await db.execute(
            select(Appointment, Patient)
            .join(Patient, Appointment.patient_id == Patient.id)
            .where(missed_where)
            .order_by(Appointment.scheduled_at.desc())
            .limit(LIST_LIMIT)
        )
    ).all()

    sms_today = and_(SmsLog.created_at >= clock.day_start, SmsLog.created_at < clock.day_end)
    sms_sent = await _count(
        db,
        select(func.count())
        .select_from(SmsLog)
        .where(sms_today, SmsLog.status.in_(SMS_SENT_STATUSES)),
    )
    sms_failed = await _count(
        db, select(func.count()).select_from(SmsLog).where(sms_today, SmsLog.status == "failed")
    )
    failed_rows = (
        await db.execute(
            select(SmsLog, Patient)
            .outerjoin(Patient, SmsLog.patient_id == Patient.id)
            .where(
                SmsLog.status == "failed",
                SmsLog.created_at
                >= clock.start_of(clock.today - timedelta(days=FAILED_SMS_LOOKBACK_DAYS)),
            )
            .order_by(SmsLog.created_at.desc())
            .limit(5)
        )
    ).all()

    visits_mine = await _count(
        db,
        select(func.count())
        .select_from(Visit)
        .where(
            Visit.recorded_by == user.id,
            Visit.visit_date >= clock.week_start,
            Visit.visit_date < clock.day_end,
        ),
    )

    has_active_card = (
        select(HealthCard.id)
        .where(HealthCard.patient_id == Patient.id, HealthCard.status == "active")
        .exists()
    )
    without_card = await _count(
        db, select(func.count()).select_from(Patient).where(_active_patient(), ~has_active_card)
    )
    appointments_today_count, appointments_today = await _appointments_on(
        db, clock.day_start, clock.day_end, LIST_LIMIT
    )

    # Resend state per failed SMS (same rules as POST /sms/logs/{id}/resend).
    already_resent = await sms_resend_service.resent_ids(db, [log.id for log, _p in failed_rows])
    failed_sms: list[FailedSmsRow] = []
    for log, p in failed_rows:
        resent = log.id in already_resent
        problem = await sms_resend_service.resend_problem(db, log, now=clock.now, resent=resent)
        failed_sms.append(
            FailedSmsRow(
                id=str(log.id),
                patient=_ref(p) if p is not None else None,
                kind=_sms_kind(log),
                created_at=log.created_at,
                reason=log.error_detail[:120] if log.error_detail else None,
                resent=resent,
                can_resend=problem is None,
            )
        )

    return BhwDashboard(
        first_name=_first_name(user),
        today=clock.today,
        immunizations_due_7d=due_7d,
        immunizations_overdue=overdue,
        immunizations_due=immunizations_due,
        missed_appointments_7d=missed_count,
        missed_appointments=[
            MissedAppointmentRow(
                id=str(a.id),
                patient=_ref(p),
                mobile_number=p.mobile_number,
                appointment_type=a.appointment_type,
                scheduled_at=a.scheduled_at,
            )
            for a, p in missed_rows
        ],
        sms_today_sent=sms_sent,
        sms_today_failed=sms_failed,
        failed_sms=failed_sms,
        appointments_today_count=appointments_today_count,
        appointments_today=appointments_today,
        previsit_forms_waiting=await _previsit_drafts_waiting(db),
        visits_logged_by_me_week=visits_mine,
        patients_without_active_card=without_card,
        reminder_effect=await _reminder_effect(db, clock),
    )


# ---------------------------------------------------------------------------
# Admin (model B)
# ---------------------------------------------------------------------------


async def build_admin(db: AsyncSession, user: User, clock: _Clock) -> AdminDashboard:
    system = await collect_system_status(db)

    pending = IntakeApplication.status == "pending"
    applications_pending = await _count(
        db, select(func.count()).select_from(IntakeApplication).where(pending)
    )
    application_rows = (
        (
            await db.execute(
                select(IntakeApplication)
                .where(pending)
                .order_by(IntakeApplication.created_at.desc())
                .limit(5)
            )
        )
        .scalars()
        .all()
    )

    stale_before = clock.now - timedelta(days=INACTIVE_STAFF_DAYS)
    staff = StaffAccounts(
        active=await _count(db, select(func.count()).select_from(User).where(User.is_active)),
        inactive=await _count(db, select(func.count()).select_from(User).where(~User.is_active)),
        not_signed_in_30d=await _count(
            db,
            select(func.count())
            .select_from(User)
            .where(
                User.is_active,
                sa.or_(User.last_login_at.is_(None), User.last_login_at < stale_before),
            ),
        ),
    )

    alerts = [
        *await audit_anomaly_service.check_login_failure_burst(db),
        *await audit_anomaly_service.check_phi_view_burst(db),
        *await audit_anomaly_service.check_after_hours_deletes(db),
    ]

    def applicant(app: IntakeApplication) -> str | None:
        fd = app.form_data or {}
        name = f"{fd.get('first_name', '')} {fd.get('last_name', '')}".strip()
        return name or None

    return AdminDashboard(
        first_name=_first_name(user),
        today=clock.today,
        system=system,
        online_applications_pending=applications_pending,
        previsit_forms_waiting=await _previsit_drafts_waiting(db),
        recent_applications=[
            ApplicationRow(
                id=str(a.id),
                reference_number=a.reference_number,
                applicant_name=applicant(a),
                created_at=a.created_at,
            )
            for a in application_rows
        ],
        staff=staff,
        active_patients=await _count(
            db, select(func.count()).select_from(Patient).where(_active_patient())
        ),
        security_alerts=[
            SecurityAlert(check_name=a.check_name, detail=a.detail, severity=a.severity)
            for a in alerts
        ],
        reminder_effect=await _reminder_effect(db, clock),
    )


# ---------------------------------------------------------------------------
# Admin staff (front desk)
# ---------------------------------------------------------------------------


async def build_admin_staff(db: AsyncSession, user: User, clock: _Clock) -> AdminStaffDashboard:
    count_today, rows_today = await _appointments_on(db, clock.day_start, clock.day_end, 15)
    intake_done = await _count(
        db,
        select(func.count())
        .select_from(Appointment)
        .join(Patient)
        .where(
            Appointment.scheduled_at >= clock.day_start,
            Appointment.scheduled_at < clock.day_end,
            Appointment.status.in_(OPEN_DAY_STATUSES),
            Appointment.intake_completed.is_(True),
            _active_patient(),
        ),
    )
    tomorrow_count, _rows = await _appointments_on(
        db, clock.day_end, clock.start_of(clock.today + timedelta(days=2)), 0
    )
    return AdminStaffDashboard(
        first_name=_first_name(user),
        today=clock.today,
        appointments_today_count=count_today,
        intake_done_today=intake_done,
        previsit_forms_waiting=await _previsit_drafts_waiting(db),
        appointments_today=rows_today,
        appointments_tomorrow_count=tomorrow_count,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

_BUILDERS: dict[str, Callable[[AsyncSession, User, _Clock], Awaitable[DashboardModel]]] = {
    "physician": build_physician,
    "bhw": build_bhw,
    "admin": build_admin,
    "admin_staff": build_admin_staff,
}


async def build_dashboard(
    db: AsyncSession, user: User, now: datetime | None = None
) -> DashboardModel:
    """Return the dashboard for the user's role (raises ForbiddenError for unknown roles)."""
    builder = _BUILDERS.get(user.role.name)
    if builder is None:
        raise ForbiddenError(f"No dashboard for role '{user.role.name}'.")
    return await builder(db, user, _Clock(now or datetime.now(tz=UTC)))
