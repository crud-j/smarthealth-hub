/**
 * Reliability section of the System Health page (SDP §11.7: SMS delivery and
 * OTP failure rates). Types mirror backend/app/schemas/system_config.py
 * (SmsWindow, SignInWindow, ReminderRun); the functions turn the counts into
 * short plain-language lines for the admin. Counts only, no patient data.
 */

export interface SmsWindow {
  sent: number;
  failed: number;
  /** Still "queued" more than an hour after it was created. */
  stuck: number;
  failure_percent: number | null;
}

export interface SignInWindow {
  successful: number;
  failed_password: number;
  failed_otp: number;
  otp_sent: number;
  otp_verified: number;
  otp_success_percent: number | null;
}

export type ReminderJob = "appointment" | "immunization";

export interface ReminderRun {
  job: ReminderJob;
  last_run_at: string | null;
  queued: number | null;
}

const JOB_LABEL: Record<ReminderJob, string> = {
  appointment: "Appointment (hourly)",
  immunization: "Immunization (daily 10 AM)",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function percent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function formatManila(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Big number on the SMS card (last 24 h). */
export function smsHeadline(w: SmsWindow): string {
  if (w.sent + w.failed === 0) return w.stuck ? `${w.stuck} waiting` : "No SMS";
  return `${percent(w.failure_percent ?? 0)} failed`;
}

export function smsLine(label: string, w: SmsWindow): string {
  const parts = [`${w.sent} sent`, `${w.failed} failed`];
  if (w.stuck) parts.push(`${w.stuck} waiting over 1 h`);
  return `${label}: ${parts.join(" · ")}`;
}

/** Big number on the Sign-in card (last 24 h). */
export function signInHeadline(w: SignInWindow): string {
  return plural(w.successful, "sign-in", "sign-ins");
}

export function signInLine(label: string, w: SignInWindow): string {
  const parts = [
    plural(w.failed_password, "wrong password", "wrong passwords"),
    plural(w.failed_otp, "wrong OTP code", "wrong OTP codes"),
  ];
  if (w.otp_success_percent !== null) parts.push(`OTP success ${percent(w.otp_success_percent)}`);
  return `${label}: ${parts.join(" · ")}`;
}

export function reminderLine(run: ReminderRun): string {
  const label = JOB_LABEL[run.job];
  if (!run.last_run_at) return `${label}: not recorded yet`;
  const queued = run.queued === null ? "" : ` · ${run.queued} SMS`;
  return `${label}: ${formatManila(run.last_run_at)}${queued}`;
}
