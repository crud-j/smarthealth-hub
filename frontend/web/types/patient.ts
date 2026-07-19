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
  mobileNumber?: string | null;
  address: string;
  guardianName?: string | null;
  guardianContact?: string | null;
  philhealthNo?: string | null;
  philhealthMemberType?: "member" | "dependent" | null;
  isPwd: boolean;
  isSenior: boolean;
  isPregnant: boolean;
  isActive: boolean;
  createdAt: string; // ISO datetime string
  updatedAt: string; // ISO datetime string
  /**
   * Root-relative URL path to the patient's profile photo JPEG,
   * e.g. "/media/patient_photos/<uuid>.jpg".
   * Null/undefined if no photo has been uploaded yet.
   */
  photoPath?: string | null;
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
  mobileNumber?: string;
  address: string;
  guardianName?: string;
  guardianContact?: string;
  philhealthNo?: string;
  philhealthMemberType?: "member" | "dependent";
  isPwd: boolean;
  isPregnant: boolean;
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
