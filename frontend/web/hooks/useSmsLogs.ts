"use client";
/**
 * Data hooks for the SMS Logs module.
 *
 * Follows the same vanilla React state pattern as usePatients.ts —
 * no TanStack Query dependency, using useState + useEffect + apiFetch.
 *
 * All API calls go through lib/api-client.ts on the main thread (SDP §7.4.4).
 *
 * Hooks exported:
 *   useSmsLogList(params)   — paginated list with filters
 *   useSendManualSms()      — mutation: POST /sms/send-manual
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type {
  SmsLog,
  SmsLogListParams,
  PaginatedSmsLogs,
  SendManualSmsPayload,
} from "@/types/sms";

// ---------------------------------------------------------------------------
// Wire types (snake_case from backend)
// ---------------------------------------------------------------------------

interface SmsLogApiResponse {
  id: string;
  patient_id?: string | null;
  appointment_id?: string | null;
  immunization_id?: string | null;
  mobile_number: string;
  message: string;
  status: string;
  provider_message_id?: string | null;
  error_detail?: string | null;
  sent_at?: string | null;
  created_at: string;
  patient_name?: string | null;
}

interface PaginatedSmsLogsApiResponse {
  items: SmsLogApiResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Mapping helper (snake_case → camelCase)
// ---------------------------------------------------------------------------

function mapSmsLog(r: SmsLogApiResponse): SmsLog {
  return {
    id: r.id,
    patientId: r.patient_id,
    appointmentId: r.appointment_id,
    immunizationId: r.immunization_id,
    mobileNumber: r.mobile_number,
    message: r.message,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: r.status as any,
    providerMessageId: r.provider_message_id,
    errorDetail: r.error_detail,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    patientName: r.patient_name,
  };
}

// ---------------------------------------------------------------------------
// useSmsLogList — paginated list with filters
// ---------------------------------------------------------------------------

export function useSmsLogList(params: SmsLogListParams = {}) {
  const [data, setData] = useState<PaginatedSmsLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const paramsRef = useRef(params);
  paramsRef.current = params;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = paramsRef.current;
      const qs = new URLSearchParams();
      if (p.patientId) qs.set("patient_id", p.patientId);
      if (p.status) qs.set("status", p.status);
      if (p.dateFrom) qs.set("date_from", p.dateFrom);
      if (p.dateTo) qs.set("date_to", p.dateTo);
      if (p.page) qs.set("page", String(p.page));
      if (p.pageSize) qs.set("page_size", String(p.pageSize));

      const raw = await apiFetch<PaginatedSmsLogsApiResponse>(
        `/sms/logs?${qs.toString()}`
      );
      setData({
        items: raw.items.map(mapSmsLog),
        total: raw.total,
        page: raw.page,
        pageSize: raw.page_size,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(String(err), 0, "unknown")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fetchList,
    params.patientId,
    params.status,
    params.dateFrom,
    params.dateTo,
    params.page,
    params.pageSize,
  ]);

  return { data, loading, error, refetch: fetchList };
}

// ---------------------------------------------------------------------------
// useSendManualSms — mutation
// ---------------------------------------------------------------------------

export function useSendManualSms() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const sendSms = useCallback(
    async (payload: SendManualSmsPayload): Promise<SmsLog | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<SmsLogApiResponse>("/sms/send-manual", {
          method: "POST",
          body: JSON.stringify({
            patient_id: payload.patientId,
            message: payload.message,
          }),
        });
        return mapSmsLog(raw);
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { sendSms, loading, error };
}
