"""
AI service — OpenAI GPT-4o-mini wrappers for no-show risk scoring and
illness trend anomaly alert generation.

PHI contract:
  - ONLY the following fields are ever sent to OpenAI:
      patient_code (a formatted string like "BHC-2026-001", NOT a UUID)
      historical_no_show_rate (float 0.0–1.0)
      lead_time_days (int)
      day_of_week (int 0–6)
      appointment_type (string category)
      is_senior, is_pwd, is_pregnant (bool flags)
      visit_frequency_90d (int count)
      condition_name (clinical category string, not linked to any patient)
      current_count, baseline_mean, baseline_stdev, z_score (aggregates)
      week_label (ISO week string)
  - Patient names, addresses, mobile numbers, UUIDs, diagnosis text,
    treatment notes, and any other PHI are NEVER sent to OpenAI.
  - OPENAI_API_KEY is never logged or returned in any response.

Fallback behaviour:
  When OPENAI_API_KEY is empty or OpenAI is unreachable after 3 retries:
    - score_appointment_risk() returns a threshold-only result with
      ai_generated=False in the features_json snapshot.
    - generate_anomaly_alert() returns a templated message with
      ai_generated=False.
  These fallbacks ensure the nightly Celery task never fails silently
  and always writes a usable result to the database.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# OpenAI client (lazy-initialised to avoid import-time failures when key absent)
# ---------------------------------------------------------------------------

def _get_openai_client():  # type: ignore[return]
    """
    Return an AsyncOpenAI client. Returns None if the key is absent or
    the openai package is not installed, allowing graceful fallback.
    """
    try:
        from openai import AsyncOpenAI
        from app.core.config import settings
        if not settings.OPENAI_API_KEY:
            return None
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    except ImportError:
        logger.warning("openai package not installed — AI features disabled")
        return None


# ---------------------------------------------------------------------------
# Threshold-only fallback helpers (used when OpenAI is unavailable)
# ---------------------------------------------------------------------------

def _threshold_risk_level(no_show_rate: float) -> str:
    if no_show_rate > 0.5:
        return "high"
    if no_show_rate > 0.25:
        return "medium"
    return "low"


def _threshold_risk_score(no_show_rate: float, lead_time_days: int) -> float:
    """
    Simple heuristic score: weighted no-show rate penalised for short lead time.
    Result is clamped to [0.0, 1.0].
    """
    base = no_show_rate
    # Short lead time (< 2 days) increases urgency
    if lead_time_days < 2:
        base = min(base + 0.15, 1.0)
    return round(base, 3)


FALLBACK_RECOMMENDATIONS: dict[str, str] = {
    "high": (
        "Send a reminder at least 48 hours before the appointment. "
        "Consider a personal follow-up call from the BHW if the patient does not confirm."
    ),
    "medium": (
        "Send the standard SMS reminder. Monitor for confirmation reply."
    ),
    "low": (
        "Standard reminder schedule applies. No additional action needed."
    ),
}


# ---------------------------------------------------------------------------
# Retry decorator (simple exponential backoff, no third-party library)
# ---------------------------------------------------------------------------

async def _with_retry(coro_fn, max_retries: int = 3) -> Any:  # type: ignore[type-arg]
    """
    Run ``coro_fn()`` (a zero-argument async callable) with exponential
    backoff on RateLimitError and APIError. On exhaustion, raises the
    last exception.
    """
    import openai

    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            return await coro_fn()
        except openai.RateLimitError as exc:
            wait = 2 ** attempt
            logger.warning(
                "OpenAI rate limit — retrying",
                extra={"attempt": attempt + 1, "wait_seconds": wait},
            )
            await asyncio.sleep(wait)
            last_exc = exc
        except openai.APIError as exc:
            wait = 2 ** attempt
            logger.warning(
                "OpenAI API error — retrying",
                extra={"attempt": attempt + 1, "error": str(exc), "wait_seconds": wait},
            )
            await asyncio.sleep(wait)
            last_exc = exc
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def score_appointment_risk(
    patient_code: str,
    historical_no_show_rate: float,
    lead_time_days: int,
    day_of_week: int,
    appointment_type: str,
    is_senior: bool,
    is_pwd: bool,
    is_pregnant: bool,
    visit_frequency_90d: int,
) -> dict:  # type: ignore[type-arg]
    """
    Call GPT-4o-mini to interpret appointment risk features and produce:
      risk_level: "high" | "medium" | "low"
      risk_score: float 0.0–1.0
      recommendation: str  (BHW action prompt, max ~100 words)
      reasoning: str       (brief natural-language explanation)
      ai_generated: bool   (False when fallback was used)

    Non-PHI inputs only — see module docstring.
    """
    client = _get_openai_client()

    if client is None:
        level = _threshold_risk_level(historical_no_show_rate)
        return {
            "risk_level": level,
            "risk_score": _threshold_risk_score(historical_no_show_rate, lead_time_days),
            "recommendation": FALLBACK_RECOMMENDATIONS[level],
            "reasoning": "AI service unavailable — computed from no-show rate threshold only.",
            "ai_generated": False,
        }

    system_prompt = (
        "You are a public health assistant supporting a Barangay Health Center (BHC) "
        "in the Philippines. Your role is to assess the risk that a patient will miss "
        "an upcoming appointment, using only aggregate statistical features — never any "
        "personally identifiable information. "
        "Return a JSON object with exactly four keys: "
        "\"risk_level\" (\"high\", \"medium\", or \"low\"), "
        "\"risk_score\" (a float between 0.0 and 1.0 where 1.0 = certain no-show), "
        "\"recommendation\" (a short, practical action for the BHW, max 60 words, in English), "
        "and \"reasoning\" (one or two sentences explaining the score). "
        "Use domain knowledge about Philippine barangay health center operations, "
        "such as common reasons for missed appointments (transportation, work schedule, "
        "lack of follow-up contact) and effective BHW interventions."
    )

    user_content = (
        f"Patient code: {patient_code}\n"
        f"Historical no-show rate: {historical_no_show_rate:.2%}\n"
        f"Days until appointment: {lead_time_days}\n"
        f"Day of week (0=Monday, 6=Sunday): {day_of_week}\n"
        f"Appointment type: {appointment_type}\n"
        f"Is senior citizen: {is_senior}\n"
        f"Is person with disability: {is_pwd}\n"
        f"Is pregnant: {is_pregnant}\n"
        f"Visits in last 90 days: {visit_frequency_90d}\n\n"
        "Assess the no-show risk and return the JSON object described in the system prompt."
    )

    async def _call() -> dict:  # type: ignore[type-arg]
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            max_tokens=300,
        )
        raw = response.choices[0].message.content or "{}"
        parsed: dict = json.loads(raw)  # type: ignore[type-arg]
        # Validate required keys — fall back if malformed
        for key in ("risk_level", "risk_score", "recommendation", "reasoning"):
            if key not in parsed:
                raise ValueError(f"OpenAI response missing key: {key}")
        parsed["risk_level"] = parsed["risk_level"].lower()
        if parsed["risk_level"] not in ("high", "medium", "low"):
            parsed["risk_level"] = _threshold_risk_level(historical_no_show_rate)
        parsed["risk_score"] = float(max(0.0, min(1.0, parsed["risk_score"])))
        parsed["ai_generated"] = True
        return parsed

    try:
        return await _with_retry(_call)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "OpenAI risk scoring failed after retries — using fallback",
            extra={"error": str(exc), "patient_code": patient_code},
        )
        level = _threshold_risk_level(historical_no_show_rate)
        return {
            "risk_level": level,
            "risk_score": _threshold_risk_score(historical_no_show_rate, lead_time_days),
            "recommendation": FALLBACK_RECOMMENDATIONS[level],
            "reasoning": f"AI unavailable ({exc}) — computed from no-show rate threshold.",
            "ai_generated": False,
        }


async def generate_anomaly_alert(
    condition_name: str,
    current_count: int,
    baseline_mean: float,
    baseline_stdev: float,
    z_score: float,
    week_label: str,
) -> dict:  # type: ignore[type-arg]
    """
    Call GPT-4o-mini to generate a natural-language anomaly alert message
    suitable for BHW/LGU staff.

    Returns:
      alert_message: str  (1–3 sentences, plain English, suitable for a non-clinical reader)
      severity: "warning" | "critical"   ("critical" when z_score >= 3.0)
      ai_generated: bool

    No PHI — only aggregate counts and clinical category name.
    """
    client = _get_openai_client()

    severity = "critical" if z_score >= 3.0 else "warning"

    if client is None:
        fallback_msg = (
            f"{condition_name} cases ({current_count}) in {week_label} are "
            f"{z_score:.1f} standard deviations above the recent {baseline_mean:.1f} "
            f"case baseline. Consider targeted outreach."
        )
        return {
            "alert_message": fallback_msg,
            "severity": severity,
            "ai_generated": False,
        }

    system_prompt = (
        "You are a public health surveillance assistant for a Barangay Health Center (BHC) "
        "in the Philippines. You generate clear, non-alarming alert messages when a medical "
        "condition shows a statistically significant spike in case counts compared to its "
        "recent baseline. Your audience is BHW staff and local government health officers — "
        "not clinical specialists. Write in plain English. "
        "Return a JSON object with two keys: "
        "\"alert_message\" (1 to 3 sentences describing the anomaly and a suggested action, "
        "max 80 words) and \"severity\" (\"warning\" if z_score < 3.0, \"critical\" if >= 3.0)."
    )

    user_content = (
        f"Condition: {condition_name}\n"
        f"Week: {week_label}\n"
        f"Registered cases this week: {current_count}\n"
        f"Recent baseline average: {baseline_mean:.1f} cases/week\n"
        f"Baseline standard deviation: {baseline_stdev:.1f}\n"
        f"Z-score (deviation from baseline): {z_score:.2f}\n\n"
        "Generate the alert message and severity."
    )

    async def _call() -> dict:  # type: ignore[type-arg]
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=200,
        )
        raw = response.choices[0].message.content or "{}"
        parsed: dict = json.loads(raw)  # type: ignore[type-arg]
        for key in ("alert_message", "severity"):
            if key not in parsed:
                raise ValueError(f"OpenAI response missing key: {key}")
        if parsed["severity"] not in ("warning", "critical"):
            parsed["severity"] = severity
        parsed["ai_generated"] = True
        return parsed

    try:
        return await _with_retry(_call)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "OpenAI anomaly alert generation failed — using fallback",
            extra={"error": str(exc), "condition_name": condition_name},
        )
        fallback_msg = (
            f"{condition_name} cases ({current_count}) in {week_label} are "
            f"{z_score:.1f} standard deviations above the recent {baseline_mean:.1f} "
            f"case baseline. Consider targeted outreach."
        )
        return {
            "alert_message": fallback_msg,
            "severity": severity,
            "ai_generated": False,
        }
