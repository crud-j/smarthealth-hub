"""
Health card generation, retrieval, and verification endpoints — Phase 3.

Routes use full paths and are mounted without a prefix on the API router.

  POST /health-cards/{patient_id}/generate      — generate card (QR + NFC payload)
  GET  /health-cards/{patient_id}               — get card metadata (no QR image)
  GET  /health-cards/{patient_id}/pdf           — render + stream printable PDF
  POST /health-cards/{patient_id}/nfc-link      — bind physical NFC UID to card
  POST /health-cards/{patient_id}/link-nfc-uid  — alias used by NFC relay testing
  POST /health-cards/verify                     — verify QR scan or NFC tap
  POST /health-cards/{patient_id}/reissue       — reissue lost/damaged card
  POST /health-cards/scan-uid                   — public NFC relay scan (no JWT)
  GET  /health-cards/last-scan                  — last NFC scan result cache (no JWT)

Security invariants enforced in this file:
  1. Every route requires JWT authentication, EXCEPT:
       - /health-cards/scan-uid  (hardware relay integration point)
       - /health-cards/last-scan (polling endpoint for NFC monitor page)
       - /health-cards/verify/public (QR mobile scan target)
  2. Mutation routes (generate, nfc-link, link-nfc-uid, reissue) require BHW+ role.
  3. The verify endpoint returns a GENERIC 403 for ALL failure modes —
     no information about WHY verification failed is exposed to the caller.
  4. The verify response contains ONLY PatientVerifySummary fields
     (patient_code, full_name, age, sex, priority flags, last_visit, card_status).
     No address, philhealth_no, diagnosis, or other PHI is returned.
  5. Every card event writes an audit log entry.
  6. scan-uid returns ONLY name, DOB, blood_type placeholder, emergency contact,
     allergies — never diagnosis, treatment_notes, or encrypted PHI fields.

SDP Reference: Section 6.6, Section 8
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.models.appointment import Appointment
from app.models.card_verification import CardVerification
from app.models.health_card import HealthCard
from app.models.immunization import Immunization
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.visit import Visit
from app.schemas.health_card import (
    BatchGenerateRequest,
    BatchGenerateResponse,
    BatchPdfRequest,
    BatchStatusResponse,
    BatchStatusResult,
    BulkCardStatusRequest,
    BulkCardStatusResponse,
    CardGenerateResponse,
    CardGenerationAccepted,
    CardGenerationStatus,
    CardStatusItem,
    CardVerifyRequest,
    HealthCardMaybeResponse,
    HealthCardResponse,
    NfcBatchItem,
    NfcBatchResponse,
    NfcLinkRequest,
    PatientVerifySummary,
    PatientVerifySummaryFull,
)
from app.services import card_generation_service, nfc_payload_service, qr_service
from app.services.card_generation_service import get_bulk_card_status
from app.services.audit_service import write_audit_log
from app.services.patient_service import get_patient

logger = get_logger(__name__)

router = APIRouter(tags=["health-cards"])

# ---------------------------------------------------------------------------
# In-memory last-scan cache — for NFC Wi-Fi relay testing only.
# Module-level dict; cleared when the process restarts.
# Never stores diagnosis, treatment_notes, or encrypted PHI.
# ---------------------------------------------------------------------------
_last_scan_cache: dict[str, Any] = {
    "scanned_at": None,
    "found": False,
    "uid": None,
    "patient": None,
}


# ---------------------------------------------------------------------------
# Request / response schemas for the NFC relay endpoints
# ---------------------------------------------------------------------------


class NfcScanUidRequest(BaseModel):
    """Body for POST /health-cards/scan-uid (sent by the relay server)."""

    uid: str = Field(..., min_length=1, max_length=64, description="Raw hardware NFC UID hex string")


class NfcScanPatientInfo(BaseModel):
    """Safe patient info returned by a successful NFC UID scan. No PHI beyond name/DOB/contact."""

    patient_id: str
    patient_code: str
    full_name: str
    date_of_birth: str
    sex: str
    blood_type: str | None
    emergency_contact_name: str | None
    emergency_contact_number: str | None
    allergies: str
    card_status: str
    is_senior: bool
    is_pwd: bool
    is_pregnant: bool


class NfcScanResponse(BaseModel):
    """Response body for POST /health-cards/scan-uid."""

    found: bool
    uid: str
    message: str
    patient: NfcScanPatientInfo | None = None


class LastScanResponse(BaseModel):
    """Response body for GET /health-cards/last-scan."""

    scanned_at: str | None
    found: bool
    uid: str | None
    patient: NfcScanPatientInfo | None = None


class ViewByIdentifierResponse(BaseModel):
    """Response body for GET /health-cards/view/{identifier} (JSON fallback)."""

    found: bool
    identifier: str
    message: str
    patient: NfcScanPatientInfo | None = None


# ---------------------------------------------------------------------------
# HTML rendering helpers for the NFC tap clinical view page
# ---------------------------------------------------------------------------

def _esc(value: object) -> str:
    """HTML-escape a value for safe embedding in the page."""
    import html as _html  # noqa: PLC0415
    return _html.escape(str(value)) if value is not None else ""


def _render_nfc_view_html(  # noqa: PLR0912, PLR0915
    *,
    patient: "Patient",
    card: "HealthCard",
    full_name: str,
    age: int,
    dob_str: str,
    conditions: list[str],
    latest_visit: "Visit | None",
    next_appointment: "Appointment | None",
    last_appointment: "Appointment | None",
    last_immunization: "Immunization | None",
    scanned_at_str: str,
) -> str:
    """
    Render the full clinical summary HTML page for an NFC tap view.

    Design principles:
    - Mobile-first, no external CSS (renders offline on BHW phones)
    - No encrypted PHI (diagnosis, treatment_notes, medical_history.notes)
    - Only condition_name (plain text), vital signs, appointments, immunization
    """
    # ── Vitals strip ─────────────────────────────────────────────────────────
    def _fmt(val: object, unit: str = "") -> str:
        if val is None:
            return "—"
        return f"{val}{unit}"

    bp = _esc(latest_visit.blood_pressure if latest_visit else None) or "—"
    weight = _fmt(latest_visit.weight_kg if latest_visit else None, " kg")
    height = _fmt(latest_visit.height_cm if latest_visit else None, " cm")
    temp = _fmt(latest_visit.temperature if latest_visit else None, "°C")
    pulse = _fmt(latest_visit.pulse_rate if latest_visit else None, " bpm")
    o2 = _fmt(latest_visit.oxygen_saturation if latest_visit else None, "%")
    visit_date_str = ""
    if latest_visit and latest_visit.visit_date:
        visit_date_str = latest_visit.visit_date.strftime("%b %d, %Y")

    # ── Address assembly ─────────────────────────────────────────────────────
    addr_parts = [
        patient.sitio_purok, patient.barangay,
        patient.municipality, patient.province,
    ]
    address_display = ", ".join(p for p in addr_parts if p) or _esc(patient.address) or "—"

    # ── PhilHealth ───────────────────────────────────────────────────────────
    philhealth_display = "—"
    if patient.philhealth_no:
        philhealth_display = _esc(patient.philhealth_no)
        if patient.philhealth_member_type:
            philhealth_display += f" ({_esc(patient.philhealth_member_type.capitalize())})"

    # ── Emergency contact ─────────────────────────────────────────────────────
    ec_name = _esc(patient.emergency_contact_name or patient.guardian_name or "")
    ec_number = _esc(patient.emergency_contact_number or patient.guardian_contact or "")

    # ── Special flags badges ─────────────────────────────────────────────────
    badges_html = ""
    if patient.is_senior:
        badges_html += '<span class="badge badge-senior">SENIOR</span> '
    if patient.is_pwd:
        badges_html += '<span class="badge badge-pwd">PWD</span> '
    if patient.is_pregnant:
        badges_html += '<span class="badge badge-pregnant">PREGNANT</span> '

    # ── Card status ───────────────────────────────────────────────────────────
    status_color = "#16a34a" if card.status == "active" else "#f59e0b"
    status_label = card.status.upper()
    issued_str = card.issued_at.strftime("%b %d, %Y") if card.issued_at else "—"

    # ── Medical conditions ────────────────────────────────────────────────────
    if conditions:
        conditions_html = "".join(
            f'<li class="condition-item">{_esc(c)}</li>' for c in conditions
        )
        conditions_section = f'<ul class="condition-list">{conditions_html}</ul>'
    else:
        conditions_section = '<p class="empty-note">No conditions on record.</p>'

    # ── Next appointment ──────────────────────────────────────────────────────
    if next_appointment:
        appt_dt = next_appointment.scheduled_at
        appt_date = appt_dt.strftime("%b %d, %Y") if appt_dt else "—"
        appt_time = appt_dt.strftime("%I:%M %p") if appt_dt else ""
        appt_type = _esc(next_appointment.appointment_type.replace("_", " ").title())
        appt_status = _esc(next_appointment.status.upper())
        next_appt_html = f"""
        <div class="appt-card upcoming">
          <div class="appt-label">UPCOMING APPOINTMENT</div>
          <div class="appt-date">{_esc(appt_date)}</div>
          <div class="appt-meta">{_esc(appt_time)} &nbsp;·&nbsp; {appt_type}</div>
          <div class="appt-status">{appt_status}</div>
        </div>"""
    else:
        next_appt_html = '<p class="empty-note">No upcoming appointments.</p>'

    # ── Last visit date (from visit record, not appointment) ──────────────────
    last_visit_html = (
        f'<span class="meta-value">{_esc(visit_date_str)}</span>'
        if visit_date_str
        else '<span class="meta-value">—</span>'
    )

    # ── Immunization ──────────────────────────────────────────────────────────
    if last_immunization:
        imm_vaccine = _esc(last_immunization.vaccine_name)
        imm_dose = last_immunization.dose_number
        imm_date = (
            last_immunization.date_administered.strftime("%b %d, %Y")
            if last_immunization.date_administered
            else "—"
        )
        imm_next = (
            last_immunization.next_due_date.strftime("%b %d, %Y")
            if last_immunization.next_due_date
            else None
        )
        imm_html = f"""
        <div class="imm-row">
          <span class="imm-vaccine">{imm_vaccine} (Dose {imm_dose})</span>
          <span class="imm-date">Administered: {_esc(imm_date)}</span>
          {f'<span class="imm-next">Next due: {_esc(imm_next)}</span>' if imm_next else ""}
        </div>"""
    else:
        imm_html = '<p class="empty-note">No immunization records.</p>'

    # ── Allergies section ─────────────────────────────────────────────────────
    allergy_text = _esc(patient.allergies) if patient.allergies else None
    if allergy_text:
        allergy_html = f'<p class="allergy-text">{allergy_text}</p>'
    else:
        allergy_html = '<p class="empty-note">None recorded.</p>'

    # ── Sex display ───────────────────────────────────────────────────────────
    sex_display = patient.sex.capitalize() if patient.sex else "—"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>Patient Card &mdash; {_esc(full_name)}</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --blue:     #1a5fa8;
      --blue-dk:  #134b85;
      --blue-lt:  #e8f1fb;
      --green:    #16a34a;
      --green-lt: #f0fdf4;
      --orange:   #c2590a;
      --orange-lt:#fff7ed;
      --red:      #dc2626;
      --red-lt:   #fef2f2;
      --gray:     #64748b;
      --gray-lt:  #f8fafc;
      --border:   #e2e8f0;
      --text:     #0f172a;
      --radius:   14px;
    }}
    body {{
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #f0f5ff;
      color: var(--text);
      min-height: 100vh;
      padding: 0 0 40px;
    }}

    /* ── Header ───────────────────────────────────────────────────────── */
    .page-header {{
      background: var(--blue);
      color: #fff;
      padding: 20px 18px 18px;
      position: relative;
    }}
    .facility-name {{
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      opacity: 0.75;
      text-transform: uppercase;
      margin-bottom: 6px;
    }}
    .patient-name {{
      font-size: 26px;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 6px;
    }}
    .header-meta {{
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
    }}
    .patient-code-badge {{
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.30);
      border-radius: 20px;
      padding: 3px 12px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }}
    .card-status-badge {{
      border-radius: 20px;
      padding: 3px 12px;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      background: {status_color};
    }}

    /* ── Special flags ────────────────────────────────────────────────── */
    .badge {{
      display: inline-block;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #fff;
    }}
    .badge-senior   {{ background: #7c3aed; }}
    .badge-pwd      {{ background: #0369a1; }}
    .badge-pregnant {{ background: #be185d; }}
    .flags-row {{ margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }}

    /* ── Vitals strip ─────────────────────────────────────────────────── */
    .vitals-strip {{
      background: var(--blue-dk);
      padding: 14px 18px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }}
    .vital-chip {{
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 10px;
      padding: 10px 8px;
      text-align: center;
      color: #fff;
    }}
    .vital-label {{
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.70;
      margin-bottom: 4px;
    }}
    .vital-value {{
      font-size: 16px;
      font-weight: 800;
    }}
    .vital-chip.wide {{
      grid-column: span 3;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 12px;
    }}
    .vital-chip.wide .vital-label {{ margin: 0; }}
    .vital-chip.wide .vital-value {{ font-size: 14px; }}
    .visit-date-note {{
      color: rgba(255,255,255,0.60);
      font-size: 11px;
      text-align: center;
      padding: 6px 18px 12px;
      background: var(--blue-dk);
    }}

    /* ── Content area ─────────────────────────────────────────────────── */
    .content {{ padding: 16px 14px; }}

    /* ── Section cards ────────────────────────────────────────────────── */
    .section {{
      background: #fff;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      margin-bottom: 12px;
      overflow: hidden;
    }}
    .section-header {{
      padding: 12px 16px 10px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .section-icon {{
      font-size: 16px;
      line-height: 1;
    }}
    .section-title {{
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--blue);
    }}
    .section-body {{ padding: 14px 16px; }}

    /* ── Key-value rows ───────────────────────────────────────────────── */
    .kv-table {{ width: 100%; border-collapse: collapse; }}
    .kv-table tr + tr td {{ border-top: 1px solid var(--border); }}
    .kv-table td {{ padding: 10px 0; vertical-align: top; }}
    .kv-table td:first-child {{
      width: 42%;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--gray);
      padding-right: 8px;
    }}
    .kv-table td:last-child {{
      font-size: 15px;
      font-weight: 500;
      color: var(--text);
    }}

    /* ── Conditions list ──────────────────────────────────────────────── */
    .condition-list {{
      list-style: none;
      padding: 0;
    }}
    .condition-item {{
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: 15px;
      font-weight: 500;
      color: var(--text);
    }}
    .condition-item::before {{
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--red);
      flex-shrink: 0;
      margin-top: 5px;
    }}
    .condition-item:last-child {{ border-bottom: none; }}

    /* ── Allergy section ──────────────────────────────────────────────── */
    .allergy-box {{
      background: var(--red-lt);
      border: 1px solid #fca5a5;
      border-radius: 10px;
      padding: 12px 14px;
    }}
    .allergy-text {{
      font-size: 15px;
      font-weight: 600;
      color: var(--red);
    }}

    /* ── Appointment card ─────────────────────────────────────────────── */
    .appt-card {{
      border-radius: 10px;
      padding: 14px;
      border: 1px solid var(--border);
    }}
    .appt-card.upcoming {{
      background: var(--blue-lt);
      border-color: #93c5fd;
    }}
    .appt-label {{
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--blue);
      margin-bottom: 4px;
    }}
    .appt-date {{
      font-size: 20px;
      font-weight: 800;
      color: var(--blue);
      margin-bottom: 2px;
    }}
    .appt-meta {{
      font-size: 13px;
      color: var(--gray);
      margin-bottom: 6px;
    }}
    .appt-status {{
      display: inline-block;
      background: var(--blue);
      color: #fff;
      border-radius: 6px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
    }}

    /* ── Immunization ─────────────────────────────────────────────────── */
    .imm-row {{ padding: 4px 0; }}
    .imm-vaccine {{
      display: block;
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }}
    .imm-date, .imm-next {{
      display: block;
      font-size: 13px;
      color: var(--gray);
      margin-bottom: 2px;
    }}
    .imm-next {{ color: var(--green); font-weight: 600; }}

    /* ── Emergency contact ────────────────────────────────────────────── */
    .ec-box {{
      background: var(--orange-lt);
      border: 1px solid #fdba74;
      border-radius: 10px;
      padding: 14px;
    }}
    .ec-name {{
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 6px;
    }}
    .ec-call-btn {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--orange);
      color: #fff;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      margin-top: 8px;
    }}

    /* ── Meta row ─────────────────────────────────────────────────────── */
    .meta-row {{
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--gray);
      margin-top: 4px;
    }}
    .meta-label {{ font-weight: 700; text-transform: uppercase; font-size: 10px; }}
    .meta-value {{ font-weight: 600; color: var(--text); }}

    /* ── Footer ───────────────────────────────────────────────────────── */
    .footer {{
      margin: 24px 14px 0;
      background: #fff;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      padding: 16px;
    }}
    .footer-title {{
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--blue);
      margin-bottom: 8px;
    }}
    .footer-kv {{ font-size: 13px; color: var(--gray); margin-bottom: 4px; }}
    .footer-kv strong {{ color: var(--text); }}
    .footer-disclaimer {{
      margin-top: 12px;
      font-size: 11px;
      color: var(--gray);
      line-height: 1.5;
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }}

    .empty-note {{
      font-size: 14px;
      color: var(--gray);
      font-style: italic;
    }}
  </style>
</head>
<body>

  <!-- ── Header ─────────────────────────────────────────────────────────── -->
  <div class="page-header">
    <div class="facility-name">Sta. Rosa 1 BHS &mdash; SmartHealth Hub</div>
    <div class="patient-name">{_esc(full_name)}</div>
    <div class="header-meta">
      <span class="patient-code-badge">{_esc(patient.patient_code)}</span>
      <span class="card-status-badge">{_esc(status_label)}</span>
    </div>
    {f'<div class="flags-row">{badges_html}</div>' if badges_html.strip() else ""}
  </div>

  <!-- ── Vitals strip ────────────────────────────────────────────────────── -->
  <div class="vitals-strip">
    <div class="vital-chip">
      <div class="vital-label">Blood Pressure</div>
      <div class="vital-value">{bp}</div>
    </div>
    <div class="vital-chip">
      <div class="vital-label">Weight</div>
      <div class="vital-value">{_esc(weight)}</div>
    </div>
    <div class="vital-chip">
      <div class="vital-label">Height</div>
      <div class="vital-value">{_esc(height)}</div>
    </div>
    <div class="vital-chip">
      <div class="vital-label">Temp</div>
      <div class="vital-value">{_esc(temp)}</div>
    </div>
    <div class="vital-chip">
      <div class="vital-label">Pulse</div>
      <div class="vital-value">{_esc(pulse)}</div>
    </div>
    <div class="vital-chip">
      <div class="vital-label">SpO2</div>
      <div class="vital-value">{_esc(o2)}</div>
    </div>
  </div>
  {f'<div class="visit-date-note">Vitals from last visit: {_esc(visit_date_str)}</div>' if visit_date_str else '<div class="visit-date-note">No visit records on file.</div>'}

  <div class="content">

    <!-- ── Demographics ─────────────────────────────────────────────────── -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">&#x1F464;</span>
        <span class="section-title">Demographics</span>
      </div>
      <div class="section-body">
        <table class="kv-table">
          <tr><td>Age</td><td>{_esc(age)} yrs &nbsp;({_esc(dob_str)})</td></tr>
          <tr><td>Sex</td><td>{_esc(sex_display)}</td></tr>
          <tr><td>Blood Type</td><td>{_esc(patient.blood_type) if patient.blood_type else "—"}</td></tr>
          <tr><td>Address</td><td>{address_display}</td></tr>
          <tr><td>PhilHealth</td><td>{philhealth_display}</td></tr>
        </table>
      </div>
    </div>

    <!-- ── Allergies ─────────────────────────────────────────────────────── -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">&#x26A0;&#xFE0F;</span>
        <span class="section-title">Known Allergies</span>
      </div>
      <div class="section-body">
        <div class="allergy-box">
          {allergy_html}
        </div>
      </div>
    </div>

    <!-- ── Active Medical Conditions ────────────────────────────────────── -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">&#x1FA7A;</span>
        <span class="section-title">Medical Conditions</span>
      </div>
      <div class="section-body">
        {conditions_section}
      </div>
    </div>

    <!-- ── Upcoming Appointment ──────────────────────────────────────────── -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">&#x1F4C5;</span>
        <span class="section-title">Appointments</span>
      </div>
      <div class="section-body">
        {next_appt_html}
        <div class="meta-row" style="margin-top:12px;">
          <span class="meta-label">Last Visit</span>
          {last_visit_html}
        </div>
      </div>
    </div>

    <!-- ── Immunizations ─────────────────────────────────────────────────── -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">&#x1F489;</span>
        <span class="section-title">Last Immunization</span>
      </div>
      <div class="section-body">
        {imm_html}
      </div>
    </div>

    <!-- ── Emergency Contact ─────────────────────────────────────────────── -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">&#x1F6A8;</span>
        <span class="section-title">Emergency Contact</span>
      </div>
      <div class="section-body">
        <div class="ec-box">
          <div class="ec-name">{ec_name if ec_name else "—"}</div>
          {f'<a class="ec-call-btn" href="tel:{ec_number}">&#x1F4DE; Call {ec_number}</a>' if ec_number else '<span style="font-size:14px;color:#64748b;">No contact number on file.</span>'}
        </div>
      </div>
    </div>

  </div><!-- /.content -->

  <!-- ── Card Info Footer ───────────────────────────────────────────────── -->
  <div class="footer">
    <div class="footer-title">Health Card Info</div>
    <div class="footer-kv">Card No.: <strong>{_esc(card.card_number)}</strong></div>
    <div class="footer-kv">Version: <strong>v{_esc(card.card_version)}</strong></div>
    <div class="footer-kv">Issued: <strong>{_esc(issued_str)}</strong></div>
    <div class="footer-kv">Scanned: <strong>{_esc(scanned_at_str)}</strong></div>
    <div class="footer-disclaimer">
      This page is a clinical summary for authorized Barangay Health Worker use only.
      Encrypted clinical notes are not shown. This record is access-logged.
    </div>
  </div>

</body>
</html>"""


