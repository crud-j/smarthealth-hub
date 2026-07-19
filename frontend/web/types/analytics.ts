/**
 * Analytics TypeScript interfaces.
 * Mirrors the analytics endpoint responses in SDP Section 6.7.
 *
 * Field naming: camelCase in TypeScript, snake_case on the wire.
 * API response mapping is handled in hooks/useAnalytics.ts.
 */

// ---------------------------------------------------------------------------
// Dashboard overview (GET /analytics/overview)
// ---------------------------------------------------------------------------

export interface DashboardOverview {
  totalActivePatients: number;
  visitsThisWeek: number;
  upcomingAppointments: number;
  immunizationsDue: number;
  /** Recent patients — last 5 registered. */
  recentPatients: RecentPatientRow[];
  /** Next 5 upcoming appointments. */
  upcomingAppointmentsList: UpcomingAppointmentRow[];
}

export interface RecentPatientRow {
  id: string;
  patientCode: string;
  fullName: string;
  age: number;
  sex: "male" | "female";
  createdAt: string;
}

export interface UpcomingAppointmentRow {
  id: string;
  patientName: string;
  patientCode: string;
  appointmentType: string;
  scheduledAt: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Vaccination coverage (GET /analytics/vaccination-coverage)
// ---------------------------------------------------------------------------

export interface VaccinationCoverageItem {
  vaccineName: string;
  completed: number;
  total: number;
  coveragePct: number;
}

export interface VaccinationCoverageResponse {
  items: VaccinationCoverageItem[];
  asOf: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Illness trends (GET /analytics/illness-trends)
// ---------------------------------------------------------------------------

export type TrendGroupBy = "week" | "month" | "year";

export interface IllnessTrendPoint {
  label: string; // e.g. "2026-W03" or "2026-03"
  conditionName: string;
  count: number;
}

export interface IllnessTrendsResponse {
  groupBy: TrendGroupBy;
  from: string;
  to: string;
  points: IllnessTrendPoint[];
}

// ---------------------------------------------------------------------------
// No-show rate (GET /analytics/appointments/no-show-rate)
// ---------------------------------------------------------------------------

export interface NoShowRateResponse {
  from: string;
  to: string;
  totalAppointments: number;
  missedAppointments: number;
  noShowRatePct: number;
}

// ---------------------------------------------------------------------------
// Export (GET /analytics/export)
// ---------------------------------------------------------------------------

export type ExportReportType =
  | "patients"
  | "visits"
  | "immunizations"
  | "appointments";

export type ExportFormat = "csv" | "json";

export interface ExportParams {
  reportType: ExportReportType;
  from?: string;
  to?: string;
  format?: ExportFormat;
}
