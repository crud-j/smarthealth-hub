/**
 * Patient-related TypeScript interfaces.
 * Mirrors the Pydantic patient schemas in backend/app/schemas/patient.py
 *
 * Field naming convention: camelCase here, snake_case on the wire —
 * the API client converts automatically via the response mapping in
 * usePatients.ts hooks.
 */

// ---------------------------------------------------------------------------
// Core patient record (mirrors PatientResponse schema)
// ---------------------------------------------------------------------------

export interface Patient {
  id: string;
  patientCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  fullName: string;
  age: number;
  birthDate: string; // ISO date string: "YYYY-MM-DD"
  sex: "male" | "female";
  civilStatus?: string | null;
  householdNumber?: string | null;
  sitioPurok?: string | null;
  barangay?: string | null;
  municipality?: string | null;
  province?: string | null;
  occupation?: string | null;
  mobileNumber?: string | null;
  address: string;
  guardianName?: string | null;
  guardianContact?: string | null;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
  philhealthNo?: string | null;
  philhealthMemberType?: "member" | "dependent" | null;
  philhealthCategory?:
    | "indigent"
    | "sponsored"
    | "formal_economy"
    | "informal_economy"
    | "lifetime_member"
    | null;
  is4psBeneficiary: boolean;
  householdId4ps?: string | null;
  isIndigenous: boolean;
  placeOfBirth?: string | null;
  mothersMaidenName?: string | null;
  isPwd: boolean;
  isSenior: boolean;
  isPregnant: boolean;
  seniorIdNumber?: string | null;
  pwdIdNumber?: string | null;
  lastMenstrualPeriod?: string | null;
  gravida?: number | null;
  para?: number | null;
  estimatedDueDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  allergies?: string | null;
  knownConditions?: string | null;
  registrationSource?: "walk_in" | "referral" | "outreach" | "others" | null;
  registrationDataSource?: "manual" | "ocr" | "pre_visit";
  dataPrivacyConsent: boolean;
  dataPrivacyConsentAt?: string | null;
  isActive: boolean;
  /** ABO/Rh blood group. Null when not recorded. */
  bloodType?: string | null;
  createdAt: string; // ISO datetime string
  updatedAt: string; // ISO datetime string
  /**
   * Root-relative URL path to the patient's profile photo JPEG,
   * e.g. "/media/patient_photos/<uuid>.jpg".
   * Null/undefined if no photo has been uploaded yet.
   */
  photoPath?: string | null;
  /** ISO datetime string when the patient was archived, or null if not archived. */
  archivedAt?: string | null;
  /** UUID of the user who archived this patient, or null. */
  archivedBy?: string | null;
  /** Reason given for archiving, or null. */
  archiveReason?: string | null;
}

// ---------------------------------------------------------------------------
// Lightweight list row (mirrors PatientSummary schema)
// ---------------------------------------------------------------------------

export interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  fullName: string;
  age: number;
  birthDate: string;
  sex: "male" | "female";
  mobileNumber?: string | null;
  isSenior: boolean;
  isPwd: boolean;
  isPregnant: boolean;
  isActive: boolean;
  /** ABO/Rh blood group. Null when not recorded. */
  bloodType?: string | null;
}

// ---------------------------------------------------------------------------
// Paginated list response
// ---------------------------------------------------------------------------

export interface PaginatedPatients {
  items: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Card-scan verify summary (mirrors PatientVerifySummary schema)
// ---------------------------------------------------------------------------

export interface PatientVerifySummary {
  id: string;
  patientCode: string;
  fullName: string;
  age: number;
  sex: "male" | "female";
  isSenior: boolean;
  isPwd: boolean;
  isPregnant: boolean;
  lastVisitDate?: string | null;
  cardStatus?: "active" | "lost" | "reissued" | "revoked" | null;
}

// ---------------------------------------------------------------------------
// Registration form payload (mirrors PatientCreate schema)
// ---------------------------------------------------------------------------

export interface PatientCreatePayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate: string; // "YYYY-MM-DD"
  sex: "male" | "female";
  civilStatus?: string;
  householdNumber?: string;
  sitioPurok?: string;
  barangay?: string;
  municipality?: string;
  province?: string;
  occupation?: string;
  mobileNumber?: string;
  address?: string;
  guardianName?: string;
  guardianContact?: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  philhealthNo?: string;
  philhealthMemberType?: "member" | "dependent";
  philhealthCategory?:
    | "indigent"
    | "sponsored"
    | "formal_economy"
    | "informal_economy"
    | "lifetime_member";
  is4psBeneficiary?: boolean;
  householdId4ps?: string;
  isIndigenous?: boolean;
  placeOfBirth?: string;
  mothersMaidenName?: string;
  isPwd: boolean;
  isPregnant: boolean;
  seniorIdNumber?: string;
  pwdIdNumber?: string;
  lastMenstrualPeriod?: string;
  gravida?: number;
  para?: number;
  estimatedDueDate?: string;
  heightCm?: number;
  weightKg?: number;
  allergies?: string;
  knownConditions?: string;
  registrationSource?: "walk_in" | "referral" | "outreach" | "others";
  dataPrivacyConsent: boolean;
  /** ABO/Rh blood group. Null / omitted when unknown at registration. */
  bloodType?: string | null;
  /**
   * Set to true to bypass a previously returned duplicate-patient warning
   * and register anyway. Admin-only override on the frontend (see
   * app/(dashboard)/patients/new/page.tsx) — the backend does not itself
   * restrict which authenticated role may set this flag.
   */
  confirmDuplicate?: boolean;
  /** Data-entry source: 'manual' | 'ocr' | 'pre_visit'. Defaults to 'manual'. */
  registrationDataSource?: "manual" | "ocr" | "pre_visit";
}

