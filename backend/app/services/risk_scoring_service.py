"""
Risk scoring service — statistical feature extraction layer.

Separates DB queries from AI calls:
  - compute_patient_no_show_rate()     — historical no-show rate from DB
  - compute_visit_frequency_90d()      — engagement indicator from DB
  - get_upcoming_appointments_for_scoring() — feature dict list, no PHI
  - run_illness_anomaly_detection()    — rolling z-score per condition

PHI contract: functions in this module extract only aggregate features
and non-PHI identifiers (patient_code, boolean flags, counts).
patient_id is retained solely for the dashboard link — it is NOT included
in any OpenAI prompt.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.visit import Visit


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


async def compute_patient_no_show_rate(
    db: AsyncSession, patient_id: uuid.UUID
) -> float:
    """
    Returns missed / total past appointments for the given patient.
    Returns 0.0 if the patient has no appointment history.
    Only considers appointments with scheduled_at < now() (past appointments).
    """
    now = _now_utc()
    total_stmt = select(func.count(Appointment.id)).where(
        Appointment.patient_id == patient_id,
        Appointment.scheduled_at < now,
        Appointment.status.in_(["completed", "missed", "cancelled"]),
    )
    missed_stmt = select(func.count(Appointment.id)).where(
        Appointment.patient_id == patient_id,
        Appointment.scheduled_at < now,
        Appointment.status == "missed",
    )
    total_result = await db.execute(total_stmt)
    missed_result = await db.execute(missed_stmt)
    total = total_result.scalar_one_or_none() or 0
    missed = missed_result.scalar_one_or_none() or 0
    if total == 0:
        return 0.0
    return round(missed / total, 4)


async def compute_visit_frequency_90d(
    db: AsyncSession, patient_id: uuid.UUID
) -> int:
    """
    Returns the number of visits recorded for the patient in the last 90 days.
    Uses visits.visit_date (a TIMESTAMPTZ column — compared via date truncation).
    """
    cutoff = _now_utc() - timedelta(days=90)
    stmt = select(func.count(Visit.id)).where(
        Visit.patient_id == patient_id,
        Visit.visit_date >= cutoff,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() or 0


async def get_upcoming_appointments_for_scoring(
    db: AsyncSession,
    horizon_days: int = 7,
) -> list[dict]:  # type: ignore[type-arg]
    """
    Returns a list of feature dicts for all upcoming appointments in the
    next horizon_days days.

    Each dict contains:
      appointment_id: uuid.UUID
      patient_id: uuid.UUID          — for DB linking and dashboard URL only
      patient_code: str              — only identifier sent to OpenAI
      appointment_type: str
      scheduled_at: datetime
      lead_time_days: int
      day_of_week: int               — 0=Monday … 6=Sunday
      is_senior: bool
      is_pwd: bool
      is_pregnant: bool
      historical_no_show_rate: float — computed from DB history
      visit_frequency_90d: int       — computed from DB history

    No names, addresses, mobile numbers, or diagnosis text are included.
    """
    now = _now_utc()
    horizon = now + timedelta(days=horizon_days)

    stmt = (
        select(Appointment, Patient)
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(
            Appointment.scheduled_at > now,
            Appointment.scheduled_at <= horizon,
            Appointment.status.in_(["pending", "confirmed"]),
            Patient.is_active.is_(True),
        )
        .order_by(Appointment.scheduled_at.asc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    features: list[dict] = []  # type: ignore[type-arg]
    for appt, patient in rows:
        no_show_rate = await compute_patient_no_show_rate(db, patient.id)
        visit_freq = await compute_visit_frequency_90d(db, patient.id)
        lead_time_days = max(0, (appt.scheduled_at - now).days)

        features.append(
            {
                "appointment_id": appt.id,
                "patient_id": patient.id,
                "patient_code": patient.patient_code,
                "appointment_type": appt.appointment_type,
                "scheduled_at": appt.scheduled_at,
                "lead_time_days": lead_time_days,
                "day_of_week": appt.scheduled_at.weekday(),
                "is_senior": bool(patient.is_senior),
                "is_pwd": bool(patient.is_pwd),
                "is_pregnant": bool(patient.is_pregnant),
                "historical_no_show_rate": no_show_rate,
                "visit_frequency_90d": visit_freq,
            }
        )

    return features


async def run_illness_anomaly_detection(
    db: AsyncSession,
    lookback_weeks: int = 8,
) -> list[dict]:  # type: ignore[type-arg]
    """
    For each condition tracked in medical_history:
      1. Retrieve weekly case counts for the last lookback_weeks ISO weeks.
      2. Treat the most recent week as current_count.
      3. Compute mean and stdev of all previous weeks (weeks[:-1]).
      4. Compute z_score = (current_count - mean) / stdev.
         When stdev == 0 (no variance), z_score = 0.
      5. Return conditions where z_score >= 2.0.

    Returns a list of dicts:
      condition_name: str
      current_count: int
      baseline_mean: float
      baseline_stdev: float
      z_score: float
      week_label: str    — ISO week of current_count, e.g. "2026-W30"

    No patient-identifying information is returned.
    Uses PostgreSQL date_trunc('week', ...) via func.date_trunc.
    MedicalHistory.created_at is a TIMESTAMPTZ column.
    """
    now = _now_utc()
    cutoff = now - timedelta(weeks=lookback_weeks)

    # Aggregate: condition_name, ISO week label, count per week
    week_expr = func.to_char(
        func.date_trunc("week", MedicalHistory.created_at),
        "IYYY-\"W\"IW",
    ).label("week_label")
    stmt = (
        select(
            MedicalHistory.condition_name,
            week_expr,
            func.count(MedicalHistory.id).label("case_count"),
        )
        .where(MedicalHistory.created_at >= cutoff)
        .group_by(MedicalHistory.condition_name, week_expr)
        .order_by(MedicalHistory.condition_name, week_expr)
    )

    result = await db.execute(stmt)
    rows = result.all()

    # Group by condition
    by_condition: dict[str, list[tuple[str, int]]] = {}
    for condition_name, week_label, case_count in rows:
        by_condition.setdefault(condition_name, []).append(
            (week_label, int(case_count))
        )

    # Current ISO week label
    current_week_label = now.strftime("%G-W%V")

    anomalies: list[dict] = []  # type: ignore[type-arg]
    for condition_name, weekly_counts in by_condition.items():
        if len(weekly_counts) < 2:
            # Need at least one baseline week and one current week
            continue

        # The most recent entry is the current week if it matches
        # the current ISO week label; otherwise current_count = 0
        last_week_label, last_count = weekly_counts[-1]
        if last_week_label == current_week_label:
            current_count = last_count
            baseline_series = [c for _, c in weekly_counts[:-1]]
        else:
            current_count = 0
            baseline_series = [c for _, c in weekly_counts]

        if not baseline_series:
            continue

        baseline_mean = sum(baseline_series) / len(baseline_series)
        variance = sum((x - baseline_mean) ** 2 for x in baseline_series) / len(
            baseline_series
        )
        baseline_stdev = math.sqrt(variance)

        z_score = (
            (current_count - baseline_mean) / baseline_stdev
            if baseline_stdev > 0
            else 0.0
        )

        if z_score >= 2.0:
            anomalies.append(
                {
                    "condition_name": condition_name,
                    "current_count": current_count,
                    "baseline_mean": round(baseline_mean, 2),
                    "baseline_stdev": round(baseline_stdev, 2),
                    "z_score": round(z_score, 3),
                    "week_label": current_week_label,
                }
            )

    return anomalies