def _render_nfc_not_found_html(identifier: str, reason: str = "Health card not found.") -> str:
    """Render a clean 'not found' HTML page for invalid or missing card taps."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Card Not Found &mdash; SmartHealth Hub</title>
  <style>
    body {{
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #f0f5ff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      color: #0f172a;
    }}
    .card {{
      background: #fff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      padding: 32px 24px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }}
    .icon {{ font-size: 48px; margin-bottom: 16px; }}
    h1 {{ font-size: 22px; font-weight: 800; color: #dc2626; margin-bottom: 8px; }}
    p {{ font-size: 15px; color: #64748b; line-height: 1.6; }}
    .id {{ font-family: monospace; font-size: 13px; background: #f8fafc;
            padding: 6px 10px; border-radius: 6px; margin-top: 12px;
            color: #475569; display: inline-block; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#x274C;</div>
    <h1>Card Not Found</h1>
    <p>{_esc(reason)}</p>
    <div class="id">{_esc(identifier[:32])}</div>
  </div>
</body>
</html>"""


# ── Role groups ───────────────────────────────────────────────────────────────
# BHW, Physician, Admin Staff, and Admin may mutate cards.
_BHW_PLUS = require_role("bhw", "physician", "admin_staff", "admin")


# ---------------------------------------------------------------------------
# Generic verify 403 — identical message for ALL failure modes (no info leak)
# ---------------------------------------------------------------------------

