/**
 * Appointment TypeScript interfaces.
 * Mirrors the appointments table schema in the SDP (Section 4.2).
 *
 * Field naming: camelCase in TypeScript, snake_case on the wire.
 * API response mapping is handled in hooks/useAppointments.ts.
 */

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "missed"
  | "cancelled";

export type AppointmentType =
  | "checkup"
  | "prenatal"
  | "follow_up"
  | "vaccination";

// ---------------------------------------------------------------------------
// Core appointment record
// ---------------------------------------------------------------------------

export interface Appointment {
  id: string;
  patientId: string;
  /** Patient full name — joined from patients table in list responses. */
  patientName?: string | null;
  /** Patient code, e.g. BHC-2026-000001 */
  patientCode?: string | null;
  appointmentType: AppointmentType;
  scheduledAt: string; // ISO datetime string
  status: AppointmentStatus;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// List response (paginated)
// ---------------------------------------------------------------------------

export interface PaginatedAppointments {
  items: Appointment[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Create payload
// ---------------------------------------------------------------------------

export interface AppointmentCreatePayload {
  patientId: string;
  appointmentType: AppointmentType;
  scheduledAt: string; // ISO datetime string
  notes?: string;
}

// ---------------------------------------------------------------------------
// Update payload (all fields optional for partial updates)
// ---------------------------------------------------------------------------

export interface AppointmentUpdatePayload {
  appointmentType?: AppointmentType;
  scheduledAt?: string;
  status?: AppointmentStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Filter params for list query
// ---------------------------------------------------------------------------

export interface AppointmentListParams {
  patientId?: string;
  status?: AppointmentStatus;
  fromDate?: string; // ISO date "YYYY-MM-DD"
  toDate?: string;
  page?: number;
  pageSize?: number;
}
