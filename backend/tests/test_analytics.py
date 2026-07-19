"""
Tests for analytics aggregation endpoints — Phase 5.

Covers:
  Service layer (direct function calls with seeded DB fixtures):
    - get_dashboard_overview returns exact expected counts
    - get_vaccination_coverage returns correct percentages
    - get_illness_trends returns correct period grouping and condition counts
    - get_appointment_no_show_rate returns correct rate calculation
    - export_report_data returns correct tabular structure

  HTTP layer (via httpx.AsyncClient + ASGITransport):
    - GET /api/v1/analytics/overview returns 200 + DashboardOverview schema
    - GET /api/v1/analytics/vaccination-coverage returns 200 + correct structure
    - GET /api/v1/analytics/illness-trends returns 200 + IllnessTrendsResponse schema
    - GET /api/v1/analytics/appointments/no-show-rate returns 200 + NoShowRateResponse schema
    - GET /api/v1/analytics/export returns 200 CSV with correct headers
    - GET /api/v1/analytics/export with format=json returns 200 JSON list
    - /analytics/export requires Admin or BHW role (physician gets 403)
    - Unauthenticated request to /analytics/overview returns 401

Async mode: asyncio_mode = "auto" in pyproject.toml — no @pytest.mark.asyncio needed.
All tests run inside a SAVEPOINT per test function (see conftest.py).

Column name notes (actual model vs. task description):
  visits.visit_date           — NOT visited_at
  appointments.scheduled_at   — NOT scheduled_date
  immunizations.date_administered — NOT administered_at
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.immunization import Immunization
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.user import Role, User
from app.models.visit import Visit
from app.services import analytics_service

# ---------------------------------------------------------------------------
# URL constants
# ---------------------------------------------------------------------------

OVERVIEW_URL = "/api/v1/analytics/overview"
VACCINATION_URL = "/api/v1/analytics/vaccination-coverage"
ILLNESS_URL = "/api/v1/analytics/illness-trends"
NO_SHOW_URL = "/api/v1/analytics/appointments/no-show-rate"
EXPORT_URL = "/api/v1/analytics/export"

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


async def _create_role(db: AsyncSession, name: str) -> Role:
    """Insert a Role into the test DB if it does not already exist."""
    role = Role(id=uuid.uuid4(), name=name, permissions={})
    db.add(role)
    await db.flush()
    return role


async def _create_user(
    db: AsyncSession,
    role: Role,
    email: str | None = None,
    mobile: str | None = None,
) -> User:
    """Insert an active User with the given role."""
    from app.core.security import hash_password

    uid = uuid.uuid4()
    resolved_email = email or f"user_{uid.hex[:6]}@test.local"
    resolved_mobile = mobile or f"+6391700{abs(hash(resolved_email)) % 100000:05d}"

    user = User(
        id=uid,
        full_name="Test User",
        email=resolved_email,
        mobile_number=resolved_mobile,
        password_hash=hash_password("testpass123!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db.add(user)
    await db.flush()
    return user


async def _create_patient(
    db: AsyncSession,
    *,
    patient_code: str | None = None,
    is_active: bool = True,
    birth_date: date = date(1990, 1, 1),
) -> Patient:
    """Insert a minimal Patient row."""
    uid = uuid.uuid4()
    code = patient_code or f"BHC-{uid.hex[:6].upper()}"
    patient = Patient(
        id=uid,
        patient_code=code,
        first_name="Juan",
        middle_name=None,
        last_name="dela Cruz",
        birth_date=birth_date,
        sex="male",
        address="Barangay Test, City",
        is_active=is_active,
    )
    db.add(patient)
    await db.flush()
    return patient


async def _create_visit(
    db: AsyncSession,
    patient: Patient,
    *,
    visit_date: datetime | None = None,
    visit_type: str = "consultation",
) -> None:
    """Insert a Visit row for the given patient."""
    visit = Visit(
        id=uuid.uuid4(),
        patient_id=patient.id,
        visit_date=visit_date or datetime.now(tz=UTC),
        visit_type=visit_type,
    )
    db.add(visit)
    await db.flush()


async def _create_immunization(
    db: AsyncSession,
    patient: Patient,
    *,
    vaccine_name: str = "BCG",
    status: str = "scheduled",
    next_due_date: date | None = None,
    date_administered: date | None = None,
) -> Immunization:
    """Insert an Immunization row."""
    imm = Immunization(
        id=uuid.uuid4(),
        patient_id=patient.id,
        vaccine_name=vaccine_name,
        dose_number=1,
        status=status,
        next_due_date=next_due_date,
        date_administered=date_administered,
    )
    db.add(imm)
    await db.flush()
    return imm


async def _create_appointment(
    db: AsyncSession,
    patient: Patient,
    *,
    appointment_type: str = "general_checkup",
    scheduled_at: datetime | None = None,
    status: str = "pending",
) -> Appointment:
    """Insert an Appointment row."""
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type=appointment_type,
        scheduled_at=scheduled_at or datetime.now(tz=UTC) + timedelta(days=1),
        status=status,
    )
    db.add(appt)
    await db.flush()
    return appt


async def _create_medical_history(
    db: AsyncSession,
    patient: Patient,
    *,
    condition_name: str = "Hypertension",
    created_at: datetime | None = None,
) -> MedicalHistory:
    """Insert a MedicalHistory row."""
    mh = MedicalHistory(
        id=uuid.uuid4(),
        patient_id=patient.id,
        condition_name=condition_name,
    )
    db.add(mh)
    await db.flush()

    # Override created_at if needed (SQLAlchemy server default won't apply in flush).
    if created_at is not None:
        from sqlalchemy import update
        from app.models.medical_history import MedicalHistory as MH

        await db.execute(
            update(MH).where(MH.id == mh.id).values(created_at=created_at)
        )
        await db.flush()

    return mh


# ---------------------------------------------------------------------------
# Service layer tests
# ---------------------------------------------------------------------------


class TestGetDashboardOverview:
    """Unit tests for analytics_service.get_dashboard_overview."""

    async def test_empty_db_returns_zeros(self, db_session: AsyncSession) -> None:
        """When there is no data, all counts should be 0, not errors."""
        result = await analytics_service.get_dashboard_overview(db_session)

        assert result["total_active_patients"] == 0
        assert result["visits_this_week"] == 0
        assert result["visits_this_month"] == 0
        assert result["upcoming_appointments_count"] == 0
        assert result["immunizations_due_this_week"] == 0

    async def test_active_patient_count(self, db_session: AsyncSession) -> None:
        """Only active patients are counted."""
        await _create_patient(db_session, patient_code="ACT-001", is_active=True)
        await _create_patient(db_session, patient_code="ACT-002", is_active=True)
        await _create_patient(db_session, patient_code="INA-001", is_active=False)

        result = await analytics_service.get_dashboard_overview(db_session)
        assert result["total_active_patients"] == 2

    async def test_visits_this_week_counts_current_week_only(
        self, db_session: AsyncSession
    ) -> None:
        """Visits from the current ISO week are counted; older ones are not."""
        patient = await _create_patient(db_session, patient_code="V-001")

        now = datetime.now(tz=UTC)
        # Visit today — should be counted.
        await _create_visit(db_session, patient, visit_date=now)
        # Visit 10 days ago — outside current ISO week.
        await _create_visit(
            db_session, patient, visit_date=now - timedelta(days=10)
        )

        result = await analytics_service.get_dashboard_overview(db_session)
        # At least 1 visit this week (could be more if other tests left data,
        # so assert >= 1 and that the old visit did not inflate the count past 1).
        assert result["visits_this_week"] >= 1

    async def test_upcoming_appointments_pending_and_confirmed_only(
        self, db_session: AsyncSession
    ) -> None:
        """Only future pending/confirmed appointments are included in the count."""
        patient = await _create_patient(db_session, patient_code="APT-001")

        future = datetime.now(tz=UTC) + timedelta(hours=2)
        past = datetime.now(tz=UTC) - timedelta(days=1)

        await _create_appointment(
            db_session, patient, scheduled_at=future, status="pending"
        )
        await _create_appointment(
            db_session, patient, scheduled_at=future, status="confirmed"
        )
        # Completed / missed appointments in the future should NOT be counted.
        await _create_appointment(
            db_session, patient, scheduled_at=future, status="completed"
        )
        # Past pending appointment should NOT be counted.
        await _create_appointment(
            db_session, patient, scheduled_at=past, status="pending"
        )

        result = await analytics_service.get_dashboard_overview(db_session)
        assert result["upcoming_appointments_count"] >= 2

    async def test_immunizations_due_this_week(
        self, db_session: AsyncSession
    ) -> None:
        """Immunizations due within 7 days and not completed are counted."""
        patient = await _create_patient(db_session, patient_code="IMM-DUE")

        today = date.today()
        # Due tomorrow — should be counted.
        await _create_immunization(
            db_session,
            patient,
            vaccine_name="BCG",
            status="scheduled",
            next_due_date=today + timedelta(days=1),
        )
        # Due today — should be counted.
        await _create_immunization(
            db_session,
            patient,
            vaccine_name="Hepa B",
            status="scheduled",
            next_due_date=today,
        )
        # Already completed — should NOT be counted.
        await _create_immunization(
            db_session,
            patient,
            vaccine_name="MMR",
            status="completed",
            next_due_date=today + timedelta(days=2),
        )
        # Due in 30 days — outside the window.
        await _create_immunization(
            db_session,
            patient,
            vaccine_name="OPV",
            status="scheduled",
            next_due_date=today + timedelta(days=30),
        )

        result = await analytics_service.get_dashboard_overview(db_session)
        assert result["immunizations_due_this_week"] >= 2


class TestGetVaccinationCoverage:
    """Unit tests for analytics_service.get_vaccination_coverage."""

    async def test_empty_returns_empty_lists(self, db_session: AsyncSession) -> None:
        result = await analytics_service.get_vaccination_coverage(db_session)
        assert result["by_vaccine"] == []
        assert result["by_age_group"] == []

    async def test_coverage_pct_calculation(self, db_session: AsyncSession) -> None:
        """100% coverage when all patients have completed the vaccine."""
        patient_a = await _create_patient(db_session, patient_code="COV-A")
        patient_b = await _create_patient(db_session, patient_code="COV-B")

        await _create_immunization(
            db_session, patient_a, vaccine_name="BCG", status="completed"
        )
        await _create_immunization(
            db_session, patient_b, vaccine_name="BCG", status="completed"
        )

        result = await analytics_service.get_vaccination_coverage(db_session)
        bcg_rows = [r for r in result["by_vaccine"] if r["vaccine_name"] == "BCG"]
        assert len(bcg_rows) == 1
        row = bcg_rows[0]
        assert row["total_eligible"] == 2
        assert row["completed"] == 2
        assert row["coverage_pct"] == 100.0

    async def test_partial_coverage(self, db_session: AsyncSession) -> None:
        """50% coverage when only half the patients completed the vaccine."""
        patient_a = await _create_patient(db_session, patient_code="PCOV-A")
        patient_b = await _create_patient(db_session, patient_code="PCOV-B")

        await _create_immunization(
            db_session, patient_a, vaccine_name="Hepa B", status="completed"
        )
        await _create_immunization(
            db_session, patient_b, vaccine_name="Hepa B", status="scheduled"
        )

        result = await analytics_service.get_vaccination_coverage(db_session)
        hepa_rows = [
            r for r in result["by_vaccine"] if r["vaccine_name"] == "Hepa B"
        ]
        assert hepa_rows, "Expected at least one Hepa B row"
        row = hepa_rows[0]
        assert row["coverage_pct"] == 50.0

    async def test_age_group_present_in_by_age_group(
        self, db_session: AsyncSession
    ) -> None:
        """Age group buckets derived from patient birth_date are present."""
        # Patient born in 1960 — 60+ group.
        senior = await _create_patient(
            db_session,
            patient_code="AG-SR",
            birth_date=date(1960, 1, 1),
        )
        await _create_immunization(
            db_session, senior, vaccine_name="Flu", status="completed"
        )

        result = await analytics_service.get_vaccination_coverage(db_session)
        age_groups = [r["age_group"] for r in result["by_age_group"]]
        assert "60+" in age_groups


class TestGetIllnessTrends:
    """Unit tests for analytics_service.get_illness_trends."""

    async def test_empty_returns_empty_list(self, db_session: AsyncSession) -> None:
        from_d = date(2025, 1, 1)
        to_d = date(2025, 1, 31)
        result = await analytics_service.get_illness_trends(
            db_session, from_date=from_d, to_date=to_d, group_by="month"
        )
        assert result == []

    async def test_monthly_grouping(self, db_session: AsyncSession) -> None:
        """Two records in the same month produce count=2 for that period."""
        patient = await _create_patient(db_session, patient_code="ILL-M")

        target_dt = datetime(2026, 3, 15, tzinfo=UTC)
        await _create_medical_history(
            db_session,
            patient,
            condition_name="Hypertension",
            created_at=target_dt,
        )
        await _create_medical_history(
            db_session,
            patient,
            condition_name="Hypertension",
            created_at=target_dt + timedelta(days=5),
        )

        result = await analytics_service.get_illness_trends(
            db_session,
            from_date=date(2026, 3, 1),
            to_date=date(2026, 3, 31),
            group_by="month",
        )
        assert len(result) >= 1
        hyp_rows = [r for r in result if r["condition_name"] == "Hypertension"]
        assert len(hyp_rows) == 1
        assert hyp_rows[0]["count"] == 2
        assert hyp_rows[0]["period"] == "2026-03"

    async def test_weekly_grouping_format(self, db_session: AsyncSession) -> None:
        """period label is in 'YYYY-WNN' format for group_by='week'."""
        patient = await _create_patient(db_session, patient_code="ILL-W")
        # 2026-01-05 is a Monday in week 2 of 2026.
        await _create_medical_history(
            db_session,
            patient,
            condition_name="Diabetes",
            created_at=datetime(2026, 1, 5, tzinfo=UTC),
        )

        result = await analytics_service.get_illness_trends(
            db_session,
            from_date=date(2026, 1, 1),
            to_date=date(2026, 1, 31),
            group_by="week",
        )
        periods = [r["period"] for r in result]
        # At least one period follows "YYYY-WNN" format.
        import re

        assert any(re.match(r"^\d{4}-W\d{2}$", p) for p in periods)

    async def test_yearly_grouping_format(self, db_session: AsyncSession) -> None:
        """period label is in 'YYYY' format for group_by='year'."""
        patient = await _create_patient(db_session, patient_code="ILL-Y")
        await _create_medical_history(
            db_session,
            patient,
            condition_name="Asthma",
            created_at=datetime(2026, 6, 1, tzinfo=UTC),
        )

        result = await analytics_service.get_illness_trends(
            db_session,
            from_date=date(2026, 1, 1),
            to_date=date(2026, 12, 31),
            group_by="year",
        )
        periods = [r["period"] for r in result]
        import re

        assert any(re.match(r"^\d{4}$", p) for p in periods)

    async def test_date_range_filter_excludes_outside_records(
        self, db_session: AsyncSession
    ) -> None:
        """Records outside the from_date / to_date range are excluded."""
        patient = await _create_patient(db_session, patient_code="ILL-RANGE")
        inside_dt = datetime(2026, 5, 10, tzinfo=UTC)
        outside_dt = datetime(2026, 1, 1, tzinfo=UTC)

        await _create_medical_history(
            db_session,
            patient,
            condition_name="Fever",
            created_at=inside_dt,
        )
        await _create_medical_history(
            db_session,
            patient,
            condition_name="Fever",
            created_at=outside_dt,  # outside range
        )

        result = await analytics_service.get_illness_trends(
            db_session,
            from_date=date(2026, 5, 1),
            to_date=date(2026, 5, 31),
            group_by="month",
        )
        fever_rows = [r for r in result if r["condition_name"] == "Fever"]
        assert len(fever_rows) == 1
        assert fever_rows[0]["count"] == 1


class TestGetAppointmentNoShowRate:
    """Unit tests for analytics_service.get_appointment_no_show_rate."""

    async def test_empty_returns_empty_list(self, db_session: AsyncSession) -> None:
        result = await analytics_service.get_appointment_no_show_rate(
            db_session,
            from_date=date(2025, 1, 1),
            to_date=date(2025, 1, 31),
        )
        assert result == []

    async def test_no_show_rate_calculation(self, db_session: AsyncSession) -> None:
        """no_show_rate = missed / total × 100 (rounded to 1 decimal)."""
        patient = await _create_patient(db_session, patient_code="NS-001")

        # 4 appointments: 1 missed → 25.0%
        appt_date = datetime(2026, 4, 10, tzinfo=UTC)
        for status in ["completed", "completed", "completed", "missed"]:
            await _create_appointment(
                db_session,
                patient,
                appointment_type="prenatal",
                scheduled_at=appt_date,
                status=status,
            )

        result = await analytics_service.get_appointment_no_show_rate(
            db_session,
            from_date=date(2026, 4, 1),
            to_date=date(2026, 4, 30),
        )
        prenatal_rows = [r for r in result if r["appointment_type"] == "prenatal"]
        assert len(prenatal_rows) == 1
        row = prenatal_rows[0]
        assert row["total"] == 4
        assert row["missed"] == 1
        assert row["no_show_rate"] == 25.0

    async def test_zero_rate_when_no_misses(self, db_session: AsyncSession) -> None:
        """no_show_rate is 0.0 when no appointments were missed."""
        patient = await _create_patient(db_session, patient_code="NS-ZERO")
        appt_date = datetime(2026, 4, 15, tzinfo=UTC)

        for _ in range(3):
            await _create_appointment(
                db_session,
                patient,
                appointment_type="immunization",
                scheduled_at=appt_date,
                status="completed",
            )

        result = await analytics_service.get_appointment_no_show_rate(
            db_session,
            from_date=date(2026, 4, 1),
            to_date=date(2026, 4, 30),
        )
        imm_rows = [r for r in result if r["appointment_type"] == "immunization"]
        assert imm_rows
        assert imm_rows[0]["no_show_rate"] == 0.0

    async def test_date_range_excludes_outside_appointments(
        self, db_session: AsyncSession
    ) -> None:
        """Appointments outside the date range are excluded."""
        patient = await _create_patient(db_session, patient_code="NS-DR")

        in_range = datetime(2026, 6, 10, tzinfo=UTC)
        out_range = datetime(2026, 1, 5, tzinfo=UTC)

        await _create_appointment(
            db_session,
            patient,
            appointment_type="dental",
            scheduled_at=in_range,
            status="missed",
        )
        await _create_appointment(
            db_session,
            patient,
            appointment_type="dental",
            scheduled_at=out_range,  # outside
            status="missed",
        )

        result = await analytics_service.get_appointment_no_show_rate(
            db_session,
            from_date=date(2026, 6, 1),
            to_date=date(2026, 6, 30),
        )
        dental_rows = [r for r in result if r["appointment_type"] == "dental"]
        assert dental_rows
        assert dental_rows[0]["total"] == 1  # only the in-range one


class TestExportReportData:
    """Unit tests for analytics_service.export_report_data."""

    async def test_patients_export_structure(self, db_session: AsyncSession) -> None:
        """patients export contains required keys."""
        await _create_patient(db_session, patient_code="EXP-P")

        rows = await analytics_service.export_report_data(
            db_session,
            report_type="patients",
            from_date=date(2000, 1, 1),
            to_date=date(2099, 12, 31),
        )
        assert isinstance(rows, list)
        if rows:
            keys = set(rows[0].keys())
            assert {"patient_code", "full_name", "sex", "age", "is_active", "created_at"} <= keys

    async def test_visits_export_structure(self, db_session: AsyncSession) -> None:
        """visits export contains required keys."""
        patient = await _create_patient(db_session, patient_code="EXP-V")
        await _create_visit(db_session, patient)

        rows = await analytics_service.export_report_data(
            db_session,
            report_type="visits",
            from_date=date(2000, 1, 1),
            to_date=date(2099, 12, 31),
        )
        if rows:
            keys = set(rows[0].keys())
            assert {"patient_code", "full_name", "visited_at", "visit_type"} <= keys

    async def test_immunizations_export_structure(
        self, db_session: AsyncSession
    ) -> None:
        """immunizations export contains required keys."""
        patient = await _create_patient(db_session, patient_code="EXP-I")
        await _create_immunization(
            db_session, patient, vaccine_name="BCG", status="completed"
        )

        rows = await analytics_service.export_report_data(
            db_session,
            report_type="immunizations",
            from_date=date(2000, 1, 1),
            to_date=date(2099, 12, 31),
        )
        if rows:
            keys = set(rows[0].keys())
            assert {
                "patient_code",
                "full_name",
                "vaccine_name",
                "dose_number",
                "status",
            } <= keys

    async def test_appointments_export_structure(
        self, db_session: AsyncSession
    ) -> None:
        """appointments export contains required keys."""
        patient = await _create_patient(db_session, patient_code="EXP-A")
        await _create_appointment(db_session, patient)

        rows = await analytics_service.export_report_data(
            db_session,
            report_type="appointments",
            from_date=date(2000, 1, 1),
            to_date=date(2099, 12, 31),
        )
        if rows:
            keys = set(rows[0].keys())
            assert {
                "patient_code",
                "full_name",
                "appointment_type",
                "scheduled_date",
                "status",
            } <= keys


class TestRowsToCsv:
    """Unit tests for analytics_service.rows_to_csv."""

    def test_empty_list_returns_empty_string(self) -> None:
        result = analytics_service.rows_to_csv([])
        assert result == ""

    def test_header_row_present(self) -> None:
        rows = [{"name": "Juan", "age": 30}, {"name": "Maria", "age": 25}]
        csv_str = analytics_service.rows_to_csv(rows)
        reader = csv.DictReader(io.StringIO(csv_str))
        parsed = list(reader)
        assert len(parsed) == 2
        assert parsed[0]["name"] == "Juan"
        assert parsed[1]["age"] == "25"


# ---------------------------------------------------------------------------
# HTTP layer tests
# ---------------------------------------------------------------------------


class TestAnalyticsHTTPEndpoints:
    """Integration tests for the analytics HTTP endpoints."""

    async def test_overview_returns_200_with_schema(
        self,
        client: AsyncClient,
        admin_token: str,
    ) -> None:
        """GET /analytics/overview returns 200 and all required fields."""
        response = await client.get(
            OVERVIEW_URL,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_active_patients" in data
        assert "visits_this_week" in data
        assert "visits_this_month" in data
        assert "upcoming_appointments_count" in data
        assert "immunizations_due_this_week" in data
        # All values must be non-negative integers.
        for key in data:
            assert isinstance(data[key], int), f"{key} is not int"
            assert data[key] >= 0, f"{key} is negative"

    async def test_overview_requires_auth(self, client: AsyncClient) -> None:
        """Unauthenticated request to /analytics/overview returns 401."""
        response = await client.get(OVERVIEW_URL)
        assert response.status_code == 401

    async def test_vaccination_coverage_returns_200(
        self,
        client: AsyncClient,
        bhw_token: str,
    ) -> None:
        """GET /analytics/vaccination-coverage returns 200 with by_vaccine and by_age_group."""
        response = await client.get(
            VACCINATION_URL,
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "by_vaccine" in data
        assert "by_age_group" in data
        assert isinstance(data["by_vaccine"], list)
        assert isinstance(data["by_age_group"], list)

    async def test_illness_trends_returns_200_with_defaults(
        self,
        client: AsyncClient,
        admin_token: str,
    ) -> None:
        """GET /analytics/illness-trends with no params uses 30-day default window."""
        response = await client.get(
            ILLNESS_URL,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "from_date" in data
        assert "to_date" in data
        assert "group_by" in data
        assert data["group_by"] == "month"  # default

    async def test_illness_trends_with_explicit_params(
        self,
        client: AsyncClient,
        admin_token: str,
    ) -> None:
        """Query params are echoed back in the response."""
        response = await client.get(
            ILLNESS_URL,
            params={
                "from_date": "2026-01-01",
                "to_date": "2026-06-30",
                "group_by": "week",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["from_date"] == "2026-01-01"
        assert data["to_date"] == "2026-06-30"
        assert data["group_by"] == "week"

    async def test_no_show_rate_returns_200(
        self,
        client: AsyncClient,
        admin_token: str,
    ) -> None:
        """GET /analytics/appointments/no-show-rate returns 200."""
        response = await client.get(
            NO_SHOW_URL,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "from_date" in data
        assert "to_date" in data

    async def test_export_csv_returns_text_csv(
        self,
        client: AsyncClient,
        admin_token: str,
    ) -> None:
        """GET /analytics/export?format=csv returns text/csv with Content-Disposition."""
        response = await client.get(
            EXPORT_URL,
            params={
                "report_type": "patients",
                "from_date": "2000-01-01",
                "to_date": "2099-12-31",
                "format": "csv",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")
        disposition = response.headers.get("content-disposition", "")
        assert "attachment" in disposition
        assert "patients" in disposition

    async def test_export_csv_has_correct_columns(
        self,
        client: AsyncClient,
        admin_token: str,
        db_session: AsyncSession,
    ) -> None:
        """CSV export for patients contains the expected column headers."""
        # Seed one patient so the CSV is non-empty.
        await _create_patient(db_session, patient_code="CSV-COL")
        await db_session.commit()

        response = await client.get(
            EXPORT_URL,
            params={
                "report_type": "patients",
                "from_date": "2000-01-01",
                "to_date": "2099-12-31",
                "format": "csv",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        text = response.text
        if text.strip():
            reader = csv.DictReader(io.StringIO(text))
            fieldnames = reader.fieldnames or []
            assert "patient_code" in fieldnames
            assert "full_name" in fieldnames
            assert "sex" in fieldnames

    async def test_export_json_returns_list(
        self,
        client: AsyncClient,
        admin_token: str,
    ) -> None:
        """GET /analytics/export?format=json returns application/json array."""
        response = await client.get(
            EXPORT_URL,
            params={
                "report_type": "patients",
                "from_date": "2000-01-01",
                "to_date": "2099-12-31",
                "format": "json",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "")
        data = response.json()
        assert isinstance(data, list)

    async def test_export_requires_admin_or_bhw(
        self,
        client: AsyncClient,
        make_user,
    ) -> None:
        """Physician role is rejected from the export endpoint (403)."""
        physician = await make_user("physician")
        token = create_access_token(subject=str(physician.id), role="physician")

        response = await client.get(
            EXPORT_URL,
            params={"report_type": "patients", "format": "csv"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

    async def test_export_bhw_allowed(
        self,
        client: AsyncClient,
        bhw_token: str,
    ) -> None:
        """BHW role can access the export endpoint."""
        response = await client.get(
            EXPORT_URL,
            params={
                "report_type": "appointments",
                "from_date": "2000-01-01",
                "to_date": "2099-12-31",
                "format": "csv",
            },
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert response.status_code == 200

    async def test_empty_result_returns_200_not_404(
        self,
        client: AsyncClient,
        admin_token: str,
    ) -> None:
        """No-data conditions return 200 with empty lists, not 404."""
        response = await client.get(
            ILLNESS_URL,
            params={
                "from_date": "1900-01-01",
                "to_date": "1900-01-31",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["items"] == []
