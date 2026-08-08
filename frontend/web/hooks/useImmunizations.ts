"use client";
/**
 * Data hooks for the Immunizations module.
 *
 * Follows the same vanilla React state pattern as useAppointments.ts —
 * no TanStack Query dependency, using useState + useEffect + apiFetch.
 *
 * API routes consumed:
 *   GET  /immunizations                              — cross-patient paginated list
 *   GET  /immunizations/due-summary                  — due_this_week / due_this_month counts
 *   GET  /immunizations/stats                        — total_records / distinct_vaccines
 *   GET  /immunizations/due?days_ahead=7             — next-5 due-soon list
 *   GET  /patients/{id}/immunizations                — per-patient list
 *   POST /patients/{patientId}/immunizations         — create
 *   PATCH /patients/{patientId}/immunizations/{id}  — update
 *   DELETE /patients/{patientId}/immunizations/{id} — delete
 *
 * Hooks exported:
 *   useImmunizationList(params)    — cross-patient paginated list with filters
 *   useImmunizationDueSummary()    — due_this_week + due_this_month counts
 *   useImmunizationStats()         — total_records + distinct_vaccines
 *   useImmunizationsDueSoon(days)  — list of N coming due soonest
 *   useCreateImmunization()        — mutation: POST /patients/{id}/immunizations
 *   useUpdateImmunization()        — mutation: PATCH /patients/{pid}/immunizations/{id}
 *   useDeleteImmunization()        — mutation: DELETE /patients/{pid}/immunizations/{id}
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Wire types (snake_case from backend)
// ---------------------------------------------------------------------------

export interface ImmunizationApiResponse {
  id: string;
  patient_id: string;
  vaccine_name: string;
  dose_number: number;
  date_administered: string | null;
  administered_by: string | null;
  batch_number: string | null;
  next_due_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ImmunizationWithPatientApiResponse extends ImmunizationApiResponse {
  patient_name: string;
}

interface PaginatedImmunizationsApiResponse {
  items: ImmunizationWithPatientApiResponse[];
  total: number;
  page: number;
  page_size: number;
}

interface DueSummaryApiResponse {
  due_this_week: number;
  due_this_month: number;
}

interface ImmunizationStatsApiResponse {
  total_records: number;
  distinct_vaccines: number;
}

// ---------------------------------------------------------------------------
// Camel-case frontend types
// ---------------------------------------------------------------------------

export interface Immunization {
  id: string;
  patientId: string;
  patientName?: string;
  vaccineName: string;
  doseNumber: number;
  dateAdministered: string | null;
  administeredBy: string | null;
  batchNumber: string | null;
  nextDueDate: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedImmunizations {
  items: Immunization[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImmunizationDueSummary {
  dueThisWeek: number;
  dueThisMonth: number;
}

export interface ImmunizationStats {
  totalRecords: number;
  distinctVaccines: number;
}

export interface ImmunizationListParams {
  vaccineName?: string;
  dueFilter?: "due_this_week" | "due_this_month" | "overdue" | "";
  page?: number;
  pageSize?: number;
}

export interface ImmunizationCreatePayload {
  vaccine_name: string;
  dose_number: number;
  date_administered?: string | null;
  next_due_date?: string | null;
  batch_number?: string | null;
  notes?: string | null;
  status?: string;
}

export interface ImmunizationUpdatePayload {
  vaccine_name?: string;
  dose_number?: number;
  date_administered?: string | null;
  next_due_date?: string | null;
  batch_number?: string | null;
  notes?: string | null;
  status?: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers (snake_case → camelCase)
// ---------------------------------------------------------------------------

function mapImmunization(r: ImmunizationApiResponse): Immunization {
  return {
    id: r.id,
    patientId: r.patient_id,
    vaccineName: r.vaccine_name,
    doseNumber: r.dose_number,
    dateAdministered: r.date_administered,
    administeredBy: r.administered_by,
    batchNumber: r.batch_number,
    nextDueDate: r.next_due_date,
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapImmunizationWithPatient(r: ImmunizationWithPatientApiResponse): Immunization {
  return {
    ...mapImmunization(r),
    patientName: r.patient_name,
  };
}

// ---------------------------------------------------------------------------
// useImmunizationList — cross-patient paginated list with filters
// ---------------------------------------------------------------------------

export function useImmunizationList(params: ImmunizationListParams = {}) {
  const [data, setData] = useState<PaginatedImmunizations | null>(null);
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
      if (p.vaccineName) qs.set("vaccine_name", p.vaccineName);
      if (p.dueFilter) qs.set("due_filter", p.dueFilter);
      if (p.page) qs.set("page", String(p.page));
      if (p.pageSize) qs.set("page_size", String(p.pageSize));

      const raw = await apiFetch<PaginatedImmunizationsApiResponse>(
        `/immunizations?${qs.toString()}`
      );
      setData({
        items: raw.items.map(mapImmunizationWithPatient),
        total: raw.total,
        page: raw.page,
        pageSize: raw.page_size,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchList, params.vaccineName, params.dueFilter, params.page, params.pageSize]);

  return { data, loading, error, refetch: fetchList };
}

// ---------------------------------------------------------------------------
// useImmunizationDueSummary — widget: due_this_week + due_this_month
// ---------------------------------------------------------------------------

export function useImmunizationDueSummary() {
  const [data, setData] = useState<ImmunizationDueSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<DueSummaryApiResponse>("/immunizations/due-summary");
      setData({ dueThisWeek: raw.due_this_week, dueThisMonth: raw.due_this_month });
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { data, loading, error, refetch: fetchSummary };
}

// ---------------------------------------------------------------------------
// useImmunizationStats — total_records + distinct_vaccines
// ---------------------------------------------------------------------------

export function useImmunizationStats() {
  const [data, setData] = useState<ImmunizationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<ImmunizationStatsApiResponse>("/immunizations/stats");
      setData({ totalRecords: raw.total_records, distinctVaccines: raw.distinct_vaccines });
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// useImmunizationsDueSoon — top N coming due soonest (for sidebar panel)
// ---------------------------------------------------------------------------

export function useImmunizationsDueSoon(daysAhead = 7) {
  const [data, setData] = useState<Immunization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchDue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<ImmunizationApiResponse[]>(
        `/immunizations/due?days_ahead=${daysAhead}`
      );
      setData(raw.map(mapImmunization).slice(0, 5));
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown")
      );
    } finally {
      setLoading(false);
    }
  }, [daysAhead]);

  useEffect(() => {
    void fetchDue();
  }, [fetchDue]);

  return { data, loading, error, refetch: fetchDue };
}

// ---------------------------------------------------------------------------
// useCreateImmunization — mutation: POST /patients/{patientId}/immunizations
// ---------------------------------------------------------------------------

export function useCreateImmunization() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const createImmunization = useCallback(
    async (
      patientId: string,
      payload: ImmunizationCreatePayload
    ): Promise<Immunization | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<ImmunizationApiResponse>(
          `/patients/${patientId}/immunizations`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        return mapImmunization(raw);
      } catch (err) {
        const apiErr =
          err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { createImmunization, loading, error };
}

// ---------------------------------------------------------------------------
// useUpdateImmunization — mutation: PATCH /patients/{pid}/immunizations/{id}
// ---------------------------------------------------------------------------

export function useUpdateImmunization() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const updateImmunization = useCallback(
    async (
      patientId: string,
      immunizationId: string,
      payload: ImmunizationUpdatePayload
    ): Promise<Immunization | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<ImmunizationApiResponse>(
          `/patients/${patientId}/immunizations/${immunizationId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        return mapImmunization(raw);
      } catch (err) {
        const apiErr =
          err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { updateImmunization, loading, error };
}

// ---------------------------------------------------------------------------
// useDeleteImmunization — mutation: DELETE /patients/{pid}/immunizations/{id}
// ---------------------------------------------------------------------------

export function useDeleteImmunization() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const deleteImmunization = useCallback(
    async (patientId: string, immunizationId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await apiFetch<void>(
          `/patients/${patientId}/immunizations/${immunizationId}`,
          { method: "DELETE" }
        );
        return true;
      } catch (err) {
        const apiErr =
          err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { deleteImmunization, loading, error };
}
