"""
Patient record endpoints — Phase 2 full implementation.

  GET    /patients              — paginated list / search
  POST   /patients              — register new patient
  GET    /patients/{id}         — full patient profile (audit VIEW_PHI)
  PUT    /patients/{id}         — update demographics (BHW+)
  DELETE /patients/{id}         — soft-deactivate (Admin only)
  GET    /patients/{id}/verify  — identity summary for card-scan flow

Auth: JWT required on all routes.
RBAC: POST/PUT require BHW, physician, or admin roles.
      DELETE requires admin role.
      GET routes require any authenticated user.

SDP Reference: Section 6.2
"""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile, status

from app.core.exceptions import NotFoundError
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.models.patient import Patient
from app.schemas.intake import IntakeTokenResponse
from app.schemas.patient import (
    ArchivedPatientSummary,
    OcrExtractResponse,
    OcrFieldValue,
    PaginatedArchivedPatients,
    PaginatedPatients,
    PatientArchiveRequest,
    PatientCreate,
    PatientCreateResult,
    PatientDuplicateMatch,
    PatientResponse,
    PatientSummary,
    PatientUpdate,
    PatientVerifySummary,
)
from app.services import patient_service
from app.services.audit_service import write_audit_log
from app.utils.encryption import decrypt_text

from app.core.logging import get_logger

router = APIRouter(prefix="/patients", tags=["patients"])
logger = get_logger(__name__)

