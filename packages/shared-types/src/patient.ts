/**
 * Shared TypeScript interfaces for Patient domain objects.
 *
 * These mirror the Patient DB schema (SDP Section 4) and the FastAPI
 * Pydantic response schemas. The frontend and any other JS consumers
 * import from this package for consistent typing.
 *
 * Phase 2 will expand these interfaces to match the final Pydantic response shapes.
 */

export type Sex = "male" | "female";
export type CivilStatus = "single" | "married" | "widowed" | "separated" | "annulled";
export type BloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";

/** Lightweight patient row for search result lists. */
export interface PatientListItem {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string; // ISO 8601 date string (YYYY-MM-DD)
  sex: Sex;
  barangay: string;
  contactNumber: string | null;
  isActive: boolean;
}

/** Full patient record — returned for authorized roles (Physician, Admin). */
export interface PatientResponse extends PatientListItem {
  civilStatus: CivilStatus;
  address: string;
  guardianName: string | null;
  guardianContact: string | null;
  bloodType: BloodType | null;
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string;
  createdById: string;
}

/** Redacted view for BHW role — no sensitive clinical fields. */
export interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  sex: Sex;
  barangay: string;
  isActive: boolean;
}

/** Paginated response wrapper for patient lists. */
export interface PaginatedPatients {
  items: PatientListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Registration payload shape (mirrors PatientCreate Pydantic schema). */
export interface PatientCreateInput {
  firstName: string;
  lastName: string;
  middleName?: string;
  birthDate: string;
  sex: Sex;
  civilStatus: CivilStatus;
  address: string;
  barangay: string;
  contactNumber?: string;
  guardianName?: string;
  guardianContact?: string;
  bloodType?: BloodType;
}
