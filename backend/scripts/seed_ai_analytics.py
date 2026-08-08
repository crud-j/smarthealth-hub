"""
seed_ai_analytics.py — Insert dummy AI analytics data for local dev/demo.

What it does:
  1. Reads all upcoming appointments (next 7 days, status pending/confirmed)
     and inserts a realistic ai_risk_scores row for each, skipping any that
     already have a score.

  2. Inserts 4 sample ai_anomaly_alerts for common barangay conditions,
     skipping any that are already active for the current ISO week.

No Celery or OpenAI required — data is computed with the same threshold
heuristics used by ai_service.py's fallback mode.

Run from the backend/ directory:
    python scripts/seed_ai_analytics.py
"""

from __future__ import annotations

import asyncio
import math
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal
from app.models.ai_anomaly_alert import AiAnomalyAlert
from app.models.ai_risk_score import AiRiskScore
from app.models.appointment import Appointment
from app.models.patient import Patient

_NOW = datetime.now(tz=timezone.utc)
_CURRENT_WEEK = _NOW.strftime("%G-W%V")

# ---------------------------------------------------------------------------
# Threshold heuristics (mirrors ai_service.py fallback)
# ---------------------------------------------------------------------------

def _risk_level(rate: float) -> str:
    if rate > 0.5:
        return "high"
    if rate > 0.25:
        return "medium"
    return "low"


def _risk_score(rate: float, lead_time: int) -> float:
    base = rate
    if lead_time < 2:
        base = min(base + 0.15, 1.0)
    return round(base, 3)


_RECOMMENDATIONS: dict[str, str] = {
    "high": (
        "Send a reminder at least 48 hours before the appointment. "
        "Consider a personal follow-up call from the BHW if the patient does not confirm."
    ),
    "medium": "Send the standard SMS reminder. Monitor for confirmation reply.",
    "low": "Standard reminder schedule applies. No additional action needed.",
}

_REASONINGS: dict[str, str] = {
    "high": (
        "This patient has a historical no-show rate above 50% and limited "
        "recent visits, indicating low engagement. Early outreach is advised."
    ),
    "medium": (
        "Moderate no-show history. A single reminder should suffice, "
        "but monitor for confirmation."
    ),
    "low": (
        "Patient has a good attendance record and recent visit activity. "
        "Standard reminder schedule applies."
    ),
}

# ---------------------------------------------------------------------------
# Sample anomaly alerts (condition_name, z_score, current_count, baseline data)
# ---------------------------------------------------------------------------

_SAMPLE_ALERTS = [
    {
        "condition_name": "Acute Respiratory Infection",
        "z_score": 2.8,
        "current_count": 18,
        "baseline_mean": 7.5,
        "baseline_stdev": 3.9,
        "severity": "warning",
        "alert_message": (
            "Acute Respiratory Infection cases this week (18) are significantly "
            "higher than the recent weekly average of 7.5 cases. Consider issuing "
            "a health advisory and coordinating with the local sanitation office "
            "for targeted community visits."
        ),
    },
    {
        "condition_name": "Hypertension",
        "z_score": 3.2,
        "current_count": 24,
        "baseline_mean": 10.2,
        "baseline_stdev": 4.3,
        "severity": "critical",
        "alert_message": (
            "Hypertension consultations spiked to 24 this week, 3.2 standard "
            "deviations above the 10.2 baseline. This may reflect under-managed "
            "cases following the holiday period. Prioritize medication refill "
            "outreach for enrolled hypertensive patients."
        ),
    },
    {
        "condition_name": "Diarrhea",
        "z_score": 2.3,
        "current_count": 14,
        "baseline_mean": 5.8,
        "baseline_stdev": 3.6,
        "severity": "warning",
        "alert_message": (
            "Diarrhea cases (14) in the current week are 2.3 standard deviations "
            "above the recent baseline of 5.8 cases/week. Review water source "
            "conditions in the affected barangays and coordinate with the sanitation "
            "team for a rapid assessment."
        ),
    },
    {
        "condition_name": "Dengue Fever",
        "z_score": 4.1,
        "current_count": 9,
        "baseline_mean": 1.4,
        "baseline_stdev": 1.8,
        "severity": "critical",
        "alert_message": (
            "Dengue Fever cases (9) this week are 4.1 standard deviations above "
            "the 1.4 case baseline — a critical spike. Immediately report to the "
            "City Health Office and initiate fogging operations and community "
            "clean-up drives in identified high-density areas."
        ),
    },
]


