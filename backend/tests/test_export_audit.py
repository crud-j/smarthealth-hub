"""
Report export: who may export, the audit trail, and Admin model B.

GET /api/v1/analytics/export returns patient-level rows (names, patient
codes, ages and, for visits, the chief complaint). So:

  - Admin, BHW and Physician may export; Admin staff may not (no reporting duty).
  - Every export writes exactly one EXPORT_REPORT audit row that records what
    was exported (report type, date range, format, row count) but never the
    rows themselves.
  - Admin never reads clinical text (model B), so Admin's visits export has
    no chief_complaint column. BHW and Physician keep it.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.patient import Patient
from app.models.visit import Visit

EXPORT_URL = "/api/v1/analytics/export"
WIDE_RANGE = {"from_date": "2000-01-01", "to_date": "2099-12-31"}
COMPLAINT = "Ubo at sipon for three days"


async def _token(make_user, role: str) -> tuple[str, uuid.UUID]:
    user = await make_user(role)
    return create_access_token(subject=str(user.id), role=role), user.id


async def _patient_with_visit(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"EXA-{uuid.uuid4().hex[:6].upper()}",
        first_name="Exportia",
        last_name="Testcase",
        birth_date=datetime(1990, 1, 1).date(),
        sex="female",
        address="Barangay Test",
        is_active=True,
    )
    db.add(patient)
    await db.flush()
    db.add(
        Visit(
            id=uuid.uuid4(),
            patient_id=patient.id,
            visit_date=datetime.now(tz=UTC),
            visit_type="consultation",
            chief_complaint=COMPLAINT,
        )
    )
    await db.commit()
    return patient


async def _export_rows(db: AsyncSession) -> list[AuditLog]:
    result = await db.execute(sa.select(AuditLog).where(AuditLog.action == "EXPORT_REPORT"))
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Who may export
# ---------------------------------------------------------------------------


class TestExportRoles:
    async def test_physician_may_export(self, client: AsyncClient, make_user) -> None:
        token, _ = await _token(make_user, "physician")
        resp = await client.get(
            EXPORT_URL,
            params={"report_type": "visits", "format": "json", **WIDE_RANGE},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text

    async def test_admin_staff_may_not_export(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ) -> None:
        token, _ = await _token(make_user, "admin_staff")
        resp = await client.get(
            EXPORT_URL,
            params={"report_type": "patients", "format": "json", **WIDE_RANGE},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        assert await _export_rows(db_session) == []

    async def test_unauthenticated_export_is_401(self, client: AsyncClient) -> None:
        resp = await client.get(EXPORT_URL, params={"report_type": "patients"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------


class TestExportAudit:
    async def test_json_export_writes_one_audit_row(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ) -> None:
        patient = await _patient_with_visit(db_session)
        token, user_id = await _token(make_user, "bhw")

        resp = await client.get(
            EXPORT_URL,
            params={"report_type": "visits", "format": "json", **WIDE_RANGE},
            headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "198.51.100.9"},
        )
        assert resp.status_code == 200, resp.text
        row_count = len(resp.json())
        assert row_count >= 1

        rows = await _export_rows(db_session)
        assert len(rows) == 1
        entry = rows[0]
        assert entry.user_id == user_id
        assert entry.entity_type == "report"
        assert entry.entity_id is None
        assert entry.ip_address == "198.51.100.9"
        assert entry.metadata_ == {
            "report_type": "visits",
            "from_date": "2000-01-01",
            "to_date": "2099-12-31",
            "format": "json",
            "row_count": row_count,
            "role": "bhw",
        }

        # The audit row describes the export; it never copies its contents.
        flat = repr(entry.metadata_)
        for leaked in (patient.patient_code, patient.first_name, patient.last_name, COMPLAINT):
            assert leaked not in flat

    async def test_csv_export_is_audited_too(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ) -> None:
        token, _ = await _token(make_user, "admin")
        resp = await client.get(
            EXPORT_URL,
            params={"report_type": "appointments", "format": "csv", **WIDE_RANGE},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text

        rows = await _export_rows(db_session)
        assert len(rows) == 1
        assert rows[0].metadata_["format"] == "csv"
        assert rows[0].metadata_["report_type"] == "appointments"
        assert rows[0].metadata_["role"] == "admin"

    async def test_default_dates_are_recorded(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ) -> None:
        """Without dates the API exports the last 30 days; the audit row says which."""
        token, _ = await _token(make_user, "physician")
        resp = await client.get(
            EXPORT_URL,
            params={"report_type": "patients", "format": "json"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text

        meta = (await _export_rows(db_session))[0].metadata_
        assert meta["from_date"] < meta["to_date"]
        assert len(meta["from_date"]) == 10  # YYYY-MM-DD


# ---------------------------------------------------------------------------
# Admin model B: no clinical text
# ---------------------------------------------------------------------------


class TestAdminVisitsExport:
    async def test_admin_json_visits_export_has_no_chief_complaint(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ) -> None:
        await _patient_with_visit(db_session)
        token, _ = await _token(make_user, "admin")

        resp = await client.get(
            EXPORT_URL,
            params={"report_type": "visits", "format": "json", **WIDE_RANGE},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert rows, "expected the seeded visit"
        assert all("chief_complaint" not in r for r in rows)
        assert COMPLAINT not in resp.text
        # Still a useful visits report: who came, when, for what kind of visit.
        assert {"patient_code", "full_name", "visited_at", "visit_type"} <= set(rows[0])

    async def test_admin_csv_visits_export_has_no_chief_complaint(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ) -> None:
        await _patient_with_visit(db_session)
        token, _ = await _token(make_user, "admin")

        resp = await client.get(
            EXPORT_URL,
            params={"report_type": "visits", "format": "csv", **WIDE_RANGE},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text
        header = next(csv.reader(io.StringIO(resp.text)))
        assert "chief_complaint" not in header
        assert COMPLAINT not in resp.text

    async def test_bhw_and_physician_keep_chief_complaint(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ) -> None:
        await _patient_with_visit(db_session)
        for role in ("bhw", "physician"):
            token, _ = await _token(make_user, role)
            resp = await client.get(
                EXPORT_URL,
                params={"report_type": "visits", "format": "json", **WIDE_RANGE},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200, resp.text
            complaints = {r.get("chief_complaint") for r in resp.json()}
            assert COMPLAINT in complaints, role