_VERIFY_FAIL = ForbiddenError(
    "Card could not be verified.",
    detail={"code": "invalid_card", "message": "Card verification failed."},
)


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP from request, handling common proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return getattr(request.client, "host", None)


# ---------------------------------------------------------------------------
# POST /health-cards/scan-uid  [PUBLIC — no JWT]
# NOTE: Declared FIRST so FastAPI does not treat "scan-uid" as a patient_id UUID.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/scan-uid",
    response_model=NfcScanResponse,
    summary="NFC relay scan — look up patient by raw hardware UID (no auth required)",
    description=(
        "Accepts a raw NFC hardware UID hex string from the Wi-Fi relay server.  "
        "Looks up the health_cards table for a matching nfc_uid (case-insensitive).  "
        "Returns safe patient info (name, DOB, blood type, emergency contact, allergies).  "
        "NO diagnosis, treatment_notes, or encrypted PHI is returned.  "
        "Writes an NFC_SCAN audit log entry.  No JWT required — the relay server "
        "is the hardware integration point and cannot hold credentials."
    ),
)
async def scan_nfc_uid_early(
    body: NfcScanUidRequest,
    request: Request,
    db: DbDep,
) -> NfcScanResponse:
    """Thin shim — delegates to the implementation function below."""
    return await _scan_nfc_uid_impl(body, request, db)


# ---------------------------------------------------------------------------
# GET /health-cards/last-scan  [PUBLIC — no JWT]
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/last-scan",
    response_model=LastScanResponse,
    summary="Return the most recent NFC scan result from in-memory cache (no auth required)",
    description=(
        "Returns the last NFC UID scan result cached by POST /health-cards/scan-uid.  "
        "Intended for the /nfc-monitor polling page during Wi-Fi relay testing.  "
        "No JWT required.  Cache resets when the FastAPI process restarts.  "
        "Returns scanned_at=None when no scan has been received yet."
    ),
)
async def get_last_scan_early() -> LastScanResponse:
    """Thin shim — delegates to the implementation function below."""
    return await _get_last_scan_impl()


