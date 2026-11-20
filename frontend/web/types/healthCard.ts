/**
 * Health card TypeScript interfaces.
 * Mirrors backend/app/schemas/health_card.py
 *
 * Security note: No PHI beyond patient_code, full_name, age, sex, and
 * priority flags appears in any card-related type.  HealthCardData is a
 * pointer — it identifies the card, not the patient's medical information.
 */

// ---------------------------------------------------------------------------
// Card status
// ---------------------------------------------------------------------------

export type CardStatus = "active" | "lost" | "reissued" | "revoked";

// ---------------------------------------------------------------------------
// Core health card record (mirrors HealthCardResponse schema)
// ---------------------------------------------------------------------------

export interface HealthCardData {
  id: string;
  patient_id: string;
  card_number: string;
  card_version: number;
  status: CardStatus;
  issued_at: string; // ISO datetime string
  expires_at: string | null;
  nfc_uid: string | null;
  /** Signed URL to write to the NFC chip ({NFC_VIEW_BASE_URL}/view/{card_number}?sig=...). */
  nfc_view_url?: string | null;
  /**
   * base64 PNG data URI — only present on generate/reissue responses.
   * null on GET metadata responses (frontend regenerates from patient_id + version).
   */
  qr_data_uri?: string | null;
}

// ---------------------------------------------------------------------------
// Maybe response — returned by GET /health-cards/{patient_id}?allow_missing=true
// ---------------------------------------------------------------------------

/**
 * Envelope returned when the caller passes ?allow_missing=true to
 * GET /health-cards/{patient_id}.
 *
 * card_found=false means the patient has no card yet (HTTP 200, not 404).
 * This prevents the browser console from logging network errors during
 * the health-cards list view where many patients may lack a card.
 */
export interface HealthCardMaybeResponse {
  card_found: boolean;
  card: HealthCardData | null;
}

// ---------------------------------------------------------------------------
// Generate / reissue response (mirrors CardGenerateResponse schema)
// ---------------------------------------------------------------------------

export interface CardGenerateResponse {
  card: HealthCardData;
  /** data:image/png;base64,... — QR image for immediate display. */
  qr_data_uri: string;
  /** Minimal JSON to write to the NFC chip via lib/nfc.ts writeNfcTag(). */
  nfc_payload: NfcPayload;
}

// ---------------------------------------------------------------------------
// NFC chip payload (mirrors nfc_payload_service.build_nfc_payload())
// ---------------------------------------------------------------------------

/**
 * The ONLY data written to the physical NFC chip.
 * Never includes PHI — the chip is a pointer to a patient record.
 */
export interface NfcPayload {
  patient_id: string;
  card_version: number;
}

// ---------------------------------------------------------------------------
// Verify endpoint request
// ---------------------------------------------------------------------------

export interface CardVerifyRequest {
  /** Raw QR payload URL string (contains only patient_id, card_version, sig). */
  qr_payload?: string;
  /** Hardware UID read from the tapped NFC chip. */
  nfc_uid?: string;
}

// ---------------------------------------------------------------------------
// Verify endpoint response (mirrors PatientVerifySummary schema)
// ---------------------------------------------------------------------------

/**
 * Minimal patient summary returned by POST /health-cards/verify.
 *
 * Deliberately excludes: address, mobile_number, philhealth_no, birth_date,
 * guardian info, diagnosis, treatment_notes, and all other PHI.
 *
 * The front-desk screen needs ONLY these fields to confirm identity and
 * route to the priority queue.
 */
export interface PatientVerifySummary {
  patient_code: string;
  full_name: string;
  age: number;
  sex: string;
  is_senior: boolean;
  is_pwd: boolean;
  is_pregnant: boolean;
  last_visit_date: string | null;
  card_status: CardStatus;
}

// ---------------------------------------------------------------------------
// Extended verify response — returned when ?full=true (authenticated staff)
// ---------------------------------------------------------------------------

/**
 * Extended patient summary returned by POST /health-cards/verify?full=true.
 *
 * Adds patient_id, birth_date, mobile_number, and photo_url to the base
 * PatientVerifySummary.  A PHI_VIEW audit log entry is written server-side
 * when this response is issued.
 *
 * photo_url is a relative path ("/api/v1/patients/<id>/photo?v=<n>", login required) that
 * must be prefixed with the API base host to form an absolute URL.
 */
export interface PatientVerifySummaryFull extends PatientVerifySummary {
  /** UUID string — used to build navigation links to the full patient record. */
  patient_id: string;
  /** ISO date "YYYY-MM-DD" */
  birth_date: string;
  mobile_number: string | null;
  /**
   * Authenticated URL "/api/v1/patients/<id>/photo?v=<n>" or null.
   * Prefix with API host (e.g. http://192.168.100.6:8000) to form absolute URL.
   */
  photo_url: string | null;
}

// ---------------------------------------------------------------------------
// Card PDF status (mirrors CardGenerationStatus in health_card.py)
// ---------------------------------------------------------------------------

/**
 * Returned by GET /health-cards/generation-status/{card_id}; also the
 * per-row state on the Health Cards list.  Card PDFs are rendered on demand
 * by GET /health-cards/{patient_id}/pdf and never stored, so a generated card
 * is "ready" at once and pdf_url is always null.
 */
export type GenerationStatus = {
  card_id: string;
  status: "pending" | "ready" | "failed";
  pdf_url?: string | null;
};

// ---------------------------------------------------------------------------
// NFC link request
// ---------------------------------------------------------------------------

export interface NfcLinkRequest {
  nfc_uid: string;
}
