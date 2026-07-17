/**
 * Shared TypeScript interfaces for Appointment domain objects.
 *
 * Mirrors the Appointment DB schema (SDP Section 4) and FastAPI response schemas.
 * Phase 4 will expand these to match the final Pydantic shapes.
 */

export type AppointmentStatus = "scheduled" | "completed" | "no_show" | "cancelled";

/** Lightweight appointment row for list views. */
export interface AppointmentListItem {
  id: string;
  patientId: string;
  patientName: string; // Resolved from patient join
  providerId: string;
  providerName: string; // Resolved from user join
  scheduledAt: string; // ISO 8601 datetime string (Asia/Manila)
  purpose: string;
  status: AppointmentStatus;
}

/** Full appointment detail response. */
export interface AppointmentResponse extends AppointmentListItem {
  notes: string | null;
  smsReminderTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload for scheduling a new appointment. */
export interface AppointmentCreateInput {
  patientId: string;
  providerId: string;
  scheduledAt: string; // ISO 8601 datetime — must be in the future
  purpose: string;
  notes?: string;
}

/** Payload for updating an existing appointment. */
export interface AppointmentUpdateInput {
  scheduledAt?: string;
  purpose?: string;
  status?: AppointmentStatus;
  notes?: string;
}

/** Paginated response wrapper for appointment lists. */
export interface PaginatedAppointments {
  items: AppointmentListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