# Roles permitted to create / update patient records (BHW, Physician/Nurse/Midwife, Admin)
_BHW_PLUS = require_role("bhw", "physician", "admin_staff", "admin")
# Admin-only for destructive operations
_ADMIN_ONLY = require_role("admin")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_client_ip(request: Request) -> str | None:
    """Extract the real client IP, respecting the X-Forwarded-For header."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _build_patient_response(patient: Patient) -> PatientResponse:
    """
    Map a Patient ORM instance to a PatientResponse schema.

    Centralised here so that all endpoints that return a PatientResponse
    (create, get, update) emit consistent fields — including ``photo_path``
    which was added in Phase 3 (migration 0004).
    """
    # Build the root-relative photo URL from the stored relative path.
    # e.g. "patient_photos/<uuid>.jpg" → "/media/patient_photos/<uuid>.jpg"
    photo_path_url: str | None = (
        f"/media/{patient.photo_path}" if patient.photo_path else None
    )
    return PatientResponse(
        id=str(patient.id),
        patient_code=patient.patient_code,
        first_name=patient.first_name,
        middle_name=patient.middle_name,
        last_name=patient.last_name,
        birth_date=patient.birth_date,
        sex=patient.sex,
        civil_status=patient.civil_status,
        household_number=patient.household_number,
        sitio_purok=patient.sitio_purok,
        barangay=patient.barangay,
        municipality=patient.municipality,
        province=patient.province,
        occupation=patient.occupation,
        mobile_number=patient.mobile_number,
        address=patient.address,
        guardian_name=patient.guardian_name,
        guardian_contact=patient.guardian_contact,
        emergency_contact_name=patient.emergency_contact_name,
        emergency_contact_number=patient.emergency_contact_number,
        philhealth_no=patient.philhealth_no,
        philhealth_member_type=patient.philhealth_member_type,
        philhealth_category=patient.philhealth_category,
        is_4ps_beneficiary=patient.is_4ps_beneficiary,
        household_id_4ps=patient.household_id_4ps,
        is_indigenous=patient.is_indigenous,
        place_of_birth=patient.place_of_birth,
        mothers_maiden_name=patient.mothers_maiden_name,
        is_pwd=patient.is_pwd,
        is_senior=patient.is_senior,
        is_pregnant=patient.is_pregnant,
        senior_id_number=patient.senior_id_number,
        pwd_id_number=patient.pwd_id_number,
        last_menstrual_period=patient.last_menstrual_period,
        gravida=patient.gravida,
        para=patient.para,
        estimated_due_date=patient.estimated_due_date,
        height_cm=float(patient.height_cm) if patient.height_cm is not None else None,
        weight_kg=float(patient.weight_kg) if patient.weight_kg is not None else None,
        allergies=decrypt_text(patient.allergies) if patient.allergies else None,
        known_conditions=(
            decrypt_text(patient.known_conditions)
            if patient.known_conditions
            else None
        ),
        registration_source=patient.registration_source,
        registration_data_source=patient.registration_data_source,
        data_privacy_consent=patient.data_privacy_consent,
        data_privacy_consent_at=patient.data_privacy_consent_at,
        is_active=patient.is_active,
        archived_at=patient.archived_at,
        archived_by=str(patient.archived_by) if patient.archived_by else None,
        archive_reason=patient.archive_reason,
        created_at=patient.created_at,
        updated_at=patient.updated_at,
        photo_path=photo_path_url,
    )


# ---------------------------------------------------------------------------
# GET /patients
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PaginatedPatients,
    summary="List / search patients (paginated)",
)
async def list_patients(
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    q: str | None = Query(None, description="Search by name, patient code, or mobile"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Results per page"),
    is_senior: bool | None = Query(None, description="Filter senior citizens"),
    is_pwd: bool | None = Query(None, description="Filter PWD patients"),
    is_pregnant: bool | None = Query(None, description="Filter pregnant patients"),
    sort: str | None = Query(
        None,
        description="Sort order: 'created_at' for newest-first (dashboard panel); "
        "omitted defaults to alphabetical by name",
    ),
    include_archived: bool = Query(
        False,
        description="If True, include archived patients in results (Admin only). "
        "Default False — archived patients are hidden.",
    ),
) -> PaginatedPatients:
    """
    Return a paginated, searchable list of active patients.

    Text search (``q``) matches last_name, first_name, patient_code, or mobile_number.
    Demographic flag filters can be combined with text search.

    Response items are ``PatientSummary`` — no address, guardian, or PhilHealth
    details — safe for all authenticated staff roles.

    Rate limit: 60 requests / minute per IP.
    """
    ip = _get_client_ip(request) or "unknown"
    await limiter.check_rate_limit(
        key=f"patients_list:{ip}",
        max_attempts=60,
        window_seconds=60,
    )

    patients, total = await patient_service.list_patients(
        db,
        q=q,
        page=page,
        page_size=page_size,
        is_senior=is_senior,
        is_pwd=is_pwd,
        is_pregnant=is_pregnant,
        sort=sort,
        include_archived=include_archived,
    )

    items = [
        PatientSummary(
            id=str(p.id),
            patient_code=p.patient_code,
            first_name=p.first_name,
            middle_name=p.middle_name,
            last_name=p.last_name,
            birth_date=p.birth_date,
            sex=p.sex,
            mobile_number=p.mobile_number,
            is_senior=p.is_senior,
            is_pwd=p.is_pwd,
            is_pregnant=p.is_pregnant,
            is_active=p.is_active,
            blood_type=p.blood_type,
            created_at=p.created_at,
        )
        for p in patients
    ]

    return PaginatedPatients(items=items, total=total, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST /patients
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=PatientCreateResult,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new patient (or return a duplicate-patient warning)",
    dependencies=[_BHW_PLUS],
)
async def create_patient(
    request: Request,
    response: Response,
    db: DbDep,
    current_user: CurrentUser,
    payload: PatientCreate,
) -> PatientCreateResult:
    """
    Register a new patient.

    Auto-generates a ``patient_code`` (BHC-YYYY-NNNNNN) and sets ``is_senior``
    based on age at registration.  Writes a CREATE audit log entry.

    **Duplicate detection (L-2):** if an active patient already exists with
    the same first name, last name, and birth date, no record is created.
    Instead the response returns ``duplicate_warning=true`` with the matched
    patient(s) under ``matches`` — HTTP status is overridden to 200 since
    this is not an error, just a decision point for the caller.  Re-submit
    the identical payload with ``confirm_duplicate: true`` in the body to
    bypass the check and register anyway (the frontend restricts this
    override to the Admin role).

    Auth: BHW, Physician/Nurse/Midwife, Admin Staff, Admin.

    Rate limit: 30 requests / minute per authenticated user.
    """
    ip = _get_client_ip(request)
    await limiter.check_rate_limit(
        key=f"patients_create:{current_user.id}",
        max_attempts=30,
        window_seconds=60,
    )
    patient, matches = await patient_service.create_patient(
        db,
        data=payload,
        created_by_id=current_user.id,
        ip_address=ip,
        confirm_duplicate=payload.confirm_duplicate,
    )

    if patient is None:
        # Duplicate detected and not confirmed — not an error, so override
        # the default 201 down to 200.
        response.status_code = status.HTTP_200_OK
        return PatientCreateResult(
            duplicate_warning=True,
            matches=[
                PatientDuplicateMatch(
                    id=str(m.id),
                    patient_code=m.patient_code,
                    full_name=" ".join(
                        p for p in (m.first_name, m.middle_name, m.last_name) if p
                    ),
                    birth_date=m.birth_date,
                )
                for m in matches
            ],
            patient=None,
        )

    # Enqueue post-registration background tasks.
    # Wrapped in try/except so broker failure never causes HTTP 500.
    # The patient record is already committed — only enqueuing is optional.
    try:
        from app.workers.registration_tasks import (  # noqa: PLC0415
            queue_health_card_generation_task,
            send_photo_reminder_task,
            send_welcome_sms_task,
        )
        patient_id_str = str(patient.id)
        staff_id_str = str(current_user.id)

        if patient.mobile_number:
            send_welcome_sms_task.delay(patient_id_str)

        queue_health_card_generation_task.delay(patient_id_str)

        send_photo_reminder_task.apply_async(
            args=[patient_id_str, staff_id_str],
            countdown=86400,  # 24 hours
        )

        logger.info(
            "Post-registration tasks enqueued",
            extra={
                "patient_id": patient_id_str,
                "has_mobile": bool(patient.mobile_number),
                "photo_reminder_countdown_hours": 24,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not enqueue post-registration tasks — Celery broker may be down",
            extra={"patient_id": str(patient.id), "error": str(exc)},
        )

    return PatientCreateResult(
        duplicate_warning=False,
        matches=[],
        patient=_build_patient_response(patient),
    )


# ---------------------------------------------------------------------------
# POST /patients/ocr-extract
# ---------------------------------------------------------------------------


@router.post(
    "/ocr-extract",
    response_model=OcrExtractResponse,
    summary="Extract patient demographics from a government ID image (OCR)",
    dependencies=[_BHW_PLUS],
)
async def ocr_extract(
    request: Request,
    current_user: CurrentUser,
    image: UploadFile = File(..., description="Government ID image (JPEG or PNG, max 10 MB)"),
) -> OcrExtractResponse:
    """
    Extract patient demographics from a photograph of a government-issued ID
    (PhilID, PhilHealth card, UMID, driver's license, or passport).

    The image is processed in-memory by the configured OCR provider (Tesseract
    by default). No image is persisted to disk or database.

    Returns an ``OcrExtractResponse`` with per-field confidence scores.
    Fields that could not be extracted have ``value=None`` and ``confidence=0.0``.

    Auth: BHW, Physician/Nurse/Midwife, Admin Staff, Admin.
    Rate limit: 10 requests / minute per user.

    Security: Image bytes are held in memory only for the duration of this
    request. No OCR image is written to disk or stored in the database.
    """
    from app.services.ocr_service import get_ocr_provider, OcrResult  # noqa: PLC0415

    ip = _get_client_ip(request)

    # Rate limit: 10 OCR requests per minute per user
    await limiter.check_rate_limit(
        key=f"ocr_extract:{current_user.id}",
        max_attempts=10,
        window_seconds=60,
    )

    # Validate file type
    content_type = image.content_type or ""
    if content_type not in ("image/jpeg", "image/png", "image/jpg"):
        raise HTTPException(
            status_code=400,
            detail="Only JPEG and PNG images are accepted for OCR extraction.",
        )

    # Read image bytes (enforced size limit)
    from app.core.config import settings as _settings  # noqa: PLC0415
    image_bytes = await image.read()
    if len(image_bytes) > _settings.OCR_MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Image exceeds the maximum allowed size of {_settings.OCR_MAX_IMAGE_BYTES // (1024 * 1024)} MB.",
        )
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

    # Run OCR in a thread pool (pytesseract and Pillow are synchronous)
    import asyncio as _asyncio  # noqa: PLC0415

    provider = get_ocr_provider()

    try:
        ocr_result: OcrResult = await _asyncio.to_thread(provider.extract, image_bytes)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "OCR extraction failed",
            extra={"user_id": str(current_user.id), "error": str(exc)},
        )
        # Return an empty result rather than a 500 — the frontend degrades to manual entry
        return OcrExtractResponse(
            first_name=OcrFieldValue(value=None, confidence=0.0),
            middle_name=OcrFieldValue(value=None, confidence=0.0),
            last_name=OcrFieldValue(value=None, confidence=0.0),
            birth_date=OcrFieldValue(value=None, confidence=0.0),
            sex=OcrFieldValue(value=None, confidence=0.0),
            address_line=OcrFieldValue(value=None, confidence=0.0),
            philhealth_no=OcrFieldValue(value=None, confidence=0.0),
            blood_type=OcrFieldValue(value=None, confidence=0.0),
            raw_text="[extraction failed]",
            provider=type(provider).__name__,
        )

    # Log extraction metadata (no PHI in the log — only field names and counts)
    fields_extracted = [
        name for name, val in {
            "given_names": ocr_result.given_names,
            "family_name": ocr_result.family_name,
            "date_of_birth": ocr_result.date_of_birth,
            "sex": ocr_result.sex,
            "address_line": ocr_result.address_line,
            "philhealth_number": ocr_result.philhealth_number,
            "blood_type": ocr_result.blood_type,
        }.items()
        if val is not None
    ]
    low_confidence_fields = [
        name for name, conf in ocr_result.confidence.items()
        if 0.0 < conf < 0.75
    ]

    logger.info(
        "OCR extraction completed",
        extra={
            "user_id": str(current_user.id),
            "provider": type(provider).__name__,
            "fields_extracted": fields_extracted,
            "low_confidence_fields": low_confidence_fields,
            "ip_address": ip,
        },
    )

    # Map OcrResult to OcrExtractResponse
    def _field(value: str | None, field_name: str) -> OcrFieldValue:
        return OcrFieldValue(
            value=value,
            confidence=ocr_result.confidence.get(field_name, 0.0 if value is None else 0.5),
        )

    return OcrExtractResponse(
        first_name=_field(ocr_result.given_names, "given_names"),
        middle_name=_field(ocr_result.middle_name, "middle_name"),
        last_name=_field(ocr_result.family_name, "family_name"),
        birth_date=_field(ocr_result.date_of_birth, "date_of_birth"),
        sex=_field(ocr_result.sex, "sex"),
        address_line=_field(ocr_result.address_line, "address_line"),
        philhealth_no=_field(ocr_result.philhealth_number, "philhealth_number"),
        blood_type=_field(ocr_result.blood_type, "blood_type"),
        raw_text=ocr_result.raw_text,
        provider=type(provider).__name__,
    )


# ---------------------------------------------------------------------------
# POST /patients/intake-token
# ---------------------------------------------------------------------------


@router.post(
    "/intake-token",
    response_model=IntakeTokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a pre-visit intake token and link (BHW+)",
    dependencies=[_BHW_PLUS],
)
async def generate_intake_token(
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> IntakeTokenResponse:
    """
    Generate a single-use, 48-hour intake token.

    The returned ``intake_url`` is ready to send to the patient via SMS.
    Auth: BHW, Physician/Nurse/Midwife, Admin Staff, Admin.
    """
    from app.services import intake_service as _intake_service  # noqa: PLC0415
    from app.core.config import settings as _settings  # noqa: PLC0415

    await limiter.check_rate_limit(
        key=f"intake_token:{current_user.id}",
        max_attempts=20,
        window_seconds=60,
    )

    base_url = _settings.QR_BASE_URL
    intake_token = await _intake_service.generate_intake_token(
        db=db,
        created_by_id=current_user.id,
        base_url=base_url,
    )

    intake_url = f"{base_url}/intake/{intake_token.token}"

    return IntakeTokenResponse(
        token=str(intake_token.token),
        intake_url=intake_url,
        expires_at=intake_token.expires_at,
    )


# ---------------------------------------------------------------------------
# GET /patients/archived  — Admin / Physician only
# IMPORTANT: This MUST be registered before /{patient_id} so FastAPI does not
# attempt to coerce the string "archived" to a UUID path parameter.
# ---------------------------------------------------------------------------


@router.get(
    "/archived",
    response_model=PaginatedArchivedPatients,
    summary="List archived patients (Admin / Physician only)",
    dependencies=[require_role("admin", "physician")],
)
async def list_archived_patients(
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    q: str | None = Query(None, description="Search by name, patient code, or mobile"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedArchivedPatients:
    """
    Return a paginated list of archived patients.

    Archived patients are hidden from the default patient list.  This endpoint
    provides the archive browser for Admin/Physician review and unarchive
    actions.  A VIEW_PHI audit log is written for the list access.
    """
    patients, total = await patient_service.list_archived_patients(
        db, q=q, page=page, page_size=page_size
    )

    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="VIEW_PHI",
        entity_type="patient_archive_list",
        metadata={"q": q, "page": page},
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    items = [
        ArchivedPatientSummary(
            id=str(p.id),
            patient_code=p.patient_code,
            first_name=p.first_name,
            middle_name=p.middle_name,
            last_name=p.last_name,
            birth_date=p.birth_date,
            sex=p.sex,
            mobile_number=p.mobile_number,
            is_senior=p.is_senior,
            is_pwd=p.is_pwd,
            is_pregnant=p.is_pregnant,
            is_active=p.is_active,
            blood_type=p.blood_type,
            created_at=p.created_at,
            archived_at=p.archived_at,  # type: ignore[arg-type]  # never None here
            archived_by=str(p.archived_by) if p.archived_by else None,
            archive_reason=p.archive_reason,
        )
        for p in patients
    ]

    return PaginatedArchivedPatients(items=items, total=total, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# GET /patients/{id}
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}",
    response_model=PatientResponse,
    summary="Get full patient profile",
)
async def get_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> PatientResponse:
    """
    Return the full patient profile.

    Writes a VIEW_PHI audit log entry — every access to a full patient
    record (which includes address and contact info) is logged.

    Auth: Any authenticated staff role.
    """
    ip = _get_client_ip(request)
    patient = await patient_service.get_patient(db, patient_id)

    # Audit every PHI view
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="VIEW_PHI",
        entity_type="patient",
        entity_id=patient_id,
        metadata={"patient_code": patient.patient_code},
        ip_address=ip,
    )
    await db.commit()

    return _build_patient_response(patient)


# ---------------------------------------------------------------------------
# PUT /patients/{id}
# ---------------------------------------------------------------------------


@router.put(
    "/{patient_id}",
    response_model=PatientResponse,
    summary="Update patient demographics",
    dependencies=[_BHW_PLUS],
)
async def update_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    payload: PatientUpdate,
) -> PatientResponse:
    """
    Update patient demographics (PATCH-style — only supplied fields change).

    Re-computes ``is_senior`` if ``birth_date`` is changed.
    Writes an UPDATE audit log entry.

    Auth: BHW, Physician/Nurse/Midwife, Admin Staff, Admin.
    """
    ip = _get_client_ip(request)
    patient = await patient_service.update_patient(
        db, patient_id=patient_id, data=payload, updated_by_id=current_user.id, ip_address=ip
    )
    return _build_patient_response(patient)


# ---------------------------------------------------------------------------
# DELETE /patients/{id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Soft-deactivate patient record (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def deactivate_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> Response:
    """
    Soft-deactivate a patient by setting ``is_active=False``.

    Data is never hard-deleted — the record remains for audit trail integrity.
    Writes a DELETE audit log entry.

    Auth: Admin only.
    """
    ip = _get_client_ip(request)
    await patient_service.deactivate_patient(
        db, patient_id=patient_id, by_id=current_user.id, ip_address=ip
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /patients/{id}/verify
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}/verify",
    response_model=PatientVerifySummary,
    summary="Verify patient identity via card scan (NFC/QR)",
)
async def verify_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> PatientVerifySummary:
    """
    Return a minimal patient summary for the front-desk verification screen
    after a BHW scans or taps a patient's health card.

    Returns: patient_code, full_name, age, sex, priority flags (senior, PWD,
    pregnant), last_visit_date, card_status.

    Writes a VIEW_PHI audit log entry.

    Auth: Any authenticated staff role.
    """
    ip = _get_client_ip(request)
    return await patient_service.verify_patient(
        db, patient_id=patient_id, verified_by_id=current_user.id, ip_address=ip
    )


# ---------------------------------------------------------------------------
# GET /patients/{id}/summary-pdf
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}/summary-pdf",
    summary="Download a one-page A4 field summary PDF for a patient (BHW use)",
)
async def patient_summary_pdf(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> Response:
    """
    Render and stream a one-page A4 PDF field summary suitable for BHW field use.

    The document includes:
      - Patient demographics (name, sex, age, birth date, address, mobile)
      - PhilHealth details
      - Vulnerability flags (PWD, Senior, Pregnant)
      - Blood type
      - Latest visit vitals (blood_pressure, weight, height, temperature only —
        no diagnosis or treatment_notes)
      - Upcoming immunizations (max 5, ordered by next_due_date ascending)

    Security invariants:
      - NO encrypted PHI is included: medical_history.notes, visits.diagnosis,
        and visits.treatment_notes are never loaded or passed to the renderer.
      - A VIEW_PHI audit log row is written on every successful response.
      - JWT authentication is enforced via CurrentUser.
      - All authenticated roles (Admin, BHW, Physician, Admin Staff) may access
        this endpoint — no require_role restriction is applied.

    Returns 404 if the patient does not exist or is inactive.

    WeasyPrint renders synchronously; the call is offloaded to a thread pool
    via asyncio.to_thread() to avoid blocking the async event loop.

    SDP Reference: Section 6.2 (Patient Records), Section 8.4 (WeasyPrint).
    """
    from datetime import date as _date  # noqa: PLC0415

    from sqlalchemy import select  # noqa: PLC0415

    from app.core.exceptions import NotFoundError  # noqa: PLC0415
    from app.models.immunization import Immunization  # noqa: PLC0415
    from app.models.visit import Visit  # noqa: PLC0415
    from app.services.pdf_renderer import render_patient_summary_pdf  # noqa: PLC0415

    # ── 1. Load patient — 404 if missing or inactive ─────────────────────────
    patient = await patient_service.get_patient(db, patient_id)
    if not patient.is_active:
        raise NotFoundError(f"Patient with ID {patient_id} is inactive.")

    # ── 2. Load the latest visit (vitals only — no encrypted PHI) ────────────
    visit_result = await db.execute(
        select(Visit)
        .where(Visit.patient_id == patient_id)
        .order_by(Visit.visit_date.desc())
        .limit(1)
    )
    latest_visit: Visit | None = visit_result.scalar_one_or_none()

    vitals_dict: dict[str, object] | None
    if latest_visit is not None:
        vitals_dict = {
            "blood_pressure": latest_visit.blood_pressure,
            "weight_kg": (
                float(latest_visit.weight_kg)
                if latest_visit.weight_kg is not None
                else None
            ),
            "height_cm": (
                float(latest_visit.height_cm)
                if latest_visit.height_cm is not None
                else None
            ),
            "temperature": (
                float(latest_visit.temperature)
                if latest_visit.temperature is not None
                else None
            ),
            # Human-readable visit date for the "Recorded on …" note in the PDF.
            "visit_date": (
                latest_visit.visit_date.strftime("%B %d, %Y")
                if latest_visit.visit_date
                else "Unknown date"
            ),
        }
    else:
        vitals_dict = None

    # ── 3. Load upcoming immunizations (max 5, not completed, due from today) ─
    today = _date.today()
    immun_result = await db.execute(
        select(Immunization)
        .where(
            Immunization.patient_id == patient_id,
            Immunization.next_due_date >= today,
            Immunization.status != "completed",
        )
        .order_by(Immunization.next_due_date.asc())
        .limit(5)
    )
    immunizations: list[Immunization] = list(immun_result.scalars().all())

    immunizations_list: list[dict[str, object]] = [
        {
            "vaccine_name": imm.vaccine_name,
            "next_due_date": (
                imm.next_due_date.strftime("%B %d, %Y")
                if imm.next_due_date
                else "—"
            ),
            "status": imm.status,
        }
        for imm in immunizations
    ]

    # ── 4. Build patient demographics dict (NO encrypted PHI fields) ─────────
    _bd = patient.birth_date
    _age: int = (
        today.year
        - _bd.year
        - ((today.month, today.day) < (_bd.month, _bd.day))
        if _bd
        else 0
    )
    _birth_date_display: str = (
        _bd.strftime("%B %d, %Y").replace(" 0", " ") if _bd else "—"
    )

    patient_dict: dict[str, object] = {
        "patient_code": patient.patient_code,
        "first_name": patient.first_name,
        "middle_name": patient.middle_name,
        "last_name": patient.last_name,
        "sex": patient.sex,
        "age": _age,
        "birth_date_display": _birth_date_display,
        "address": patient.address or "—",
        "mobile_number": patient.mobile_number or "—",
        "philhealth_no": patient.philhealth_no,
        "philhealth_member_type": patient.philhealth_member_type,
        "is_pwd": patient.is_pwd,
        "is_senior": patient.is_senior,
        "is_pregnant": patient.is_pregnant,
        "blood_type": patient.blood_type,
    }

    # ── 5. Render PDF in thread pool (WeasyPrint is synchronous) ─────────────
    pdf_bytes: bytes = await asyncio.to_thread(
        render_patient_summary_pdf,
        patient_dict,
        vitals_dict,
        immunizations_list,
    )

    # ── 6. Write VIEW_PHI audit log — every download is logged ───────────────
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="VIEW_PHI",
        entity_type="patient",
        entity_id=patient_id,
        metadata={"document": "summary_pdf", "patient_code": patient.patient_code},
    )
    await db.commit()

    # ── 7. Stream PDF response ────────────────────────────────────────────────
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'inline; filename="patient_{patient.patient_code}_summary.pdf"'
            )
        },
    )


# ---------------------------------------------------------------------------
# POST /patients/{id}/archive  — Admin only
# ---------------------------------------------------------------------------


@router.post(
    "/{patient_id}/archive",
    response_model=PatientResponse,
    status_code=status.HTTP_200_OK,
    summary="Archive a patient (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def archive_patient(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    body: PatientArchiveRequest,
) -> PatientResponse:
    """
    Archive a patient record.

    Sets ``archived_at``, ``archived_by``, and ``archive_reason``.  The patient
    is hidden from the default list and search but all clinical records are
    preserved.  Only Admins may archive a patient.

    Raises 404 if the patient does not exist, 409 if already archived.
    """
    ip = _get_client_ip(request)
    try:
        patient = await patient_service.archive_patient(
            db=db,
            patient_id=patient_id,
            archived_by_id=current_user.id,
            reason=body.reason,
            ip_address=ip,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return _build_patient_response(patient)


# ---------------------------------------------------------------------------
# POST /patients/{id}/unarchive  — Admin only
# ---------------------------------------------------------------------------


@router.post(
    "/{patient_id}/unarchive",
    response_model=PatientResponse,
    status_code=status.HTTP_200_OK,
    summary="Unarchive (restore) a patient (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def unarchive_patient(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> PatientResponse:
    """
    Unarchive (restore) a previously archived patient.

    Clears ``archived_at``, ``archived_by``, and ``archive_reason``.  The
    patient becomes visible again in the normal list and search.

    Raises 404 if the patient does not exist, 409 if not currently archived.
    """
    ip = _get_client_ip(request)
    try:
        patient = await patient_service.unarchive_patient(
            db=db,
            patient_id=patient_id,
            unarchived_by_id=current_user.id,
            ip_address=ip,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return _build_patient_response(patient)