# ---------------------------------------------------------------------------
# Dummy no-show rates by patient index (deterministic, varied distribution)
# ---------------------------------------------------------------------------

def _dummy_no_show_rate(i: int) -> float:
    rates = [0.0, 0.10, 0.20, 0.33, 0.50, 0.60, 0.75, 0.80, 0.15, 0.45]
    return rates[i % len(rates)]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def seed_risk_scores(db) -> int:
    now = _NOW
    horizon = now + timedelta(days=7)

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

    if not rows:
        print("  No upcoming appointments found in the next 7 days.")
        print("  Run reset_and_seed.py first to populate appointments, then re-run this script.")
        return 0

    inserted = 0
    for i, (appt, patient) in enumerate(rows):
        # Skip if a score already exists for this appointment
        existing = await db.execute(
            select(AiRiskScore.id).where(AiRiskScore.appointment_id == appt.id)
        )
        if existing.scalar_one_or_none() is not None:
            continue

        no_show_rate = _dummy_no_show_rate(i)
        lead_time = max(0, (appt.scheduled_at - now).days)
        level = _risk_level(no_show_rate)
        score = _risk_score(no_show_rate, lead_time)
        visit_freq = random.randint(0, 5)

        row = AiRiskScore(
            id=uuid.uuid4(),
            appointment_id=appt.id,
            patient_id=patient.id,
            patient_code=patient.patient_code,
            risk_level=level,
            risk_score=score,
            recommendation=_RECOMMENDATIONS[level],
            reasoning=_REASONINGS[level],
            features_json={
                "historical_no_show_rate": no_show_rate,
                "lead_time_days": lead_time,
                "day_of_week": appt.scheduled_at.weekday(),
                "appointment_type": appt.appointment_type,
                "is_senior": bool(patient.is_senior),
                "is_pwd": bool(patient.is_pwd),
                "is_pregnant": bool(patient.is_pregnant),
                "visit_frequency_90d": visit_freq,
                "ai_generated": False,
            },
            computed_at=_NOW,
            expires_at=appt.scheduled_at,
        )
        db.add(row)
        inserted += 1

    await db.commit()
    return inserted


async def seed_anomaly_alerts(db) -> int:
    inserted = 0
    for alert_data in _SAMPLE_ALERTS:
        existing = await db.execute(
            select(AiAnomalyAlert.id).where(
                AiAnomalyAlert.condition_name == alert_data["condition_name"],
                AiAnomalyAlert.week_label == _CURRENT_WEEK,
                AiAnomalyAlert.is_active.is_(True),
            )
        )
        if existing.scalar_one_or_none() is not None:
            print(f"  Skipping '{alert_data['condition_name']}' — alert already active for {_CURRENT_WEEK}")
            continue

        row = AiAnomalyAlert(
            id=uuid.uuid4(),
            condition_name=alert_data["condition_name"],
            severity=alert_data["severity"],
            z_score=alert_data["z_score"],
            baseline_mean=alert_data["baseline_mean"],
            baseline_stdev=alert_data["baseline_stdev"],
            current_count=alert_data["current_count"],
            alert_message=alert_data["alert_message"],
            week_label=_CURRENT_WEEK,
            is_active=True,
            created_at=_NOW,
        )
        db.add(row)
        inserted += 1

    await db.commit()
    return inserted


async def main() -> None:
    print(f"\nSeeding AI analytics dummy data (week {_CURRENT_WEEK})...")

    async with AsyncSessionLocal() as db:
        print("\n[1/2] No-show risk scores...")
        n_scores = await seed_risk_scores(db)
        print(f"  Inserted {n_scores} risk score(s).")

        print("\n[2/2] Anomaly alerts...")
        n_alerts = await seed_anomaly_alerts(db)
        print(f"  Inserted {n_alerts} anomaly alert(s).")

    print("\nDone. Refresh the Analytics Dashboard to see the AI panels.\n")


if __name__ == "__main__":
    asyncio.run(main())
