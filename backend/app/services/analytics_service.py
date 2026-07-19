"""
Analytics aggregation service — Phase 5 implementation.

All functions accept an ``AsyncSession`` and return plain Python dicts/lists.
They are deliberately kept pure (no HTTP knowledge) so they can be called from
background jobs (Celery) or from FastAPI endpoints alike.

Aggregation design principles:
  - Every query uses SQLAlchemy 2.0 select() style — no legacy session.query().
  - All queries are async (AsyncSession).
  - Empty tables return zeros/empty lists, never raise exceptions.
  - No PHI rows are returned — only aggregate counts and percentages.
  - date_trunc() is called via func.date_trunc() which passes through to
    PostgreSQL directly (asyncpg dialect).

Column name reference (actual ORM model names, not the task description names):
  visits.visit_date            — NOT visited_at
  appointments.scheduled_at   — NOT scheduled_date
  immunizations.date_administered — NOT administered_at

SDP Reference: Section 6.7 (Analytics & Reporting)
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import and_

from app.models.appointment import Appointment
from app.models.immunization import Immunization
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.visit import Visit

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_VALID_GROUP_BY: set[str] = {"week", "month", "year"}


def _now_utc() -> datetime:
    """Return current UTC datetime (timezone-aware)."""
    return datetime.now(tz=timezone.utc)


def _start_of_week(dt: datetime) -> datetime:
    """Return the start of the ISO week (Monday 00:00:00 UTC) for ``dt``."""
    monday = dt - timedelta(days=dt.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_month(dt: datetime) -> datetime:
    """Return the first instant of the current calendar month."""
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _age_group_label(age_years: int) -> str:
    """Map an integer age to a human-readable age bucket label."""
    if age_years <= 1:
        return "0-1"
    if age_years <= 5:
        return "2-5"
    if age_years <= 11:
        return "6-11"
    if age_years <= 17:
        return "12-17"
    if age_years <= 59:
        return "18-59"
    return "60+"


def _age_group_from_birth_date(birth_date: date) -> str:
    """Calculate age group label from a birth_date (date object)."""
    today = date.today()
    age = (
        today.year
        - birth_date.year
        - ((today.month, today.day) < (birth_date.month, birth_date.day))
    )
    return _age_group_label(age)


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def get_dashboard_overview(db: AsyncSession) -> dict[str, int]:
    """
    Return aggregate dashboard counters for the overview panel.

    Returns a dict with keys:
      total_active_patients        int
      visits_this_week             int
      visits_this_month            int
      upcoming_appointments_count  int
      immunizations_due_this_week  int

    Never raises on empty tables — all counts default to 0.
    """
    now = _now_utc()
    week_start = _start_of_week(now)
    month_start = _start_of_month(now)
    # next_due_date is a DATE column — compare against a Python date, not datetime.
    today_date = now.date()
    next_week_date = today_date + timedelta(days=7)

    # -- Total active patients -------------------------------------------------
    result = await db.execute(
        select(func.count(Patient.id)).where(Patient.is_active.is_(True))
    )
    total_active_patients: int = result.scalar() or 0

    # -- Visits this ISO week --------------------------------------------------
    result = await db.execute(
        select(func.count(Visit.id)).where(Visit.visit_date >= week_start)
    )
    visits_this_week: int = result.scalar() or 0

    # -- Visits this calendar month --------------------------------------------
    result = await db.execute(
        select(func.count(Visit.id)).where(Visit.visit_date >= month_start)
    )
    visits_this_month: int = result.scalar() or 0

    # -- Upcoming appointments (pending + confirmed, future) -------------------
    result = await db.execute(
        select(func.count(Appointment.id)).where(
            and_(
                Appointment.scheduled_at >= now,
                Appointment.status.in_(["pending", "confirmed"]),
            )
        )
    )
    upcoming_appointments_count: int = result.scalar() or 0

    # -- Immunizations due within 7 days and not completed --------------------
    # next_due_date is a DATE column; compare against Python date objects so
    # asyncpg can bind them correctly without an explicit CAST.
    result = await db.execute(
        select(func.count(Immunization.id)).where(
            and_(
                Immunization.next_due_date >= today_date,
                Immunization.next_due_date <= next_week_date,
                Immunization.status != "completed",
            )
        )
    )
    immunizations_due_this_week: int = result.scalar() or 0

    return {
        "total_active_patients": total_active_patients,
        "visits_this_week": visits_this_week,
        "visits_this_month": visits_this_month,
        "upcoming_appointments_count": upcoming_appointments_count,
        "immunizations_due_this_week": immunizations_due_this_week,
    }


async def get_vaccination_coverage(db: AsyncSession) -> dict[str, list[dict[str, Any]]]:
    """
    Return vaccination coverage statistics grouped two ways:

      by_vaccine:    one row per distinct vaccine_name (age_group='ALL')
      by_age_group:  one row per patient age bucket (vaccine_name='ALL')

    Coverage logic:
      - total_eligible: total distinct patients in the immunizations table per group
        (a patient who has ever had any immunization dose is "eligible" in that
         context; the percentage shows completed vs. all tracked patients).
      - completed: patients with at least one immunization record where status='completed'.
      - coverage_pct: completed / total_eligible * 100, rounded to 1 decimal.

    Returns:
        {
            "by_vaccine": [{"vaccine_name": ..., "age_group": "ALL", ...}, ...],
            "by_age_group": [{"vaccine_name": "ALL", "age_group": ..., ...}, ...],
        }
    """
    # -- By vaccine name -------------------------------------------------------
    # Query: for each vaccine_name, count total and completed patient IDs.
    by_vaccine_q = await db.execute(
        select(
            Immunization.vaccine_name,
            func.count(Immunization.patient_id.distinct()).label("total_eligible"),
            func.count(
                case(
                    (Immunization.status == "completed", Immunization.patient_id),
                    else_=None,
                ).distinct()
            ).label("completed"),
        ).group_by(Immunization.vaccine_name)
    )
    by_vaccine_rows = by_vaccine_q.fetchall()

    by_vaccine: list[dict[str, Any]] = []
    for row in by_vaccine_rows:
        total = row.total_eligible or 0
        completed = row.completed or 0
        pct = round((completed / total * 100) if total > 0 else 0.0, 1)
        by_vaccine.append(
            {
                "vaccine_name": row.vaccine_name,
                "age_group": "ALL",
                "total_eligible": total,
                "completed": completed,
                "coverage_pct": pct,
            }
        )

    # -- By age group ----------------------------------------------------------
    # Join immunizations → patients to get birth_date, then compute age groups
    # in Python (avoids DB-level date arithmetic across driver dialects).
    # We load only (patient_id, birth_date, status) — no PHI content.
    age_q = await db.execute(
        select(
            Immunization.patient_id,
            Patient.birth_date,
            Immunization.status,
        ).join(Patient, Immunization.patient_id == Patient.id)
    )
    age_rows = age_q.fetchall()

    # Aggregate into a nested dict: {age_group: {"total_patients": set, "completed": set}}
    age_buckets: dict[str, dict[str, set[Any]]] = {}
    for row in age_rows:
        group = _age_group_from_birth_date(row.birth_date)
        if group not in age_buckets:
            age_buckets[group] = {"all_patients": set(), "completed_patients": set()}
        age_buckets[group]["all_patients"].add(row.patient_id)
        if row.status == "completed":
            age_buckets[group]["completed_patients"].add(row.patient_id)

    _AGE_GROUP_ORDER = ["0-1", "2-5", "6-11", "12-17", "18-59", "60+"]
    by_age_group: list[dict[str, Any]] = []
    for grp in _AGE_GROUP_ORDER:
        if grp not in age_buckets:
            continue
        total = len(age_buckets[grp]["all_patients"])
        completed = len(age_buckets[grp]["completed_patients"])
        pct = round((completed / total * 100) if total > 0 else 0.0, 1)
        by_age_group.append(
            {
                "vaccine_name": "ALL",
                "age_group": grp,
                "total_eligible": total,
                "completed": completed,
                "coverage_pct": pct,
            }
        )

    return {"by_vaccine": by_vaccine, "by_age_group": by_age_group}


async def get_illness_trends(
    db: AsyncSession,
    from_date: date,
    to_date: date,
    group_by: Literal["week", "month", "year"] = "month",
) -> list[dict[str, Any]]:
    """
    Return medical condition frequency trends grouped by time period.

    Args:
        db:        Async DB session.
        from_date: Inclusive start date for medical_history.created_at filter.
        to_date:   Inclusive end date.
        group_by:  Time bucket granularity — 'week', 'month', or 'year'.

    Returns:
        List of dicts:
        [{"period": "2026-01", "condition_name": "Hypertension", "count": 12}, ...]

        Ordered by period ASC, then count DESC within each period.
        Returns [] if no matching records exist.

    Column used: medical_history.created_at (TIMESTAMPTZ) and
                 medical_history.condition_name (VARCHAR 150).
    """
    if group_by not in _VALID_GROUP_BY:
        group_by = "month"

    # Use PostgreSQL date_trunc to bucket by period.
    # cast created_at to date for the truncation so we get a clean DATE back.
    truncated = func.date_trunc(group_by, MedicalHistory.created_at).label("period_ts")

    # Convert from_date / to_date to datetime for TIMESTAMPTZ comparisons.
    from_dt = datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc)
    to_dt = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=timezone.utc)

    q = await db.execute(
        select(
            truncated,
            MedicalHistory.condition_name,
            func.count(MedicalHistory.id).label("cnt"),
        )
        .where(
            and_(
                MedicalHistory.created_at >= from_dt,
                MedicalHistory.created_at <= to_dt,
            )
        )
        .group_by(truncated, MedicalHistory.condition_name)
        .order_by(truncated.asc(), func.count(MedicalHistory.id).desc())
    )
    rows = q.fetchall()

    result: list[dict[str, Any]] = []
    for row in rows:
        period_ts: datetime = row.period_ts
        if group_by == "week":
            # ISO week label: "2026-W03"
            label = f"{period_ts.year}-W{period_ts.isocalendar()[1]:02d}"
        elif group_by == "month":
            label = f"{period_ts.year}-{period_ts.month:02d}"
        else:
            label = str(period_ts.year)

        result.append(
            {
                "period": label,
                "condition_name": row.condition_name,
                "count": row.cnt,
            }
        )

    return result


async def get_appointment_no_show_rate(
    db: AsyncSession,
    from_date: date,
    to_date: date,
) -> list[dict[str, Any]]:
    """
    Return missed-appointment (no-show) statistics per appointment_type.

    Args:
        db:        Async DB session.
        from_date: Inclusive start date for appointments.scheduled_at.
        to_date:   Inclusive end date.

    Returns:
        List of dicts:
        [{"appointment_type": "consultation", "total": 50, "missed": 8, "no_show_rate": 16.0}, ...]

        Returns [] if no appointments exist in the date range.

    Column used: appointments.scheduled_at (TIMESTAMPTZ).
    Missed status: appointments.status = 'missed'.
    """
    from_dt = datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc)
    to_dt = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=timezone.utc)

    q = await db.execute(
        select(
            Appointment.appointment_type,
            func.count(Appointment.id).label("total"),
            func.count(
                case(
                    (Appointment.status == "missed", Appointment.id),
                    else_=None,
                )
            ).label("missed"),
        )
        .where(
            and_(
                Appointment.scheduled_at >= from_dt,
                Appointment.scheduled_at <= to_dt,
            )
        )
        .group_by(Appointment.appointment_type)
        .order_by(Appointment.appointment_type)
    )
    rows = q.fetchall()

    result: list[dict[str, Any]] = []
    for row in rows:
        total = row.total or 0
        missed = row.missed or 0
        rate = round((missed / total * 100) if total > 0 else 0.0, 1)
        result.append(
            {
                "appointment_type": row.appointment_type,
                "total": total,
                "missed": missed,
                "no_show_rate": rate,
            }
        )

    return result


async def export_report_data(
    db: AsyncSession,
    report_type: Literal["patients", "visits", "immunizations", "appointments"],
    from_date: date,
    to_date: date,
) -> list[dict[str, Any]]:
    """
    Return raw tabular data for CSV/PDF export.

    Args:
        db:          Async DB session.
        report_type: One of 'patients', 'visits', 'immunizations', 'appointments'.
        from_date:   Inclusive start date (applied to the primary date column).
        to_date:     Inclusive end date.

    Returns:
        List of dicts suitable for CSV serialization.  Column names match the
        headers described in SDP Section 6.7 export endpoint.

    Column mapping (actual model names):
      visits.visit_date            (not visited_at)
      appointments.scheduled_at    (not scheduled_date)
      immunizations.date_administered (not administered_at)

    No encrypted PHI fields (diagnosis, treatment_notes, notes) are included
    in export data — only non-sensitive columns are exported.
    """
    from_dt = datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc)
    to_dt = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=timezone.utc)

    rows: list[dict[str, Any]] = []

    if report_type == "patients":
        q = await db.execute(
            select(
                Patient.id,
                Patient.patient_code,
                Patient.first_name,
                Patient.middle_name,
                Patient.last_name,
                Patient.sex,
                Patient.birth_date,
                Patient.is_active,
                Patient.created_at,
            )
            .where(
                and_(
                    Patient.created_at >= from_dt,
                    Patient.created_at <= to_dt,
                )
            )
            .order_by(Patient.last_name, Patient.first_name)
        )
        for row in q.fetchall():
            today = date.today()
            bd: date = row.birth_date
            age = (
                today.year
                - bd.year
                - ((today.month, today.day) < (bd.month, bd.day))
            )
            middle = f" {row.middle_name}" if row.middle_name else ""
            full_name = f"{row.first_name}{middle} {row.last_name}"
            rows.append(
                {
                    "id": str(row.id),
                    "patient_code": row.patient_code,
                    "full_name": full_name,
                    "sex": row.sex,
                    "age": age,
                    "is_active": row.is_active,
                    "created_at": row.created_at.isoformat(),
                }
            )

    elif report_type == "visits":
        q = await db.execute(
            select(
                Patient.patient_code,
                Patient.first_name,
                Patient.middle_name,
                Patient.last_name,
                Visit.visit_date,
                Visit.visit_type,
                Visit.chief_complaint,
            )
            .join(Patient, Visit.patient_id == Patient.id)
            .where(
                and_(
                    Visit.visit_date >= from_dt,
                    Visit.visit_date <= to_dt,
                )
            )
            .order_by(Visit.visit_date.desc())
        )
        for row in q.fetchall():
            middle = f" {row.middle_name}" if row.middle_name else ""
            full_name = f"{row.first_name}{middle} {row.last_name}"
            rows.append(
                {
                    "patient_code": row.patient_code,
                    "full_name": full_name,
                    "visited_at": row.visit_date.isoformat(),
                    "visit_type": row.visit_type,
                    "chief_complaint": row.chief_complaint or "",
                }
            )

    elif report_type == "immunizations":
        q = await db.execute(
            select(
                Patient.patient_code,
                Patient.first_name,
                Patient.middle_name,
                Patient.last_name,
                Immunization.vaccine_name,
                Immunization.dose_number,
                Immunization.date_administered,
                Immunization.next_due_date,
                Immunization.status,
            )
            .join(Patient, Immunization.patient_id == Patient.id)
            .where(
                and_(
                    Immunization.created_at >= from_dt,
                    Immunization.created_at <= to_dt,
                )
            )
            .order_by(Patient.last_name, Immunization.vaccine_name)
        )
        for row in q.fetchall():
            middle = f" {row.middle_name}" if row.middle_name else ""
            full_name = f"{row.first_name}{middle} {row.last_name}"
            rows.append(
                {
                    "patient_code": row.patient_code,
                    "full_name": full_name,
                    "vaccine_name": row.vaccine_name,
                    "dose_number": row.dose_number,
                    "administered_at": (
                        row.date_administered.isoformat()
                        if row.date_administered
                        else ""
                    ),
                    "next_due_date": (
                        row.next_due_date.isoformat() if row.next_due_date else ""
                    ),
                    "status": row.status,
                }
            )

    elif report_type == "appointments":
        q = await db.execute(
            select(
                Patient.patient_code,
                Patient.first_name,
                Patient.middle_name,
                Patient.last_name,
                Appointment.appointment_type,
                Appointment.scheduled_at,
                Appointment.status,
            )
            .join(Patient, Appointment.patient_id == Patient.id)
            .where(
                and_(
                    Appointment.scheduled_at >= from_dt,
                    Appointment.scheduled_at <= to_dt,
                )
            )
            .order_by(Appointment.scheduled_at.desc())
        )
        for row in q.fetchall():
            middle = f" {row.middle_name}" if row.middle_name else ""
            full_name = f"{row.first_name}{middle} {row.last_name}"
            rows.append(
                {
                    "patient_code": row.patient_code,
                    "full_name": full_name,
                    "appointment_type": row.appointment_type,
                    "scheduled_date": row.scheduled_at.isoformat(),
                    "status": row.status,
                }
            )

    return rows


def rows_to_csv(rows: list[dict[str, Any]]) -> str:
    """
    Serialize a list of dicts to a CSV string.

    Column order follows insertion order of the first dict's keys.
    Returns an empty string (with header only) if ``rows`` is empty.

    Args:
        rows: List of flat dicts, all sharing the same keys.

    Returns:
        A UTF-8 CSV string with a header row.
    """
    if not rows:
        return ""

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=list(rows[0].keys()),
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()
