"""
Analytics and reporting endpoints — Phase 5 implementation.

All analytics responses except /export are pre-aggregated counts.  /export
returns patient-level rows (names, codes, ages; visits also carry the chief
complaint), so it is role-restricted and every export is audited.  It returns
CSV, or JSON that the frontend turns into a file in the browser.

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

  GET /analytics/appointments/reminder-effect
      Return rate after SMS reminders: finished appointments with vs
      without a reminder SMS, and how many of each the patient came to.
      Query param: days (default 30).  Any authenticated role.

  GET /analytics/export
      Exportable tabular data for patients / visits / immunizations /
      appointments.  Returns text/csv (default) or application/json.
      Admin, BHW and Physician.  Admin's visits export leaves out
      chief_complaint (Admin model B: no clinical text).

Auth: JWT required on all routes (get_current_user dependency).
RBAC: /analytics/export restricted to 'admin', 'bhw' and 'physician'
      (admin_staff has no reporting duty).
Audit: one EXPORT_REPORT row per export (report type, dates, format, row
       count, role; never the rows themselves).

SDP Reference: Section 6.7
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.models.user import User
from app.schemas.analytics import (
    DashboardOverview,
    IllnessTrendsResponse,
    NoShowRateResponse,
    ReminderEffectResponse,
    VaccinationCoverageResponse,
    VisitTrendPoint,
    VisitTrendsResponse,
    VisitTypeBreakdownItem,
    VisitTypeBreakdownResponse,
)
from app.services import analytics_service
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Export releases patient-level rows: admin, BHW and physician only.
# Admin staff (front desk) has no reporting duty.
_EXPORT_ROLES = require_role("admin", "bhw", "physician")


def _get_client_ip(request: Request) -> str | None:
    """Extract the real client IP, respecting the X-Forwarded-For header."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


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
    return VaccinationCoverageResponse.model_validate(data)


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
                "End of the date range (inclusive).  Defaults to today.  Format: YYYY-MM-DD."
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
    return IllnessTrendsResponse.model_validate(
        {
            "items": items,
            "from_date": resolved_from,
            "to_date": resolved_to,
            "group_by": group_by,
        }
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
    return NoShowRateResponse.model_validate(
        {
            "items": items,
            "from_date": resolved_from,
            "to_date": resolved_to,
        }
    )


@router.get(
    "/appointments/reminder-effect",
    response_model=ReminderEffectResponse,
    summary="Return rate after SMS reminders",
    description=(
        "Finished appointments in the last N Manila days (today included) that "
        "got a reminder SMS vs those that did not, and how many of each the "
        "patient came to (status completed, or a visit logged that day).  "
        "Groups under min_group_size get no percentage.  Counts only."
    ),
)
async def reminder_effect(
    db: DbDep,
    _current_user: CurrentUser,
    days: Annotated[
        int,
        Query(ge=1, le=365, description="Window length in days, today included.  Default 30."),
    ] = 30,
) -> ReminderEffectResponse:
    """
    Return rate after SMS reminders (thesis objective: SMS notifications).

    Auth: Any authenticated user.
    """
    data = await analytics_service.get_reminder_effect_last_days(db, days)
    return ReminderEffectResponse.model_validate(data)


@router.get(
    "/visit-trends",
    response_model=VisitTrendsResponse,
    summary="Week-by-week visit counts for the last N weeks (default 12)",
    description=(
        "Returns pre-aggregated weekly visit counts for the last N weeks "
        "(default 12, clamped to 1–52 server-side even if FastAPI validation "
        "is bypassed).  week_label format: 'YYYY-WNN' (ISO week, e.g. '2026-W30').  "
        "No PHI is included — only aggregate counts."
    ),
)
async def visit_trends(
    db: DbDep,
    _current_user: CurrentUser,
    weeks: Annotated[
        int,
        Query(
            ge=1,
            le=52,
            description=(
                "Number of past weeks to include in the response.  "
                "Must be between 1 and 52 (inclusive).  Defaults to 12."
            ),
        ),
    ] = 12,
) -> VisitTrendsResponse:
    """
    Return week-by-week visit counts for chart rendering.

    Auth: Any authenticated user.
    """
    items = await analytics_service.get_visit_trends(db=db, weeks=weeks)
    return VisitTrendsResponse(
        weeks=weeks,
        items=[VisitTrendPoint(**item) for item in items],
    )


@router.get(
    "/visit-type-breakdown",
    response_model=VisitTypeBreakdownResponse,
    summary="Visit count breakdown by visit type",
    description=(
        "Returns the count of visits grouped by visit_type for the given "
        "date range, ordered by count descending (most common first).  "
        "Useful for a donut/pie chart showing the distribution of visit categories.  "
        "Filter with from_date and to_date (both inclusive, applied to visit_date).  "
        "Defaults to the last 30 days."
    ),
)
async def visit_type_breakdown(
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
                "End of the date range (inclusive).  Defaults to today.  Format: YYYY-MM-DD."
            )
        ),
    ] = None,
) -> VisitTypeBreakdownResponse:
    """
    Return visit distribution by visit_type for pie/donut chart rendering.

    Auth: Any authenticated user.
    """
    resolved_from = from_date or _default_from_date()
    resolved_to = to_date or _default_to_date()

    items = await analytics_service.get_visit_type_breakdown(
        db,
        from_date=resolved_from,
        to_date=resolved_to,
    )
    return VisitTypeBreakdownResponse(
        items=[VisitTypeBreakdownItem(**item) for item in items],
        from_date=resolved_from,
        to_date=resolved_to,
    )


@router.get(
    "/export",
    summary="Export report data as CSV or JSON",
    description=(
        "Generates a downloadable report for the chosen report_type.  "
        "Returns text/csv by default (format=csv), or application/json "
        "when format=json.  Admin, BHW and Physician only.  Admin's visits "
        "export leaves out chief_complaint.  Every export writes one "
        "EXPORT_REPORT audit row (report type, dates, format, row count)."
    ),
)
async def export_report(
    request: Request,
    db: DbDep,
    current_user: User = _EXPORT_ROLES,
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
                "End of the date range (inclusive).  Defaults to today.  Format: YYYY-MM-DD."
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

    For JSON: returns a standard JSON array (200 OK); the Reports page
    builds the CSV/JSON file from it in the browser.

    Auth: Admin, BHW or Physician.
    Audit: one EXPORT_REPORT row describing the export, never its rows.
    """
    resolved_from = from_date or _default_from_date()
    resolved_to = to_date or _default_to_date()
    role = current_user.role.name

    rows = await analytics_service.export_report_data(
        db,
        report_type=report_type,
        from_date=resolved_from,
        to_date=resolved_to,
        include_chief_complaint=role != "admin",
    )

    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="EXPORT_REPORT",
        entity_type="report",
        metadata={
            "report_type": report_type,
            "from_date": resolved_from.isoformat(),
            "to_date": resolved_to.isoformat(),
            "format": format,
            "row_count": len(rows),
            "role": role,
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    if format == "json":
        return JSONResponse(content=rows)

    # -- CSV export ------------------------------------------------------------
    csv_content = analytics_service.rows_to_csv(rows)

    filename = (
        f"smarthealthhub_{report_type}_{resolved_from.isoformat()}_to_{resolved_to.isoformat()}.csv"
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )
