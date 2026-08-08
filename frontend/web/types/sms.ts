/**
 * SMS log TypeScript interfaces.
 * Mirrors the sms_logs table schema in the SDP (Section 4.2).
 *
 * Field naming: camelCase in TypeScript, snake_case on the wire.
 * API response mapping is handled in hooks/useSmsLogs.ts.
 */

export type SmsStatus = "queued" | "sent" | "failed" | "delivered";

// ---------------------------------------------------------------------------
// Core SMS log entry
// ---------------------------------------------------------------------------

export interface SmsLog {
  id: string;
  patientId?: string | null;
  appointmentId?: string | null;
  immunizationId?: string | null;
  mobileNumber: string;
  message: string;
  status: SmsStatus;
  providerMessageId?: string | null;
  errorDetail?: string | null;
  sentAt?: string | null;
  createdAt: string;
  /** Patient full name — joined in list responses. */
  patientName?: string | null;
}

// ---------------------------------------------------------------------------
// Paginated list response
// ---------------------------------------------------------------------------

export interface PaginatedSmsLogs {
  items: SmsLog[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Manual SMS send payload
// ---------------------------------------------------------------------------

export interface SendManualSmsPayload {
  patientId: string;
  message: string;
  /**
   * false (default): queue via Celery — fast response, but delivery stalls
   * silently if no worker is running to consume the queue.
   * true: send synchronously — the request waits for the real Semaphore
   * result instead of just confirming the row was queued.
   */
  sendNow?: boolean;
}

/** Result of POST /sms/send-manual — mirrors ManualSMSSentResponse. */
export interface SendManualSmsResult {
  smsLogId: string;
  status: SmsStatus;
  errorDetail?: string | null;
}

// ---------------------------------------------------------------------------
// Filter params for list query
// ---------------------------------------------------------------------------

export interface SmsLogListParams {
  patientId?: string;
  status?: SmsStatus;
  dateFrom?: string; // ISO date "YYYY-MM-DD"
  dateTo?: string;
  page?: number;
  pageSize?: number;
}
