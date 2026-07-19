"use client";
/**
 * Data hooks for the Appointments module.
 *
 * Follows the same vanilla React state pattern as usePatients.ts —
 * no TanStack Query dependency, using useState + useEffect + apiFetch.
 *
 * All API calls go through lib/api-client.ts on the main thread (SDP §7.4.4).
 *
 * Hooks exported:
 *   useAppointmentList(params)   — paginated list with filters
 *   useAppointment(id)           — single appointment by ID
 *   useCreateAppointment()       — mutation: POST /appointments
 *   useUpdateAppointment(id)     — mutation: PUT /appointments/{id}
 *   useCancelAppointment()       — mutation: DELETE /appointments/{id}
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type {
  Appointment,
  AppointmentCreatePayload,
  AppointmentListParams,
  AppointmentUpdatePayload,
  PaginatedAppointments,
} from "@/types/appointment";

// ---------------------------------------------------------------------------
// Wire types (snake_case from backend)
// ---------------------------------------------------------------------------

interface AppointmentApiResponse {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  patient_code?: string | null;
  appointment_type: string;
  scheduled_at: string;
  status: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

interface PaginatedAppointmentsApiResponse {
  items: AppointmentApiResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Mapping helpers (snake_case → camelCase)
// ---------------------------------------------------------------------------

function mapAppointment(r: AppointmentApiResponse): Appointment {
  return {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    patientCode: r.patient_code,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appointmentType: r.appointment_type as any,
    scheduledAt: r.scheduled_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: r.status as any,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function toApiPayload(
  data: AppointmentCreatePayload
): Record<string, unknown> {
  return {
    patient_id: data.patientId,
    appointment_type: data.appointmentType,
    scheduled_at: data.scheduledAt,
    notes: data.notes,
  };
}

function toUpdatePayload(
  data: AppointmentUpdatePayload
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (data.appointmentType !== undefined)
    out.appointment_type = data.appointmentType;
  if (data.scheduledAt !== undefined) out.scheduled_at = data.scheduledAt;
  if (data.status !== undefined) out.status = data.status;
  if (data.notes !== undefined) out.notes = data.notes;
  return out;
}

// ---------------------------------------------------------------------------
// useAppointmentList — paginated list with filters
// ---------------------------------------------------------------------------

export function useAppointmentList(params: AppointmentListParams = {}) {
  const [data, setData] = useState<PaginatedAppointments | null>(null);
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
      if (p.fromDate) qs.set("from_date", p.fromDate);
      if (p.toDate) qs.set("to_date", p.toDate);
      if (p.page) qs.set("page", String(p.page));
      if (p.pageSize) qs.set("page_size", String(p.pageSize));

      const raw = await apiFetch<PaginatedAppointmentsApiResponse>(
        `/appointments?${qs.toString()}`
      );
      setData({
        items: raw.items.map(mapAppointment),
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
    // Re-fetch when any filter param changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fetchList,
    params.patientId,
    params.status,
    params.fromDate,
    params.toDate,
    params.page,
    params.pageSize,
  ]);

  return { data, loading, error, refetch: fetchList };
}

// ---------------------------------------------------------------------------
// useAppointment — single appointment by ID
// ---------------------------------------------------------------------------

export function useAppointment(id: string | null) {
  const [data, setData] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchOne = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<AppointmentApiResponse>(`/appointments/${id}`);
      setData(mapAppointment(raw));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(String(err), 0, "unknown")
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchOne();
  }, [fetchOne]);

  return { data, loading, error, refetch: fetchOne };
}

// ---------------------------------------------------------------------------
// useCreateAppointment — mutation
// ---------------------------------------------------------------------------

export function useCreateAppointment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const createAppointment = useCallback(
    async (payload: AppointmentCreatePayload): Promise<Appointment | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<AppointmentApiResponse>("/appointments", {
          method: "POST",
          body: JSON.stringify(toApiPayload(payload)),
        });
        return mapAppointment(raw);
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

  return { createAppointment, loading, error };
}

// ---------------------------------------------------------------------------
// useUpdateAppointment — mutation
// ---------------------------------------------------------------------------

export function useUpdateAppointment(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const updateAppointment = useCallback(
    async (payload: AppointmentUpdatePayload): Promise<Appointment | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<AppointmentApiResponse>(
          `/appointments/${id}`,
          {
            method: "PUT",
            body: JSON.stringify(toUpdatePayload(payload)),
          }
        );
        return mapAppointment(raw);
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
    [id]
  );

  return { updateAppointment, loading, error };
}

// ---------------------------------------------------------------------------
// useCancelAppointment — mutation (DELETE /appointments/{id})
// ---------------------------------------------------------------------------

export function useCancelAppointment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const cancelAppointment = useCallback(
    async (id: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await apiFetch<void>(`/appointments/${id}`, { method: "DELETE" });
        return true;
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { cancelAppointment, loading, error };
}
