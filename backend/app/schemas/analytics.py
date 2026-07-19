"""
Pydantic v2 schemas for analytics and reporting endpoints.

All schemas inherit from BaseSchema (from_attributes=True, str_strip_whitespace=True).
No .dict() calls — use .model_dump() per Pydantic v2 conventions.

Schemas
-------
DashboardOverview             GET /analytics/overview
VaccinationCoverageItem       One row in a vaccination coverage breakdown
VaccinationCoverageResponse   Full coverage response (by_vaccine + by_age_group)
IllnessTrendItem              One aggregated trend data point
IllnessTrendsResponse         Full illness trends response with filters echoed back
NoShowRateItem                One appointment-type no-show breakdown row
NoShowRateResponse            Full no-show rate response with filters echoed back

SDP Reference: Section 6.7 (Analytics & Reporting API)
"""

from __future__ import annotations

from datetime import date

from pydantic import Field

from app.schemas._base import BaseSchema


class DashboardOverview(BaseSchema):
    """
    High-level dashboard counters returned by GET /analytics/overview.

    All counts represent current state as of the time of the request.
    No patient-identifying information is included — these are aggregate
    figures only.
    """

    total_active_patients: int = Field(
        description="Number of patients with is_active=True.",
        ge=0,
    )
    visits_this_week: int = Field(
        description="Number of visits recorded in the current ISO week (Mon–Sun).",
        ge=0,
    )
    visits_this_month: int = Field(
        description="Number of visits recorded since the first day of the current calendar month.",
        ge=0,
    )
    upcoming_appointments_count: int = Field(
        description=(
            "Appointments scheduled on or after now() with status "
            "'pending' or 'confirmed'."
        ),
        ge=0,
    )
    immunizations_due_this_week: int = Field(
        description=(
            "Immunizations whose next_due_date falls within the next 7 days "
            "and whose status is not 'completed'."
        ),
        ge=0,
    )


class VaccinationCoverageItem(BaseSchema):
    """
    A single row in the vaccination coverage breakdown.

    Used in both the by_vaccine list (age_group will be 'ALL') and the
    by_age_group list (vaccine_name will be 'ALL').
    """

    vaccine_name: str = Field(
        description=(
            "Vaccine identifier (e.g. 'BCG', 'Hepa B'). "
            "Set to 'ALL' when this row represents an age-group aggregate."
        )
    )
    age_group: str = Field(
        description=(
            "Age bucket: '0-1', '2-5', '6-11', '12-17', '18-59', '60+'. "
            "Set to 'ALL' when this row represents a per-vaccine aggregate."
        )
    )
    total_eligible: int = Field(
        description="Total number of patients eligible for this vaccine/age group.",
        ge=0,
    )
    completed: int = Field(
        description="Number of patients who completed at least one dose.",
        ge=0,
    )
    coverage_pct: float = Field(
        description="Percentage of eligible patients who completed vaccination (0–100).",
        ge=0.0,
        le=100.0,
    )


class VaccinationCoverageResponse(BaseSchema):
    """
    Full vaccination coverage response payload.

    by_vaccine   — one row per distinct vaccine_name, age_group='ALL'
    by_age_group — one row per age bucket across all vaccines, vaccine_name='ALL'
    """

    by_vaccine: list[VaccinationCoverageItem] = Field(
        description="Coverage breakdown grouped by vaccine name.",
        default_factory=list,
    )
    by_age_group: list[VaccinationCoverageItem] = Field(
        description="Coverage breakdown grouped by patient age group.",
        default_factory=list,
    )


class IllnessTrendItem(BaseSchema):
    """
    A single data point in the illness/condition trend series.

    period is formatted as:
      - 'YYYY-WNN'  when group_by='week'  (e.g. '2026-W03')
      - 'YYYY-MM'   when group_by='month' (e.g. '2026-01')
      - 'YYYY'      when group_by='year'  (e.g. '2026')
    """

    period: str = Field(
        description="Time bucket label (week, month, or year formatted string)."
    )
    condition_name: str = Field(
        description="The medical condition or diagnosis name."
    )
    count: int = Field(
        description="Number of medical_history records with this condition in this period.",
        ge=0,
    )


class IllnessTrendsResponse(BaseSchema):
    """Full illness trends response including query parameters echoed back."""

    items: list[IllnessTrendItem] = Field(
        description="Trend data points ordered by period ascending.",
        default_factory=list,
    )
    from_date: date = Field(description="Start of the requested date range (inclusive).")
    to_date: date = Field(description="End of the requested date range (inclusive).")
    group_by: str = Field(
        description="Grouping resolution used: 'week', 'month', or 'year'."
    )


class NoShowRateItem(BaseSchema):
    """
    No-show (missed appointment) breakdown for a single appointment_type.
    """

    appointment_type: str = Field(
        description="Appointment category (e.g. 'prenatal', 'immunization', 'general_checkup')."
    )
    total: int = Field(
        description="Total appointments of this type in the requested date range.",
        ge=0,
    )
    missed: int = Field(
        description="Number of appointments with status='missed' in the range.",
        ge=0,
    )
    no_show_rate: float = Field(
        description="missed / total × 100, rounded to one decimal place (0–100).",
        ge=0.0,
        le=100.0,
    )


class NoShowRateResponse(BaseSchema):
    """Full no-show rate response including query parameters echoed back."""

    items: list[NoShowRateItem] = Field(
        description="No-show breakdown per appointment_type.",
        default_factory=list,
    )
    from_date: date = Field(description="Start of the requested date range (inclusive).")
    to_date: date = Field(description="End of the requested date range (inclusive).")
