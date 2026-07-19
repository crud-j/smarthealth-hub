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
  /**
   * base64 PNG data URI — only present on generate/reissue responses.
   * null on GET metadata responses (frontend regenerates from patient_id + version).
   */
  qr_data_uri?: string | null;
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
// NFC link request
// ---------------------------------------------------------------------------

export interface NfcLinkRequest {
  nfc_uid: string;
}