# ---------------------------------------------------------------------------
# GET /health-cards/view/{identifier}  [PUBLIC — no JWT]
# Full clinical summary page returned as HTML for NFC tap browser view.
# Lookup by card_number first, then nfc_uid (case-insensitive fallback).
# PHI invariants: diagnosis, treatment_notes, medical_history.notes NEVER shown.
# Writes PHI-VIEW audit log on every successful load.
# NOTE: Declared BEFORE /{patient_id} routes to avoid path-param conflicts.
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/view/{identifier}",
    summary="Clinical summary view for NFC tap — returns rich HTML (no auth required)",
    description=(
        "Accepts a health card code (e.g. HC-2026-00004) or a raw NFC UID.  "
        "Returns a mobile-optimised HTML page with a full clinical summary: "
        "vitals from the latest visit, medical condition names (plain-text only — "
        "encrypted notes are NEVER shown), upcoming appointments, last immunization, "
        "and emergency contact.  "
        "Writes a PHI-VIEW audit log entry on every successful lookup.  "
        "No JWT required — the NFC chip itself is the access credential.  "
        "PHI invariants: diagnosis, treatment_notes, and medical_history.notes "
        "are NEVER included in the response."
    ),
    response_class=HTMLResponse,
)
async def view_health_card_by_identifier(
    identifier: str,
    request: Request,
    db: DbDep,
) -> HTMLResponse:
    """
    Full clinical summary page for NFC tap.

    Security design:
    - NO diagnosis, treatment_notes, or medical_history.notes (all encrypted PHI).
    - condition_name is plain-text and safe to display.
    - Audit log: PHI-VIEW written for every successful patient load.
    - Cache update mirrors POST /scan-uid for the relay monitor page.
    """
    from datetime import date as _date  # noqa: PLC0415
    from urllib.parse import unquote as _unquote  # noqa: PLC0415

    raw_identifier = _unquote(identifier).strip()
    scanned_at_now = datetime.now(timezone.utc)
    scanned_at_iso = scanned_at_now.isoformat()
    scanned_at_str = scanned_at_now.strftime("%b %d, %Y %I:%M %p")
    id_prefix = raw_identifier[:8] + ("..." if len(raw_identifier) > 8 else "")

    # ── Try card_number match first ───────────────────────────────────────────
    card_result = await db.execute(
        select(HealthCard).where(HealthCard.card_number == raw_identifier)
    )
    card: HealthCard | None = card_result.scalar_one_or_none()

    # ── Fallback: case-insensitive nfc_uid match ──────────────────────────────
    if card is None:
        card_result2 = await db.execute(
            select(HealthCard).where(
                func.upper(HealthCard.nfc_uid) == raw_identifier.upper()
            )
        )
        card = card_result2.scalar_one_or_none()

    # ── Not found ─────────────────────────────────────────────────────────────
    if card is None:
        _last_scan_cache.update(
            scanned_at=scanned_at_iso, found=False, uid=raw_identifier, patient=None,
        )
        await write_audit_log(
            db=db,
            action="HEALTH_CARD_VIEW",
            entity_type="health_card",
            metadata={
                "result": "not_found",
                "identifier_prefix": id_prefix,
                "ip": _get_client_ip(request),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return HTMLResponse(
            content=_render_nfc_not_found_html(raw_identifier, "Health card not found."),
            status_code=404,
        )

    # ── Load patient ──────────────────────────────────────────────────────────
    patient_result = await db.execute(
        select(Patient).where(Patient.id == card.patient_id)
    )
    patient: Patient | None = patient_result.scalar_one_or_none()

    if patient is None or not patient.is_active:
        _last_scan_cache.update(
            scanned_at=scanned_at_iso, found=False, uid=raw_identifier, patient=None,
        )
        await write_audit_log(
            db=db,
            action="HEALTH_CARD_VIEW",
            entity_type="health_card",
            entity_id=card.id,
            metadata={
                "result": "patient_inactive_or_missing",
                "identifier_prefix": id_prefix,
                "card_id": str(card.id),
                "ip": _get_client_ip(request),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return HTMLResponse(
            content=_render_nfc_not_found_html(
                raw_identifier, "Patient record not found or has been deactivated."
            ),
            status_code=404,
        )

    # ── Full name and age ─────────────────────────────────────────────────────
    name_parts = [patient.first_name]
    if patient.middle_name:
        name_parts.append(patient.middle_name)
    name_parts.append(patient.last_name)
    full_name = " ".join(name_parts)

    today = _date.today()
    bd = patient.birth_date
    age = (
        today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
        if bd
        else 0
    )
    dob_str = bd.strftime("%b %d, %Y") if bd else "Unknown"

    # ── Latest visit vitals (NO diagnosis/treatment_notes — encrypted PHI) ────
    visit_result = await db.execute(
        select(Visit)
        .where(Visit.patient_id == patient.id)
        .order_by(Visit.visit_date.desc())
        .limit(1)
    )
    latest_visit: Visit | None = visit_result.scalar_one_or_none()

    # ── Medical conditions (condition_name only — notes column NOT read) ───────
    conditions_result = await db.execute(
        select(MedicalHistory.condition_name)
        .where(MedicalHistory.patient_id == patient.id)
        .order_by(MedicalHistory.created_at.asc())
    )
    conditions: list[str] = [row for row in conditions_result.scalars().all() if row]

    # ── Upcoming appointment (next pending/confirmed after now) ───────────────
    now_utc = datetime.now(timezone.utc)
    upcoming_result = await db.execute(
        select(Appointment)
        .where(
            Appointment.patient_id == patient.id,
            Appointment.status.in_(["pending", "confirmed"]),
            Appointment.scheduled_at >= now_utc,
        )
        .order_by(Appointment.scheduled_at.asc())
        .limit(1)
    )
    next_appointment: Appointment | None = upcoming_result.scalar_one_or_none()

    # ── Most recent past appointment ──────────────────────────────────────────
    last_appt_result = await db.execute(
        select(Appointment)
        .where(
            Appointment.patient_id == patient.id,
            Appointment.scheduled_at < now_utc,
        )
        .order_by(Appointment.scheduled_at.desc())
        .limit(1)
    )
    last_appointment: Appointment | None = last_appt_result.scalar_one_or_none()

    # ── Last completed immunization ───────────────────────────────────────────
    imm_result = await db.execute(
        select(Immunization)
        .where(
            Immunization.patient_id == patient.id,
            Immunization.status == "completed",
            Immunization.date_administered.is_not(None),
        )
        .order_by(Immunization.date_administered.desc())
        .limit(1)
    )
    last_immunization: Immunization | None = imm_result.scalar_one_or_none()

    # ── Build relay monitor cache entry (mirrors _scan_nfc_uid_impl) ──────────
    allergies_str = patient.allergies or "None on record"
    patient_info = NfcScanPatientInfo(
        patient_id=str(patient.id),
        patient_code=patient.patient_code,
        full_name=full_name,
        date_of_birth=dob_str,
        sex=patient.sex,
        blood_type=patient.blood_type,
        emergency_contact_name=patient.emergency_contact_name or patient.guardian_name,
        emergency_contact_number=patient.emergency_contact_number or patient.guardian_contact,
        allergies=allergies_str,
        card_status=card.status,
        is_senior=patient.is_senior,
        is_pwd=patient.is_pwd,
        is_pregnant=patient.is_pregnant,
    )
    _last_scan_cache.update(
        scanned_at=scanned_at_iso,
        found=True,
        uid=raw_identifier,
        patient=patient_info.model_dump(),
    )

    # ── PHI-VIEW audit log — required for NFC clinical summary access ─────────
    await write_audit_log(
        db=db,
        action="PHI-VIEW",
        entity_type="health_card",
        entity_id=card.id,
        metadata={
            "trigger": "nfc_tap_view",
            "result": "found",
            "identifier_prefix": id_prefix,
            "patient_name": full_name,
            "card_status": card.status,
            "fields_shown": [
                "full_name", "age", "sex", "blood_type", "address",
                "philhealth_no", "allergies", "condition_names",
                "vitals_last_visit", "upcoming_appointment",
                "last_immunization", "emergency_contact",
            ],
            "encrypted_fields_excluded": [
                "visits.diagnosis", "visits.treatment_notes",
                "medical_history.notes",
            ],
            "ip": _get_client_ip(request),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    # ── Render and return the full HTML clinical summary ──────────────────────
    html_content = _render_nfc_view_html(
        patient=patient,
        card=card,
        full_name=full_name,
        age=age,
        dob_str=dob_str,
        conditions=conditions,
        latest_visit=latest_visit,
        next_appointment=next_appointment,
        last_appointment=last_appointment,
        last_immunization=last_immunization,
        scanned_at_str=scanned_at_str,
    )
    return HTMLResponse(content=html_content, status_code=200)


# ---------------------------------------------------------------------------
# POST /health-cards/status-bulk
# NOTE: Declared BEFORE /health-cards/{patient_id}/... routes so FastAPI does
#       not treat "status-bulk" as a patient_id UUID path parameter.
# Auth: Any authenticated user (all roles need this to render the list page).
# No audit log — read-only status metadata, no PHI returned.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/status-bulk",
    response_model=BulkCardStatusResponse,
    summary="Get health card status for multiple patients in a single request",
    description=(
        "Returns card status metadata (status, card_number, card_id) for up to "
        "100 patient IDs in a single SELECT ... WHERE patient_id IN (...) query.  "
        "Eliminates the N+1 fetch pattern on the health-cards list page.  "
        "Patients without a card row receive status='none'.  "
        "No PHI is returned — only card metadata.  Any authenticated role may call this."
    ),
)
async def get_bulk_health_card_status(
    request_body: BulkCardStatusRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> BulkCardStatusResponse:
    status_map = await get_bulk_card_status(request_body.patient_ids, db)
    items = [
        CardStatusItem(
            patient_id=pid_uuid,
            status=data["status"],
            card_number=data["card_number"],
            card_id=uuid.UUID(data["card_id"]) if data["card_id"] else None,
            card_version=data["card_version"],
        )
        for pid_uuid, data in (
            (uuid.UUID(pid_str), status_map[pid_str])
            for pid_str in status_map
        )
    ]
    return BulkCardStatusResponse(items=items)


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/generate
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/generate",
    status_code=201,
    response_model=CardGenerateResponse,
    summary="Generate health card (QR + NFC payload) for a patient",
    description=(
        "Issues a new active health card row synchronously (idempotent — returns "
        "the existing active card if one already exists, replacing any PENDING- "
        "placeholder with a real BHC-YEAR-XXXXXX number immediately).  "
        "After the card row is committed, WeasyPrint PDF rendering is dispatched "
        "to a Celery background task asynchronously — the endpoint does NOT wait "
        "for the PDF.  "
        "The response includes the real card_number, qr_data_uri, and nfc_payload "
        "immediately so the frontend can display the card and offer a Download PDF "
        "button that polls GET /health-cards/generation-status/{card_id}.  "
        "Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def generate_health_card(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> CardGenerateResponse:
    # 1. Create (or retrieve existing) health card row synchronously.
    #    generate_card() always returns a real BHC-YEAR-XXXXXX card_number —
    #    it replaces any PENDING- placeholder in-place before returning.
    result = await card_generation_service.generate_card(
        db=db,
        patient_id=patient_id,
        issued_by_id=current_user.id,
        ip_address=_get_client_ip(request),
    )
    card_dict = result["card"]
    card_id: str = card_dict["id"]  # type: ignore[assignment]

    # 2. Reset generation_status to "pending" on the card row so the status
    #    endpoint reflects the async PDF-dispatch state correctly.
    card_result = await db.execute(
        select(HealthCard).where(HealthCard.id == uuid.UUID(card_id))
    )
    card: HealthCard | None = card_result.scalar_one_or_none()
    if card is not None:
        card.generation_status = "pending"
        card.pdf_url = None
        await db.commit()

    # 3. Dispatch the PDF generation task to Celery (fire-and-forget).
    #    If Celery is unavailable the task dispatch raises; we catch and log
    #    but still return 200 with the card data — PDF can be generated later
    #    via GET /health-cards/{patient_id}/pdf which renders synchronously.
    try:
        from app.workers.health_card_tasks import generate_health_card_pdf_task  # noqa: PLC0415

        task = generate_health_card_pdf_task.delay(str(patient_id), card_id)
        logger.info(
            "Health card PDF generation dispatched to Celery",
            extra={"patient_id": str(patient_id), "card_id": card_id, "task_id": task.id},
        )
    except Exception as celery_exc:  # noqa: BLE001
        # Celery is likely not running — log a warning but do NOT fail the request.
        # The card row is committed with a real card_number; PDF can be generated
        # on-demand via GET /health-cards/{patient_id}/pdf.
        logger.warning(
            "Health card PDF task could not be dispatched to Celery — Celery may not be running. "
            "PDF will be generated on-demand via the /pdf endpoint.",
            extra={
                "patient_id": str(patient_id),
                "card_id": card_id,
                "error": str(celery_exc),
            },
        )
        # Mark generation_status as failed so the UI can fall back to /pdf.
        if card is not None:
            try:
                card.generation_status = "failed"
                await db.commit()
            except Exception:  # noqa: BLE001
                pass

    # 4. Return the card data with real card_number immediately (HTTP 200).
    return CardGenerateResponse(
        card=HealthCardResponse(**card_dict, qr_data_uri=result["qr_data_uri"]),
        signed_url=result["signed_url"],
        qr_data_uri=result["qr_data_uri"],
        nfc_payload=result["nfc_payload"],
    )


# ---------------------------------------------------------------------------
# GET /health-cards/generation-status/{card_id}
# ---------------------------------------------------------------------------

# NOTE: This route must be declared BEFORE /health-cards/{patient_id} routes
#       so FastAPI does not interpret "generation-status" as a patient_id UUID.
#       However, since this router is mounted with full paths, the "generation-status"
#       prefix is unambiguous — FastAPI won't confuse it with a UUID path param.

@router.get(
    "/health-cards/generation-status/{card_id}",
    response_model=CardGenerationStatus,
    summary="Poll async health card PDF generation status",
    description=(
        "Returns the current generation_status for a health card: "
        "'pending' (queued/rendering), 'ready' (PDF on disk — pdf_url is set), "
        "or 'failed' (error — retry by calling POST .../generate again).  "
        "No audit log written — this is a non-PHI status check."
    ),
)
async def get_generation_status(
    card_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> CardGenerationStatus:
    card_result = await db.execute(
        select(HealthCard).where(HealthCard.id == card_id)
    )
    card: HealthCard | None = card_result.scalar_one_or_none()
    if card is None:
        raise NotFoundError(f"Health card {card_id} not found.")
    return CardGenerationStatus(
        card_id=str(card.id),
        status=card.generation_status,
        pdf_url=card.pdf_url,
    )


# ---------------------------------------------------------------------------
# POST /health-cards/batch-pdf
# NOTE: Declared BEFORE /health-cards/{patient_id} routes so FastAPI does
#       not interpret "batch-pdf" as a patient_id UUID path parameter.
# ---------------------------------------------------------------------------

_BATCH_PDF_ROLES = require_role("admin", "bhw")


@router.post(
    "/health-cards/batch-pdf",
    summary="Generate a multi-page PDF for multiple patients' health cards",
    description=(
        "Renders a single PDF containing the health cards for up to 50 patients.  "
        "Each patient occupies 2 pages (front + back).  "
        "Patients without an active health card are silently skipped.  "
        "Requires admin or bhw role.  One audit_log row is written per request."
    ),
    dependencies=[_BATCH_PDF_ROLES],
)
async def batch_health_card_pdf(
    body: BatchPdfRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> Response:
    """
    Build a batch multi-page PDF for the requested patient health cards.

    Processing order:
      1. For each patient_id, load the Patient and their active HealthCard.
         Patients without an active card are logged as a WARNING and skipped.
      2. Generate the QR data URI for each card (patient_id + card_version +
         HMAC only — no PHI in the QR payload).
      3. Resolve each patient's profile photo as a base64 data URI (async,
         before entering the synchronous WeasyPrint renderer).
      4. Call render_batch_health_card_pdf() in a thread pool.
      5. Write a single BATCH_PDF audit log entry.
      6. Return the raw PDF bytes as a downloadable attachment.

    Security invariants:
      - QR payloads contain ONLY patient_id + card_version + HMAC sig.
      - Only admin and bhw roles may call this endpoint (HTTP 403 for others).
      - One audit row per request (not per patient) to avoid log spam.
    """
    from datetime import date as _date  # noqa: PLC0415

    from app.services.patient_photo_service import get_photo_data_uri  # noqa: PLC0415
    from app.services.pdf_renderer import render_batch_health_card_pdf  # noqa: PLC0415

    cards: list[tuple[dict[str, object], dict[str, object], str, str | None]] = []

    _today = _date.today()

    for patient_id in body.patient_ids:
        # ── Load patient ──────────────────────────────────────────────────
        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient: Patient | None = patient_result.scalar_one_or_none()

        if patient is None or not patient.is_active:
            logger.warning(
                "batch_health_card_pdf: patient %s not found or inactive — skipping",
                patient_id,
            )
            continue

        # ── Load active health card ───────────────────────────────────────
        card_result = await db.execute(
            select(HealthCard).where(
                HealthCard.patient_id == patient_id,
                HealthCard.status == "active",
            )
        )
        card: HealthCard | None = card_result.scalar_one_or_none()

        if card is None:
            logger.warning(
                "batch_health_card_pdf: no active health card for patient %s — skipping",
                patient_id,
            )
            continue

        # ── Generate QR (no PHI in payload) ──────────────────────────────
        _signed_url, qr_data_uri = qr_service.encode_qr_payload(
            str(patient_id), card.card_version
        )

        # ── Build template context dicts ──────────────────────────────────
        _bd = patient.birth_date
        _age: int = (
            _today.year
            - _bd.year
            - ((_today.month, _today.day) < (_bd.month, _bd.day))
            if _bd
            else 0
        )
        _birth_date_display: str = (
            _bd.strftime("%B %d, %Y").replace(" 0", " ") if _bd else "—"
        )

        # Most-recent Visit for vitals.
        _visit_result = await db.execute(
            select(Visit)
            .where(Visit.patient_id == patient_id)
            .order_by(Visit.visit_date.desc())
            .limit(1)
        )
        _latest_visit: Visit | None = _visit_result.scalar_one_or_none()

        if _latest_visit is not None:
            _last_bp: str = _latest_visit.blood_pressure or "—"
            _last_weight: str = (
                f"{_latest_visit.weight_kg} kg" if _latest_visit.weight_kg is not None else "—"
            )
            _last_height: str = (
                f"{_latest_visit.height_cm} cm" if _latest_visit.height_cm is not None else "—"
            )
            _last_temp: str = (
                f"{_latest_visit.temperature}°C" if _latest_visit.temperature is not None else "—"
            )
            _last_visit_date: str = (
                _latest_visit.visit_date.strftime("%B %d, %Y")
                if _latest_visit.visit_date
                else "—"
            )
        else:
            _last_bp = "—"
            _last_weight = "—"
            _last_height = "—"
            _last_temp = "—"
            _last_visit_date = "—"

        # Allergies from medical_history condition_name (plain text, not encrypted).
        _allergies: str
        if patient.medical_histories:
            _allergies = (
                ", ".join(
                    mh.condition_name
                    for mh in patient.medical_histories
                    if mh.condition_name
                )
                or "None on record"
            )
        else:
            _allergies = "None on record"

        patient_dict: dict[str, object] = {
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "middle_name": patient.middle_name,
            "patient_code": patient.patient_code,
            "sex": patient.sex,
            "birth_date": patient.birth_date.strftime("%Y-%m-%d") if _bd else "",
            "age": _age,
            "birth_date_display": _birth_date_display,
            "mobile_number": patient.mobile_number or "—",
            "philhealth_no": patient.philhealth_no or "—",
            "philhealth_member_type": patient.philhealth_member_type or "",
            "address": patient.address or "—",
            # Structured address fields for the back-face template.
            "sitio_purok": patient.sitio_purok or "",
            "barangay": patient.barangay or "",
            "municipality": patient.municipality or "",
            "province": patient.province or "",
            "blood_type": patient.blood_type or "—",
            "allergies": _allergies,
            "last_bp": _last_bp,
            "last_weight": _last_weight,
            "last_height": _last_height,
            "last_temp": _last_temp,
            "last_visit_date": _last_visit_date,
            "medical_notes": "",
            # Dedicated emergency contact fields.
            "emergency_contact_name": patient.emergency_contact_name or "—",
            "emergency_contact_number": patient.emergency_contact_number or "—",
            "guardian_name": patient.guardian_name or "—",
            "guardian_contact": patient.guardian_contact or "—",
            "is_senior": patient.is_senior,
            "is_pwd": patient.is_pwd,
            "is_pregnant": patient.is_pregnant,
            "barangay_name": "Sta. Rosa 1 BHS, Marilao, Bulacan",
        }
        card_dict: dict[str, object] = {
            "card_number": card.card_number,
            "card_version": card.card_version,
            "issued_at": card.issued_at.strftime("%B %d, %Y") if card.issued_at else "",
        }

        # Resolve profile photo (blocking file I/O → thread).
        photo_data_uri: str = await asyncio.to_thread(get_photo_data_uri, patient)

        cards.append((patient_dict, card_dict, qr_data_uri, photo_data_uri))

    # ── Render PDF in thread pool ─────────────────────────────────────────────
    pdf_bytes: bytes = await asyncio.to_thread(render_batch_health_card_pdf, cards)

    # ── Audit log: one row per request ────────────────────────────────────────
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="BATCH_PDF",
        entity_type="health_card",
        entity_id=None,
        metadata={"patient_count": len(cards)},
    )
    await db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="health_cards_batch.pdf"'},
    )


# ---------------------------------------------------------------------------
# POST /health-cards/batch-generate
# NOTE: Declared BEFORE /health-cards/{patient_id} routes so FastAPI does
#       not treat "batch-generate" as a patient_id UUID path parameter.
# Auth: BHW+ role required.
# Audit: One BATCH_GENERATE audit log row per request.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/batch-generate",
    status_code=202,
    response_model=BatchGenerateResponse,
    summary="Enqueue background card generation for multiple patients",
    description=(
        "Accepts a list of 1–100 patient UUIDs and enqueues a Celery task "
        "for each one.  The tasks call the same generate_card() service used "
        "by the single-card endpoint (idempotent — returns the existing card "
        "if one is already active).  "
        "Returns immediately with a batch_id.  "
        "Poll GET /health-cards/batch-status/{batch_id} every 2 seconds to "
        "track progress.  Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def batch_generate_health_cards(
    body: BatchGenerateRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> BatchGenerateResponse:
    """
    Enqueue one Celery generate_card_task per patient_id.

    Processing:
      1. Generate a UUID batch_id for this batch run.
      2. Write batch meta (total, issued_by) to Redis hash batch:{batch_id}:meta.
      3. For each patient_id, call generate_card_task.apply_async().
      4. Write one BATCH_GENERATE audit log entry.
      5. Return {batch_id, total} (HTTP 202).

    The results hash (batch:{batch_id}:results) is populated by each task
    as it completes.  Both hashes have a 3600-second TTL.

    Security invariants:
      - Task args contain ONLY UUIDs — no PHI in Celery task arguments.
      - Redis values are short status strings — no PHI stored in Redis.
      - Only BHW+ roles may call this endpoint.
      - One audit log row per request (not per patient_id).
    """
    import redis as redis_lib  # noqa: PLC0415

    from app.workers.card_tasks import generate_card_task  # noqa: PLC0415

    batch_id = str(uuid.uuid4())
    patient_ids = body.patient_ids
    total = len(patient_ids)
    issued_by_str = str(current_user.id)

    # Write batch metadata to Redis (created before tasks are enqueued so
    # the status endpoint can report total=N immediately).
    try:
        redis_client = redis_lib.from_url(
            __import__("app.core.config", fromlist=["settings"]).settings.REDIS_URL,
            decode_responses=True,
        )
        meta_key = f"batch:{batch_id}:meta"
        redis_client.hset(
            meta_key,
            mapping={"total": str(total), "issued_by": issued_by_str},
        )
        redis_client.expire(meta_key, 3600)
    except Exception as redis_exc:  # noqa: BLE001
        logger.warning(
            "batch_generate: could not write batch meta to Redis — "
            "batch-status endpoint may not work correctly.",
            extra={"batch_id": batch_id, "error": str(redis_exc)},
        )

    # Enqueue one task per patient.
    for pid in patient_ids:
        try:
            generate_card_task.apply_async(
                args=[str(pid), issued_by_str, batch_id],
                queue="default",
            )
        except Exception as celery_exc:  # noqa: BLE001
            # If Celery is unavailable, log a warning but continue — the
            # status endpoint will show this patient as never completed (no
            # entry in results hash), which the UI treats as still pending.
            logger.warning(
                "batch_generate: could not enqueue task for patient %s — "
                "Celery may not be running.",
                pid,
                extra={"batch_id": batch_id, "error": str(celery_exc)},
            )

    # Audit log — one row for the whole batch request.
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="BATCH_GENERATE",
        entity_type="health_card",
        entity_id=None,
        metadata={
            "batch_id": batch_id,
            "patient_count": total,
            "ip": _get_client_ip(request),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    return BatchGenerateResponse(batch_id=batch_id, total=total)


# ---------------------------------------------------------------------------
# GET /health-cards/batch-status/{batch_id}
# NOTE: Declared BEFORE /health-cards/{patient_id} routes.
# Auth: BHW+ role required (same as batch-generate).
# No audit log — read-only status poll, no PHI.
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/batch-status/{batch_id}",
    response_model=BatchStatusResponse,
    summary="Poll the status of a batch card-generation run",
    description=(
        "Returns the current progress of a batch started by "
        "POST /health-cards/batch-generate.  "
        "Poll every 2 seconds until completed + failed == total.  "
        "Returns 404 if the batch_id was not found in Redis (expired or invalid).  "
        "No PHI is returned — only counts and per-patient success/failure flags."
    ),
    dependencies=[_BHW_PLUS],
)
async def get_batch_generate_status(
    batch_id: str,
    current_user: CurrentUser,
) -> BatchStatusResponse:
    """
    Read batch metadata and results from Redis and return a summary.

    Redis layout:
      batch:{batch_id}:meta    → HASH {total, issued_by}
      batch:{batch_id}:results → HASH {patient_id: "success"|"failed:<msg>"}

    Only patient_ids whose tasks have completed have an entry in the results
    hash.  The remaining (total - len(results)) are still pending.
    """
    import redis as redis_lib  # noqa: PLC0415

    from app.core.config import settings as _settings  # noqa: PLC0415

    redis_client = redis_lib.from_url(_settings.REDIS_URL, decode_responses=True)

    meta_key = f"batch:{batch_id}:meta"
    results_key = f"batch:{batch_id}:results"

    # Fetch meta hash — returns {} if key does not exist.
    meta: dict[str, str] = redis_client.hgetall(meta_key)
    if not meta:
        raise HTTPException(
            status_code=404,
            detail=f"Batch '{batch_id}' not found. It may have expired (TTL 1 h) or never existed.",
        )

    total = int(meta.get("total", "0"))

    # Fetch per-patient results.
    raw_results: dict[str, str] = redis_client.hgetall(results_key)

    results: list[BatchStatusResult] = []
    completed = 0
    failed = 0

    for patient_id_str, status_value in raw_results.items():
        if status_value == "success":
            completed += 1
            results.append(
                BatchStatusResult(
                    patient_id=uuid.UUID(patient_id_str),
                    status="success",
                    error=None,
                )
            )
        elif status_value.startswith("failed:"):
            failed += 1
            error_msg = status_value[len("failed:"):]
            results.append(
                BatchStatusResult(
                    patient_id=uuid.UUID(patient_id_str),
                    status="failed",
                    error=error_msg or None,
                )
            )

    return BatchStatusResponse(
        batch_id=batch_id,
        total=total,
        completed=completed,
        failed=failed,
        results=results,
    )


# ---------------------------------------------------------------------------
# GET /health-cards/nfc-batch
# NOTE: Declared BEFORE /health-cards/{patient_id} so FastAPI does not treat
#       "nfc-batch" as a patient_id UUID path parameter.
# Auth: Admin or Admin Staff only (bulk PHI-adjacent export).
# Audit: Every call writes an NFC_BATCH_EXPORT audit log entry.
# ---------------------------------------------------------------------------

_ADMIN_OR_ADMIN_STAFF = require_role("admin", "admin_staff")


@router.get(
    "/health-cards/nfc-batch",
    response_model=NfcBatchResponse,
    summary="Export NFC NDEF payloads for batch chip writing (Admin / Admin Staff only)",
    description=(
        "Returns a list of NDEF URI strings — one per active health card — that an "
        "Android batch-write app can use to write NFC chips sequentially during a "
        "health drive.  Each URI encodes only the card_number pointer (e.g. "
        "http://192.168.x.x:9000/view/BHC-2026-000001); no PHI is included.  "
        "Optionally filtered by ``barangay`` name (exact match on patients.barangay).  "
        "Limited to 1–500 records per call (default 50).  "
        "Every call writes an NFC_BATCH_EXPORT audit log entry regardless of result size.  "
        "Requires Admin or Admin Staff role."
    ),
    dependencies=[_ADMIN_OR_ADMIN_STAFF],
)
async def get_nfc_batch(
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    barangay: str | None = Query(
        default=None,
        description="Filter by exact barangay name (patients.barangay column match).",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=500,
        description="Maximum number of NFC payloads to return (1–500).",
    ),
) -> NfcBatchResponse:
    """
    Build a batch NFC payload list for use during health drives.

    Processing:
      1. Query health_cards joined to patients, filtered to status='active'.
      2. Optionally filter by patients.barangay (exact match).
      3. For each card, build the NDEF URI via nfc_payload_service.build_nfc_payload()
         and extract view_url as the NDEF URI record value.
      4. Write a single NFC_BATCH_EXPORT audit log entry.

    Security invariants:
      - view_url encodes card_number only — no PHI in the NFC URI.
      - Only admin and admin_staff roles may call this endpoint (HTTP 403 for others).
      - One audit row per request (not per card) to avoid log spam.
    """
    # Build the query: active health_cards joined to their patient rows.
    # ``select`` is imported at module level from sqlalchemy.
    stmt = (
        select(HealthCard)
        .join(Patient, HealthCard.patient_id == Patient.id)
        .where(HealthCard.status == "active")
    )

    if barangay:
        stmt = stmt.where(Patient.barangay == barangay)

    stmt = stmt.order_by(HealthCard.issued_at.desc()).limit(limit)

    result = await db.execute(stmt)
    cards = result.scalars().all()

    # Build items: derive the NFC NDEF URI from the NFC payload dict.
    # build_nfc_payload returns {"patient_id", "card_number", "card_version", "view_url"}.
    # The view_url is the NDEF URI record written to the physical chip.
    items: list[NfcBatchItem] = []
    for card in cards:
        payload = nfc_payload_service.build_nfc_payload(
            patient_id=str(card.patient_id),
            card_version=card.card_version,
            card_number=card.card_number,
        )
        nfc_uri: str = str(payload.get("view_url", ""))
        items.append(
            NfcBatchItem(
                patient_id=card.patient_id,
                card_version=card.card_version,
                nfc_uri=nfc_uri,
            )
        )

    # Audit log — required: bulk export of card pointers is PHI-adjacent.
    detail_suffix = f" for barangay '{barangay}'" if barangay else ""
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="NFC_BATCH_EXPORT",
        entity_type="health_card",
        entity_id=None,
        metadata={
            "batch_size": len(items),
            "barangay_filter": barangay,
            "limit_requested": limit,
            "detail": f"Batch of {len(items)} NFC payloads exported{detail_suffix}",
            "ip": _get_client_ip(request),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    return NfcBatchResponse(
        items=items,
        total=len(items),
        barangay_filter=barangay,
    )


# ---------------------------------------------------------------------------
# GET /health-cards/{patient_id}
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/{patient_id}",
    response_model=HealthCardResponse | HealthCardMaybeResponse,
    summary="Get health card metadata for a patient",
    description=(
        "Returns the patient's ACTIVE card if one exists.  If no active card "
        "exists, falls back to the most recently issued card of any status so "
        "the UI can display the correct state (e.g. 'reissued' warning).  "
        "Returns 404 only when the patient has no card at all AND "
        "``allow_missing`` is not set.  "
        "Pass ``?allow_missing=true`` to receive ``{card_found: false, card: null}`` "
        "with HTTP 200 instead — this suppresses browser console network errors "
        "when polling card status for patients who may not have a card yet.  "
        "Does NOT return the QR image — the frontend regenerates the QR "
        "preview client-side from patient_id + card_version."
    ),
)
async def get_health_card(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    allow_missing: bool = Query(
        False,
        description=(
            "When true, return HTTP 200 with {card_found: false, card: null} "
            "instead of HTTP 404 when the patient has no health card.  "
            "Use this from list-view callers to avoid browser console network errors."
        ),
    ),
) -> HealthCardResponse | HealthCardMaybeResponse:
    # Prefer the active card; fall back to most-recently-issued card of any status.
    # This is needed because a patient may have multiple rows after a reissue
    # (old row with status='reissued', new row with status='active').
    active_result = await db.execute(
        select(HealthCard).where(
            HealthCard.patient_id == patient_id,
            HealthCard.status == "active",
        )
    )
    card: HealthCard | None = active_result.scalar_one_or_none()

    if card is None:
        # No active card — try to return the latest card of any status so the
        # frontend can show the correct state banner instead of a bare 404.
        fallback_result = await db.execute(
            select(HealthCard)
            .where(HealthCard.patient_id == patient_id)
            .order_by(desc(HealthCard.issued_at))
            .limit(1)
        )
        card = fallback_result.scalar_one_or_none()

    if card is None:
        if allow_missing:
            # Return 200 with card_found=False so the browser does not log a
            # network error — this is the normal state for new patients who
            # haven't been issued a card yet.
            return HealthCardMaybeResponse(card_found=False, card=None)
        raise NotFoundError(f"No health card found for patient {patient_id}.")

    card_data = HealthCardResponse(
        id=str(card.id),
        patient_id=str(card.patient_id),
        card_number=card.card_number,
        card_version=card.card_version,
        status=card.status,  # type: ignore[arg-type]
        issued_at=card.issued_at,
        expires_at=card.expires_at,
        nfc_uid=card.nfc_uid,
        qr_data_uri=None,  # intentionally omitted on GET metadata
    )

    if allow_missing:
        # Wrap in the envelope so callers using allow_missing=true get a
        # consistent response shape regardless of whether a card was found.
        return HealthCardMaybeResponse(card_found=True, card=card_data)

    return card_data


# ---------------------------------------------------------------------------
# GET /health-cards/{patient_id}/pdf
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/{patient_id}/pdf",
    summary="Render and download the printable PDF health card",
    description=(
        "Fetches patient + card data, generates the QR image, renders the "
        "two-page WeasyPrint PDF, and streams it as a downloadable attachment."
    ),
)
async def download_health_card_pdf(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> StreamingResponse:
    # Fetch patient.
    patient = await get_patient(db, patient_id)

    # Fetch card.
    card_result = await db.execute(
        select(HealthCard).where(
            HealthCard.patient_id == patient_id,
            HealthCard.status == "active",
        )
    )
    card: HealthCard | None = card_result.scalar_one_or_none()
    if card is None:
        raise NotFoundError(
            f"No active health card found for patient {patient_id}. "
            "Generate a card first."
        )

    # Generate QR image (deterministic from patient_id + card_version).
    _signed_url, qr_data_uri = qr_service.encode_qr_payload(
        str(patient_id), card.card_version
    )

    # Build template context dicts (only display-safe fields — no encrypted PHI).
    from datetime import date as _date  # noqa: PLC0415

    # Age computation: full years elapsed since birth_date.
    _today = _date.today()
    _bd = patient.birth_date
    _age: int = (
        _today.year - _bd.year
        - ((_today.month, _today.day) < (_bd.month, _bd.day))
        if _bd
        else 0
    )

    # Human-readable birth date, e.g. "January 15, 1985".
    _birth_date_display: str = (
        _bd.strftime("%B %d, %Y").replace(" 0", " ")  # strip leading zero on day
        if _bd
        else "—"
    )

    # ── Vitals: fetch most recent Visit for this patient ──────────────────
    _visit_result = await db.execute(
        select(Visit)
        .where(Visit.patient_id == patient_id)
        .order_by(Visit.visit_date.desc())
        .limit(1)
    )
    _latest_visit: Visit | None = _visit_result.scalar_one_or_none()

    if _latest_visit is not None:
        _last_bp: str = _latest_visit.blood_pressure or "—"
        _last_weight: str = (
            f"{_latest_visit.weight_kg} kg" if _latest_visit.weight_kg is not None else "—"
        )
        _last_height: str = (
            f"{_latest_visit.height_cm} cm" if _latest_visit.height_cm is not None else "—"
        )
        _last_temp: str = (
            f"{_latest_visit.temperature}°C" if _latest_visit.temperature is not None else "—"
        )
        _last_visit_date: str = (
            _latest_visit.visit_date.strftime("%B %d, %Y")
            if _latest_visit.visit_date
            else "—"
        )
    else:
        _last_bp = "—"
        _last_weight = "—"
        _last_height = "—"
        _last_temp = "—"
        _last_visit_date = "—"

    # ── Allergies: derive from medical_histories already loaded via selectin ──
    # condition_name is a plain-text field (not encrypted) — safe to display.
    _allergies: str
    if patient.medical_histories:
        _allergies = ", ".join(
            mh.condition_name for mh in patient.medical_histories if mh.condition_name
        ) or "None on record"
    else:
        _allergies = "None on record"

    patient_dict: dict[str, object] = {
        # ── Front face fields ──────────────────────────────────────────
        "first_name": patient.first_name,
        "last_name": patient.last_name,
        "middle_name": patient.middle_name,
        "patient_code": patient.patient_code,
        "sex": patient.sex,
        # Retained for backward compatibility — templates use display-formatted fields.
        "birth_date": patient.birth_date.strftime("%Y-%m-%d") if _bd else "",
        "age": _age,
        "birth_date_display": _birth_date_display,
        "mobile_number": patient.mobile_number or "—",
        "philhealth_no": patient.philhealth_no or "—",
        "philhealth_member_type": patient.philhealth_member_type or "",
        # ── Back face fields ───────────────────────────────────────────
        "address": patient.address or "—",
        # Structured address fields for the back-face template.
        # The template prefers these over the composite address field.
        "sitio_purok": patient.sitio_purok or "",
        "barangay": patient.barangay or "",
        "municipality": patient.municipality or "",
        "province": patient.province or "",
        # blood_type: use stored value or fall back to em-dash placeholder.
        "blood_type": patient.blood_type or "—",
        # Allergies sourced from medical_history condition_name rows.
        "allergies": _allergies,
        # Vitals from most-recent Visit, or "—" if no visit exists.
        "last_bp": _last_bp,
        "last_weight": _last_weight,
        "last_height": _last_height,
        "last_temp": _last_temp,
        "last_visit_date": _last_visit_date,
        "medical_notes": "",
        # ── Dedicated emergency contact (separate from guardian) ───────
        "emergency_contact_name": patient.emergency_contact_name or "—",
        "emergency_contact_number": patient.emergency_contact_number or "—",
        # ── Guardian (for minors / PWD — shown as fallback) ───────────
        "guardian_name": patient.guardian_name or "—",
        "guardian_contact": patient.guardian_contact or "—",
        # ── Demographic priority flags ─────────────────────────────────
        "is_senior": patient.is_senior,
        "is_pwd": patient.is_pwd,
        "is_pregnant": patient.is_pregnant,
        # BHC facility name shown in the footer disclaimer.
        "barangay_name": "Sta. Rosa 1 BHS, Marilao, Bulacan",
    }
    card_dict = {
        "card_number": card.card_number,
        "card_version": card.card_version,
        "issued_at": card.issued_at.strftime("%B %d, %Y") if card.issued_at else "",
    }

    # Resolve the patient's profile photo as a base64 data URI.
    # This is done here (in async context) so the synchronous pdf_renderer
    # does not need to do any I/O — it receives a ready-to-embed data URI.
    # get_photo_data_uri does blocking file I/O, so offload to a thread.
    from app.services.patient_photo_service import get_photo_data_uri  # noqa: PLC0415

    photo_data_uri: str = await asyncio.to_thread(get_photo_data_uri, patient)

    # Render PDF in a thread pool so WeasyPrint's blocking I/O does not
    # stall the async event loop.
    from app.services.pdf_renderer import render_health_card_pdf  # noqa: PLC0415

    pdf_bytes: bytes = await asyncio.to_thread(
        render_health_card_pdf,
        patient_dict,
        card_dict,
        qr_data_uri,
        photo_data_uri,
    )

    filename = f"health_card_{patient.patient_code}.pdf"
    return StreamingResponse(
        content=iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/nfc-link
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/nfc-link",
    response_model=HealthCardResponse,
    summary="Bind a physical NFC tag UID to the patient's health card",
    description=(
        "Associates a physical NFC chip's hardware UID with the patient's "
        "active health card row.  Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def link_nfc_tag(
    patient_id: uuid.UUID,
    body: NfcLinkRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> HealthCardResponse:
    updated_card = await nfc_payload_service.link_nfc_uid(
        db=db,
        patient_id=patient_id,
        nfc_uid=body.nfc_uid,
    )
    # Audit log: NFC link is a card update event.
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="health_card",
        entity_id=updated_card.id,  # type: ignore[union-attr]
        metadata={
            "action_detail": "nfc_uid_linked",
            "nfc_uid": body.nfc_uid,
            "patient_id": str(patient_id),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    return HealthCardResponse(
        id=str(updated_card.id),  # type: ignore[union-attr]
        patient_id=str(updated_card.patient_id),  # type: ignore[union-attr]
        card_number=updated_card.card_number,  # type: ignore[union-attr]
        card_version=updated_card.card_version,  # type: ignore[union-attr]
        status=updated_card.status,  # type: ignore[arg-type, union-attr]
        issued_at=updated_card.issued_at,  # type: ignore[union-attr]
        expires_at=updated_card.expires_at,  # type: ignore[union-attr]
        nfc_uid=updated_card.nfc_uid,  # type: ignore[attr-defined]
        qr_data_uri=None,
    )


# ---------------------------------------------------------------------------
# GET /health-cards/verify/public
# Public QR verification — no JWT required.
# Security: HMAC signature in the URL is the sole authentication mechanism.
# Returns only PHI-safe fields (name + patient_code + card_status).
# Called by the public /verify Next.js page that mobile phones land on.
# ---------------------------------------------------------------------------

from app.schemas.health_card import PublicVerifyResponse  # noqa: PLC0415


@router.get(
    "/health-cards/verify/public",
    response_model=PublicVerifyResponse,
    summary="Public QR verification (no login required)",
    description=(
        "Verifies the HMAC signature on a scanned QR code.  "
        "No JWT required — the HMAC is the sole security mechanism.  "
        "Returns only PHI-safe fields: patient name, code, and card status."
    ),
)
async def public_verify_health_card(
    pid: str,
    v: int,
    sig: str,
    request: Request,
    db: DbDep,
) -> PublicVerifyResponse:
    """Public endpoint consumed by the /verify Next.js page on mobile phones."""
    _INVALID = PublicVerifyResponse(valid=False)

    try:
        if not qr_service.verify_qr_payload(pid, v, sig):
            return _INVALID

        try:
            patient_uuid = uuid.UUID(pid)
        except ValueError:
            return _INVALID

        card_result = await db.execute(
            select(HealthCard)
            .where(HealthCard.patient_id == patient_uuid)
            .where(HealthCard.card_version == v)
        )
        card: HealthCard | None = card_result.scalar_one_or_none()
        if card is None or card.status == "revoked":
            return _INVALID

        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_uuid)
        )
        patient: Patient | None = patient_result.scalar_one_or_none()
        if patient is None or not patient.is_active:
            return _INVALID

        parts = [patient.first_name]
        if patient.middle_name:
            parts.append(patient.middle_name)
        parts.append(patient.last_name)
        full_name = " ".join(parts)

        # Log verification (no user_id for anonymous access).
        verification = CardVerification(
            health_card_id=card.id,
            verification_method="qr",
            verified_by=None,
            success=True,
        )
        db.add(verification)
        await db.commit()

        return PublicVerifyResponse(
            valid=True,
            full_name=full_name,
            patient_code=patient.patient_code,
            card_status=card.status,
        )

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Unexpected error during public card verification",
            extra={"error": str(exc)},
            exc_info=True,
        )
        return _INVALID


# POST /health-cards/verify
# NOTE: This route MUST be declared before /health-cards/{patient_id}/...
#       routes so FastAPI does not treat "verify" as a patient_id path param.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/verify",
    # response_model=None — validation is skipped so the non-full path can
    # return only PatientVerifySummary fields (no patient_id/birth_date) while
    # the full=true path returns PatientVerifySummaryFull.  FastAPI would
    # otherwise validate the narrow response against the wider model and raise
    # ResponseValidationError for the missing patient_id / birth_date fields.
    response_model=None,
    summary="Verify a scanned QR payload or tapped NFC UID",
    description=(
        "Accepts either a QR payload URL string or an NFC chip UID.  "
        "Returns a minimal patient summary on success.  "
        "Pass ``?full=true`` (authenticated staff only) to receive the extended "
        "``PatientVerifySummaryFull`` response including patient_id, birth_date, "
        "mobile_number, and photo_url — a PHI_VIEW audit log entry is written.  "
        "Returns an identical generic 403 for ALL failure modes — no information "
        "about the reason for failure is disclosed to the caller."
    ),
)
async def verify_health_card(
    body: CardVerifyRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    full: bool = Query(
        False,
        description=(
            "When true, return PatientVerifySummaryFull (adds patient_id, "
            "birth_date, mobile_number, photo_url).  A PHI_VIEW audit log "
            "entry is written.  Only available to authenticated staff."
        ),
    ),
) -> PatientVerifySummary | PatientVerifySummaryFull:
    """
    Verify a health card by QR scan or NFC tap.

    Security design:
    - Every failure returns the identical 403 response body.  The caller
      cannot distinguish between 'card not found', 'HMAC invalid', 'wrong
      version', 'card revoked', etc.  This prevents oracle attacks and avoids
      confirming the existence of card records.
    - All exceptions (including unexpected server errors) are caught and
      converted to the same 403.  The actual error is logged server-side only.
    - A CardVerification row is written for both success and failure outcomes
      to support audit and tampered-card detection.
    - PHI returned is strictly limited to PatientVerifySummary fields.
    """
    found_card: HealthCard | None = None
    verify_method: str = "qr"

    try:
        # ── QR verification path ───────────────────────────────────────────
        if body.qr_payload:
            verify_method = "qr"
            parsed = urlparse(body.qr_payload)
            params = parse_qs(parsed.query)

            pid_list = params.get("pid", [])
            v_list = params.get("v", [])
            sig_list = params.get("sig", [])

            if not pid_list or not v_list or not sig_list:
                # Missing required params — log but return generic 403.
                logger.warning(
                    "QR verify: missing required params",
                    extra={"path": request.url.path},
                )
                raise _VERIFY_FAIL

            pid = pid_list[0]
            sig = sig_list[0]
            try:
                v = int(v_list[0])
            except (ValueError, TypeError):
                raise _VERIFY_FAIL  # noqa: B904

            if not qr_service.verify_qr_payload(pid, v, sig):
                logger.warning(
                    "QR verify: HMAC mismatch",
                    extra={"pid": pid, "v": v},
                )
                raise _VERIFY_FAIL

            # Signature is valid — look up the card.
            try:
                patient_uuid = uuid.UUID(pid)
            except ValueError:
                raise _VERIFY_FAIL  # noqa: B904

            card_result = await db.execute(
                select(HealthCard).where(
                    HealthCard.patient_id == patient_uuid,
                    HealthCard.status == "active",
                )
            )
            found_card = card_result.scalar_one_or_none()

            if found_card is None:
                logger.warning(
                    "QR verify: card not found or inactive",
                    extra={"patient_id": pid},
                )
                raise _VERIFY_FAIL

            # Double-check: card_version in QR matches DB (prevents replay with old sig).
            if found_card.card_version != v:
                logger.warning(
                    "QR verify: card_version mismatch (old or replayed QR)",
                    extra={"db_version": found_card.card_version, "qr_version": v},
                )
                raise _VERIFY_FAIL

        # ── NFC verification path ──────────────────────────────────────────
        elif body.nfc_uid:
            verify_method = "nfc"
            nfc_uid = body.nfc_uid.strip()

            card_result = await db.execute(
                select(HealthCard).where(HealthCard.nfc_uid == nfc_uid)
            )
            found_card = card_result.scalar_one_or_none()

            if found_card is None or found_card.status != "active":
                logger.warning(
                    "NFC verify: UID not found or card inactive",
                    extra={"nfc_uid": nfc_uid[:8] + "..."},  # partial UID only in logs
                )
                raise _VERIFY_FAIL
        else:
            # Neither qr_payload nor nfc_uid provided.
            raise _VERIFY_FAIL

        # ── Both paths converge here: found_card is valid ──────────────────

        patient_id = found_card.patient_id

        # Load patient record.
        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient: Patient | None = patient_result.scalar_one_or_none()

        if patient is None or not patient.is_active:
            logger.warning(
                "Verify: patient record not found or inactive",
                extra={"patient_id": str(patient_id)},
            )
            raise _VERIFY_FAIL

        # ── Expiry check — BEFORE writing any CardVerification row ────────────
        # expired-card attempts are NOT logged as successful verifications.
        if found_card.expires_at is not None and found_card.expires_at < datetime.now(timezone.utc):
            logger.warning(
                "Verify: health card has expired",
                extra={
                    "patient_id": str(patient_id),
                    "expires_at": found_card.expires_at.isoformat(),
                    "method": verify_method,
                },
            )
            raise HTTPException(
                status_code=403,
                detail="This health card has expired. Please request a new card at the health center.",
            )

        # Last visit date.
        visit_result = await db.execute(
            select(func.max(Visit.visit_date)).where(Visit.patient_id == patient_id)
        )
        last_visit_date = visit_result.scalar_one_or_none()

        # Age computation.
        from datetime import date as _date  # noqa: PLC0415

        today = _date.today()
        bd = patient.birth_date
        age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))

        # Full name (no address, no DOB, no PhilHealth — deliberate).
        parts = [patient.first_name]
        if patient.middle_name:
            parts.append(patient.middle_name)
        parts.append(patient.last_name)
        full_name = " ".join(parts)

        # Write verification record (success=True).
        verification = CardVerification(
            health_card_id=found_card.id,
            verification_method=verify_method,
            verified_by=current_user.id,  # type: ignore[attr-defined]
            success=True,
        )
        db.add(verification)

        # Audit CARD_VERIFY for all successful verifications.
        await write_audit_log(
            db=db,
            user_id=current_user.id,  # type: ignore[attr-defined]
            action="CARD_VERIFY",
            entity_type="health_card",
            entity_id=found_card.id,
            metadata={
                "method": verify_method,
                "patient_id": str(patient_id),
                "success": True,
                "full_response": full,
            },
            ip_address=_get_client_ip(request),
        )

        # When full=True, write a separate PHI_VIEW audit entry because the
        # extended response discloses additional PHI (birth_date, mobile, photo).
        if full:
            await write_audit_log(
                db=db,
                user_id=current_user.id,  # type: ignore[attr-defined]
                action="PHI_VIEW",
                entity_type="patient",
                entity_id=patient_id,
                metadata={
                    "trigger": "health_card_verify_full",
                    "fields_disclosed": [
                        "patient_id",
                        "birth_date",
                        "mobile_number",
                        "photo_url",
                    ],
                    "verify_method": verify_method,
                },
                ip_address=_get_client_ip(request),
            )

        await db.commit()

        # Build the minimal summary shared by both response shapes.
        base_summary = dict(
            patient_code=patient.patient_code,
            full_name=full_name,
            age=age,
            sex=patient.sex,
            is_senior=patient.is_senior,
            is_pwd=patient.is_pwd,
            is_pregnant=patient.is_pregnant,
            last_visit_date=last_visit_date,
            card_status=found_card.status,
        )

        if not full:
            # Default minimal response — no additional PHI.
            # response_model=None on the route decorator means FastAPI will not
            # validate/filter the return value; we serialise explicitly so only
            # the base PatientVerifySummary fields are included in the JSON body.
            return PatientVerifySummary(**base_summary).model_dump(mode="json")

        # Extended response: include patient_id, birth_date, mobile, photo.
        # photo_url is the relative path the frontend can prefix with the API host.
        photo_url: str | None = (
            f"/media/{patient.photo_path}" if patient.photo_path else None
        )

        return PatientVerifySummaryFull(
            **base_summary,
            patient_id=str(patient_id),
            birth_date=bd.isoformat(),
            mobile_number=patient.mobile_number,
            photo_url=photo_url,
        ).model_dump(mode="json")

    except ForbiddenError:
        # Record the failed attempt (write-and-forget — best-effort).
        try:
            if found_card is not None:
                fail_record = CardVerification(
                    health_card_id=found_card.id,
                    verification_method=verify_method,
                    verified_by=current_user.id,  # type: ignore[attr-defined]
                    success=False,
                )
                db.add(fail_record)
                await db.commit()
        except Exception as inner_exc:  # noqa: BLE001
            logger.error(
                "Failed to write card_verification failure record",
                extra={"error": str(inner_exc)},
            )
        raise  # re-raise the generic ForbiddenError

    except Exception as exc:  # noqa: BLE001
        # Unexpected exception — log server-side, return same generic 403.
        logger.error(
            "Unexpected error during card verification",
            extra={"error": str(exc), "path": request.url.path},
            exc_info=True,
        )
        raise _VERIFY_FAIL


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/link-nfc-uid
# Convenience alias for /nfc-link with the field name the relay uses ("uid").
# Requires BHW+ JWT — identical security to /nfc-link.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/link-nfc-uid",
    response_model=HealthCardResponse,
    summary="Bind a physical NFC tag UID to the patient's health card (relay alias)",
    description=(
        "Alias for /nfc-link that accepts {'uid': '...'} instead of {'nfc_uid': '...'}.  "
        "Used by the NFC relay testing flow so staff can register a school ID's UID "
        "to a test patient via curl before scanning.  Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def link_nfc_uid_alias(
    patient_id: uuid.UUID,
    body: NfcScanUidRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> HealthCardResponse:
    updated_card = await nfc_payload_service.link_nfc_uid(
        db=db,
        patient_id=patient_id,
        nfc_uid=body.uid,
    )
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="health_card",
        entity_id=updated_card.id,  # type: ignore[union-attr]
        metadata={
            "action_detail": "nfc_uid_linked_via_relay_alias",
            "nfc_uid": body.uid,
            "patient_id": str(patient_id),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()
    return HealthCardResponse(
        id=str(updated_card.id),  # type: ignore[union-attr]
        patient_id=str(updated_card.patient_id),  # type: ignore[union-attr]
        card_number=updated_card.card_number,  # type: ignore[union-attr]
        card_version=updated_card.card_version,  # type: ignore[union-attr]
        status=updated_card.status,  # type: ignore[arg-type, union-attr]
        issued_at=updated_card.issued_at,  # type: ignore[union-attr]
        expires_at=updated_card.expires_at,  # type: ignore[union-attr]
        nfc_uid=updated_card.nfc_uid,  # type: ignore[attr-defined]
        qr_data_uri=None,
    )


# ---------------------------------------------------------------------------
# POST /health-cards/scan-uid
# Public endpoint — no JWT required.
# Called by the NFC relay server when a tag is scanned on the Android phone.
# Returns safe patient info; writes NFC_SCAN audit log; updates last-scan cache.
# ---------------------------------------------------------------------------


async def _scan_nfc_uid_impl(
    body: NfcScanUidRequest,
    request: Request,
    db: DbDep,
) -> NfcScanResponse:
    """Implementation shared by the early-registered scan-uid route shim."""
    uid = body.uid.strip()
    scanned_at_iso = datetime.now(timezone.utc).isoformat()

    # Case-insensitive match: normalise both sides to upper hex.
    # SQLAlchemy func.upper works across PostgreSQL.
    card_result = await db.execute(
        select(HealthCard).where(
            func.upper(HealthCard.nfc_uid) == uid.upper()
        )
    )
    card: HealthCard | None = card_result.scalar_one_or_none()

    if card is None:
        # Update cache with a "not found" entry.
        _last_scan_cache.update(
            scanned_at=scanned_at_iso,
            found=False,
            uid=uid,
            patient=None,
        )
        # Audit the failed scan (no user_id — anonymous relay call).
        await write_audit_log(
            db=db,
            action="NFC_SCAN",
            entity_type="health_card",
            metadata={
                "result": "not_found",
                # Log only first 8 chars of UID to avoid full UID in logs.
                "uid_prefix": uid[:8] + ("..." if len(uid) > 8 else ""),
                "ip": _get_client_ip(request),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return NfcScanResponse(
            found=False,
            uid=uid,
            message="Tag not registered. Scan a health card that has been provisioned.",
        )

    # Load associated patient.
    patient_result = await db.execute(
        select(Patient).where(Patient.id == card.patient_id)
    )
    patient: Patient | None = patient_result.scalar_one_or_none()

    if patient is None or not patient.is_active:
        _last_scan_cache.update(
            scanned_at=scanned_at_iso,
            found=False,
            uid=uid,
            patient=None,
        )
        await write_audit_log(
            db=db,
            action="NFC_SCAN",
            entity_type="health_card",
            entity_id=card.id,
            metadata={
                "result": "patient_inactive_or_missing",
                "uid_prefix": uid[:8] + ("..." if len(uid) > 8 else ""),
                "card_id": str(card.id),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return NfcScanResponse(
            found=False,
            uid=uid,
            message="Patient record not found or is inactive.",
        )

    # Build full name.
    name_parts = [patient.first_name]
    if patient.middle_name:
        name_parts.append(patient.middle_name)
    name_parts.append(patient.last_name)
    full_name = " ".join(name_parts)

    # DOB — plain date field, safe to display.
    dob_str = patient.birth_date.strftime("%B %d, %Y") if patient.birth_date else "Unknown"

    # Allergies from medical_history.condition_name (plain text, not encrypted).
    allergies_result = await db.execute(
        select(MedicalHistory.condition_name).where(
            MedicalHistory.patient_id == patient.id
        )
    )
    allergy_rows = allergies_result.scalars().all()
    allergies_str = ", ".join(r for r in allergy_rows if r) or "None on record"

    patient_info = NfcScanPatientInfo(
        patient_id=str(patient.id),
        patient_code=patient.patient_code,
        full_name=full_name,
        date_of_birth=dob_str,
        sex=patient.sex,
        blood_type=patient.blood_type,
        emergency_contact_name=patient.guardian_name,
        emergency_contact_number=patient.guardian_contact,
        allergies=allergies_str,
        card_status=card.status,
        is_senior=patient.is_senior,
        is_pwd=patient.is_pwd,
        is_pregnant=patient.is_pregnant,
    )

    # Update the in-memory last-scan cache.
    _last_scan_cache.update(
        scanned_at=scanned_at_iso,
        found=True,
        uid=uid,
        patient=patient_info.model_dump(),
    )

    # Audit log — NFC_SCAN with patient name only (no diagnosis/PHI).
    await write_audit_log(
        db=db,
        action="NFC_SCAN",
        entity_type="health_card",
        entity_id=card.id,
        metadata={
            "result": "found",
            "patient_name": full_name,
            "card_status": card.status,
            "uid_prefix": uid[:8] + ("..." if len(uid) > 8 else ""),
            "ip": _get_client_ip(request),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    status_label = "active" if card.status == "active" else card.status
    return NfcScanResponse(
        found=True,
        uid=uid,
        message=f"Patient found: {full_name} (card: {status_label})",
        patient=patient_info,
    )


async def _get_last_scan_impl() -> LastScanResponse:
    """Implementation shared by the early-registered last-scan route shim."""
    patient_data = _last_scan_cache.get("patient")
    patient_info: NfcScanPatientInfo | None = (
        NfcScanPatientInfo(**patient_data) if patient_data else None
    )
    return LastScanResponse(
        scanned_at=_last_scan_cache.get("scanned_at"),
        found=bool(_last_scan_cache.get("found")),
        uid=_last_scan_cache.get("uid"),
        patient=patient_info,
    )


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/reissue
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/reissue",
    response_model=CardGenerateResponse,
    status_code=201,
    summary="Reissue a lost or damaged health card",
    description=(
        "Marks the current active card as 'reissued', bumps card_version, "
        "generates a new card_number, and produces a new QR HMAC.  "
        "The old card's QR/NFC become invalid immediately.  "
        "NFC must be re-linked after reissue via /nfc-link.  "
        "Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def reissue_health_card(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> CardGenerateResponse:
    result = await card_generation_service.reissue_card(
        db=db,
        patient_id=patient_id,
        issued_by_id=current_user.id,
        ip_address=_get_client_ip(request),
    )
    card_dict = result["card"]
    return CardGenerateResponse(
        card=HealthCardResponse(**card_dict, qr_data_uri=result["qr_data_uri"]),
        signed_url=result["signed_url"],
        qr_data_uri=result["qr_data_uri"],
        nfc_payload=result["nfc_payload"],
    )
