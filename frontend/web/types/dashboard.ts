/**
 * GET /api/v1/dashboard/me: the role-based dashboard
 * (backend app/schemas/dashboard.py). Kept in the wire's snake_case like
 * HealthCardData; the union is discriminated by `role`.
 *
 * Never contains diagnosis / treatment text; admin gets nothing clinical.
 */

export interface PatientRef {
  id: string;
  patient_code: string;
  full_name: string;
}

export interface AppointmentRow {
  id: string;
  patient: PatientRef;
  appointment_type: string;
  scheduled_at: string;
  status: string;
  intake_completed: boolean;
}

interface DashboardBase {
  first_name: string;
  /** Manila calendar date (YYYY-MM-DD) the figures are for. */
  today: string;
}

export interface WaitingVisit {
  visit_id: string;
  patient: PatientRef;
  age: number | null;
  visit_date: string;
  visit_type: string;
  recorded_by_name: string | null;
  temperature: number | null;
  blood_pressure: string | null;
  pulse_rate: number | null;
  oxygen_saturation: number | null;
  weight_kg: number | null;
}

export interface PhysicianDashboardData extends DashboardBase {
  role: "physician";
  waiting_count: number;
  waiting: WaitingVisit[];
  consultations_today: number;
  consultations_week: number;
  follow_ups_due_7d: number;
  appointments_today_count: number;
  appointments_today: AppointmentRow[];
  top_conditions_month: { condition_name: string; count: number }[];
}

export interface ImmunizationDueRow {
  id: string;
  patient: PatientRef;
  sitio_purok: string | null;
  vaccine_name: string;
  dose_number: number;
  next_due_date: string;
  overdue: boolean;
}

export interface MissedAppointmentRow {
  id: string;
  patient: PatientRef;
  mobile_number: string | null;
  appointment_type: string;
  scheduled_at: string;
}

export interface FailedSmsRow {
  id: string;
  patient: PatientRef | null;
  kind: "appointment" | "immunization" | "other";
  created_at: string;
  reason: string | null;
}

export interface BhwDashboardData extends DashboardBase {
  role: "bhw";
  immunizations_due_7d: number;
  immunizations_overdue: number;
  immunizations_due: ImmunizationDueRow[];
  missed_appointments_7d: number;
  missed_appointments: MissedAppointmentRow[];
  sms_today_sent: number;
  sms_today_failed: number;
  failed_sms: FailedSmsRow[];
  appointments_today_count: number;
  previsit_forms_waiting: number;
  visits_logged_by_me_week: number;
  patients_without_active_card: number;
}

export type CheckStatus = "ok" | "warning" | "error" | "unknown";

/** One System Health check: a status and one plain-language sentence. */
export interface HealthCheck {
  status: CheckStatus;
  message: string;
}

/** The parts of the System Health payload (GET /system/status) the admin dashboard shows. */
export interface SystemSummary {
  overall: CheckStatus;
  checked_at: string;
  version: { commit: string; environment: string };
  database: HealthCheck;
  redis: HealthCheck;
  workers: HealthCheck;
  disk: HealthCheck & { used_percent: number | null };
  media: HealthCheck;
  backup: HealthCheck & { last_success_at: string | null };
  alerts: HealthCheck;
  reliability: {
    sms: HealthCheck & { last_24h: { sent: number; failed: number } };
    sign_in: HealthCheck & {
      last_24h: { successful: number; failed_password: number; failed_otp: number };
    };
    reminders: HealthCheck & {
      runs: { job: "appointment" | "immunization"; last_run_at: string | null; queued: number | null }[];
    };
  };
}

export interface AdminDashboardData extends DashboardBase {
  role: "admin";
  system: SystemSummary;
  online_applications_pending: number;
  previsit_forms_waiting: number;
  recent_applications: {
    id: string;
    reference_number: string;
    applicant_name: string | null;
    created_at: string;
  }[];
  staff: { active: number; inactive: number; not_signed_in_30d: number };
  active_patients: number;
  security_alerts: { check_name: string; detail: string; severity: string }[];
}

export interface AdminStaffDashboardData extends DashboardBase {
  role: "admin_staff";
  appointments_today_count: number;
  intake_done_today: number;
  previsit_forms_waiting: number;
  appointments_today: AppointmentRow[];
  appointments_tomorrow_count: number;
}

export type RoleDashboardData =
  | PhysicianDashboardData
  | BhwDashboardData
  | AdminDashboardData
  | AdminStaffDashboardData;