// ---------------------------------------------------------------------------
// Duplicate-patient warning (mirrors PatientDuplicateMatch / PatientCreateResult)
// ---------------------------------------------------------------------------

/** A single existing patient that matches the name + birth date of a new registration attempt. */
export interface PatientDuplicateMatch {
  id: string;
  patientCode: string;
  fullName: string;
  birthDate: string;
}

/**
 * Result of createPatient(). Exactly one of the two is populated:
 *   - duplicateWarning=true, matches=[...], patient=null
 *   - duplicateWarning=false, matches=[], patient=<Patient>
 */
export interface PatientCreateResult {
  duplicateWarning: boolean;
  matches: PatientDuplicateMatch[];
  patient: Patient | null;
}

// ---------------------------------------------------------------------------
// Update payload (mirrors PatientUpdate — all fields optional)
// ---------------------------------------------------------------------------

export type PatientUpdatePayload = Partial<PatientCreatePayload>;

// ---------------------------------------------------------------------------
// Visit / consultation types (mirrors visit schemas)
// ---------------------------------------------------------------------------

export interface VitalSigns {
  bloodPressure?: string | null;
  temperature?: number | null;
  pulseRate?: number | null;
  respiratoryRate?: number | null;
  oxygenSaturation?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
}

export interface VisitSummary {
  id: string;
  patientId: string;
  caseNo?: string | null;
  visitDate: string;
  visitType: string;
  chiefComplaint?: string | null;
  bloodPressure?: string | null;
  temperature?: number | null;
  pulseRate?: number | null;
  createdAt: string;
}

export interface Visit extends VisitSummary {
  recordedBy?: string | null;
  respiratoryRate?: number | null;
  oxygenSaturation?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  pastMedicalHistory?: string | null;
  presentMedicalHistory?: string | null;
  diagnosis?: string | null; // decrypted — only present for clinical roles
  treatmentNotes?: string | null; // decrypted — only present for clinical roles
  patientName?: string | null;
}

export interface VisitCreatePayload {
  visitType: string;
  visitDate?: string;
  caseNo?: string;
  vitalSigns?: VitalSigns;
  chiefComplaint?: string;
  pastMedicalHistory?: string;
  presentMedicalHistory?: string;
  diagnosis?: string;
  treatmentNotes?: string;
}

/**
 * Payload for PUT /visits/{id}.
 *
 * All fields are optional (PATCH-style semantics over a PUT route).
 * The backend applies only the fields present in the request body.
 *
 * ``diagnosis`` and ``treatment_notes`` are PHI — they are supplied as
 * plaintext here and re-encrypted by the service layer before storage.
 * Only physician and admin roles should populate these fields; the backend
 * enforces a 403 for other roles regardless.
 */
export interface VisitUpdatePayload {
  visit_type?: string | null;
  visit_date?: string | null; // ISO datetime string
  vital_signs?: {
    blood_pressure?: string | null;
    temperature?: number | null;
    pulse_rate?: number | null;
    respiratory_rate?: number | null;
    oxygen_saturation?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
  } | null;
  chief_complaint?: string | null;
  past_medical_history?: string | null;
  present_medical_history?: string | null;
  /** PHI — only send when current user role is physician or admin */
  diagnosis?: string | null;
  /** PHI — only send when current user role is physician or admin */
  treatment_notes?: string | null;
}
