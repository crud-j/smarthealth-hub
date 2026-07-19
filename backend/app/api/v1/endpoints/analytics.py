"""
Analytics and reporting endpoints — Phase 5 implementation.

All analytics responses are pre-aggregated — no raw PHI rows are returned.
The export endpoint streams CSV content; JSON is used for PDF (the frontend
renders the PDF from the JSON payload using a client-side renderer).

Routes:
  GET /analytics/overview
      Dashboard summary totals (active patients, visits, upcoming appts,
      immunizations due).  Any authenticated role.

  GET /analytics/vaccination-coverage
      Coverage percentage by vaccine name and by age group bucket.
      Any authenticated role.

  GET /analytics/illness-trends
      Medical condition frequency trend, grouped by week/month/year.
      Query params: from_date, to_date, group_by.
      Any authenticated role.

  GET /analytics/appointments/no-show-rate
      Missed appointment rate per appointment_type.
      Query params: from_date, to_date.
      Any authenticated role.

  GET /analytics/export
      Exportable tabular data for patients / visits / immunizations /
      appointments.  Returns text/csv (default) or application/json (for
      PDF rendering by the frontend).
      Restricted to Admin and BHW roles.

Auth: JWT required on all routes (get_current_user dependency).
RBAC: /analytics/export restricted to 'admin' and 'bhw' roles.

SDP Reference: Section 6.7
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.analytics import (
    DashboardOverview,
    IllnessTrendsResponse,
    NoShowRateResponse,
    VaccinationCoverageResponse,
)
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])

# RBAC dependency — export endpoint is restricted to admin + bhw only.
# require_role() returns a Depends(...) object; it is passed directly into
# the route decorator's ``dependencies=[...]`` parameter (see SDP usage pattern
# in patients.py — same approach).
_ADMIN_OR_BHW = require_role("admin", "bhw")

# Default date range helpers (used as Query default_factory cannot be a lambda
# in older Pydantic/FastAPI combinations, so we use explicit sentinel defaults
# and compute the actual values in the handler body).
_DEFAULT_DAYS_BACK = 30


def _default_from_date() -> date:
    return date.today() - timedelta(days=_DEFAULT_DAYS_BACK)


def _default_to_date() -> date:
    return date.today()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/overview",
    response_model=DashboardOverview,
    summary="Dashboard summary — totals and recent trends",
    description=(
        "Returns aggregate dashboard counters: total active patients, "
        "visits this week and this month, upcoming appointments, and "
        "immunizations due in the next 7 days.  No PHI is included."
    ),
)
async def analytics_overview(
    db: DbDep,
    _current_user: CurrentUser,  # enforces JWT auth; role not restricted here
) -> DashboardOverview:
    """
    Return high-level dashboard figures for the BHC overview panel.

    Auth: Any authenticated user (Admin, BHW, Physician, Admin Staff).
    """
    data = await analytics_service.get_dashboard_overview(db)
    return DashboardOverview(**data)


@router.get(
    "/vaccination-coverage",
    response_model=VaccinationCoverageResponse,
    summary="Vaccination coverage percentage by vaccine and age group",
    description=(
        "Returns two breakdowns: by_vaccine (one row per distinct vaccine name) "
        "and by_age_group (one row per patient age bucket: 0-1, 2-5, 6-11, "
        "12-17, 18-59, 60+).  Coverage pct = completed / total_eligible × 100."
    ),
)
async def vaccination_coverage(
    db: DbDep,
    _current_user: CurrentUser,
) -> VaccinationCoverageResponse:
    """
    Return vaccination coverage statistics.

    Auth: Any authenticated user.
    """
    data = await analytics_service.get_vaccination_coverage(db)
    return VaccinationCoverageResponse(**data)


@router.get(
    "/illness-trends",
    response_model=IllnessTrendsResponse,
    summary="Medical condition frequency trends over time",
    description=(
        "Returns the count of medical_history records per condition_name, "
        "grouped by the chosen time period (week / month / year).  "
        "Filter with from_date and to_date (both inclusive)."
    ),
)
async def illness_trends(
    db: DbDep,
    _current_user: CurrentUser,
    from_date: Annotated[
        date | None,
        Query(
            description=(
                "Start of the date range (inclusive).  "
                "Defaults to 30 days ago.  Format: YYYY-MM-DD."
            )
        ),
    ] = None,
    to_date: Annotated[
        date | None,
        Query(
            description=(
                "End of the date range (inclusive).  "
                "Defaults to today.  Format: YYYY-MM-DD."
            )
        ),
    ] = None,
    group_by: Annotated[
        Literal["week", "month", "year"],
        Query(
            description=(
                "Time bucket granularity for grouping results.  "
                "One of: 'week', 'month', 'year'.  Defaults to 'month'."
            )
        ),
    ] = "month",
) -> IllnessTrendsResponse:
    """
    Return illness/condition trend data for chart rendering.

    Auth: Any authenticated user.
    """
    resolved_from = from_date or _default_from_date()
    resolved_to = to_date or _default_to_date()

    items = await analytics_service.get_illness_trends(
        db,
        from_date=resolved_from,
        to_date=resolved_to,
        group_by=group_by,
    )
    return IllnessTrendsResponse(
        items=items,
        from_date=resolved_from,
        to_date=resolved_to,
        group_by=group_by,
    )


@router.get(
    "/appointments/no-show-rate",
    response_model=NoShowRateResponse,
    summary="Missed appointment (no-show) rate by appointment type",
    description=(
        "Returns no-show statistics grouped by appointment_type.  "
        "no_show_rate = missed / total × 100 (1 decimal place).  "
        "Filter with from_date and to_date (both applied to scheduled_at)."
    ),
)
async def appointments_no_show_rate(
    db: DbDep,
    _current_user: CurrentUser,
    from_date: Annotated[
        date | None,
        Query(
            description=(
                "Start of the scheduled_at date range (inclusive).  "
                "Defaults to 30 days ago.  Format: YYYY-MM-DD."
            )
        ),
    ] = None,
    to_date: Annotated[
        date | None,
        Query(
            description=(
                "End of the scheduled_at date range (inclusive).  "
                "Defaults to today.  Format: YYYY-MM-DD."
            )
        ),
    ] = None,
) -> NoShowRateResponse:
    """
    Return missed-appointment rate statistics.

    Auth: Any authenticated user.
    """
    resolved_from = from_date or _default_from_date()
    resolved_to = to_date or _default_to_date()

    items = await analytics_service.get_appointment_no_show_rate(
        db,
        from_date=resolved_from,
        to_date=resolved_to,
    )
    return NoShowRateResponse(
        items=items,
        from_date=resolved_from,
        to_date=resolved_to,
    )


@router.get(
    "/export",
    summary="Export report data as CSV or JSON",
    description=(
        "Generates a downloadable report for the chosen report_type.  "
        "Returns text/csv by default (format=csv), or application/json "
        "when format=json (for frontend PDF rendering).  "
        "Restricted to Admin and BHW roles."
    ),
    dependencies=[_ADMIN_OR_BHW],
)
async def export_report(
    db: DbDep,
    report_type: Annotated[
        Literal["patients", "visits", "immunizations", "appointments"],
        Query(
            description=(
                "Type of data to export.  One of: "
                "'patients', 'visits', 'immunizations', 'appointments'."
            )
        ),
    ] = "patients",
    from_date: Annotated[
        date | None,
        Query(
            description=(
                "Start of the date range (inclusive).  "
                "Defaults to 30 days ago.  Format: YYYY-MM-DD."
            )
        ),
    ] = None,
    to_date: Annotated[
        date | None,
        Query(
            description=(
                "End of the date range (inclusive).  "
                "Defaults to today.  Format: YYYY-MM-DD."
            )
        ),
    ] = None,
    format: Annotated[
        Literal["csv", "json"],
        Query(
            description=(
                "Output format.  'csv' returns a downloadable text/csv file.  "
                "'json' returns application/json (for frontend PDF rendering)."
            )
        ),
    ] = "csv",
) -> Response:
    """
    Export tabular report data.

    For CSV: returns a streaming text/csv response with a
    Content-Disposition: attachment header so browsers download the file.

    For JSON: returns a standard JSON array (200 OK) suitable for the
    frontend PDF renderer (WeasyPrint call is done server-side in a
    separate /health-cards/ endpoint; this endpoint provides the raw data).

    Auth: Admin or BHW role required.
    """
    resolved_from = from_date or _default_from_date()
    resolved_to = to_date or _default_to_date()

    rows = await analytics_service.export_report_data(
        db,
        report_type=report_type,
        from_date=resolved_from,
        to_date=resolved_to,
    )

    if format == "json":
        # Return as JSON for the frontend PDF renderer.
        from fastapi.responses import JSONResponse

        return JSONResponse(content=rows)

    # -- CSV export ------------------------------------------------------------
    csv_content = analytics_service.rows_to_csv(rows)

    filename = (
        f"smarthealthhub_{report_type}_"
        f"{resolved_from.isoformat()}_to_{resolved_to.isoformat()}.csv"
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )
