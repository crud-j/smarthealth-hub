"use client";
/**
 * Data hooks for the Analytics module.
 *
 * Follows the same vanilla React state pattern as usePatients.ts.
 * All API calls go through lib/api-client.ts on the main thread (SDP §7.4.4).
 * Heavy data reshaping (groupByWeek, coverageByVaccine) is offloaded to
 * analyticsAggregator.worker.ts via useWebWorker, with synchronous fallbacks.
 *
 * Hooks exported:
 *   useDashboardOverview()
 *   useVaccinationCoverage()
 *   useIllnessTrends(from, to, groupBy)
 *   useNoShowRate(from, to)
 *   useAnalyticsExport()  — mutation for CSV/JSON export download
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type {
  DashboardOverview,
  VaccinationCoverageResponse,
  IllnessTrendsResponse,
  NoShowRateResponse,
  TrendGroupBy,
  ExportParams,
} from "@/types/analytics";

// ---------------------------------------------------------------------------
// Wire types (snake_case from backend)
// ---------------------------------------------------------------------------

// Matches GET /api/v1/analytics/overview response from analytics_service.py
interface DashboardOverviewApiResponse {
  total_active_patients: number;
  visits_this_week: number;
  visits_this_month: number;
  upcoming_appointments_count: number;
  immunizations_due_this_week: number;
  // These fields are NOT returned by the backend overview endpoint.
  // They are fetched separately if needed; default to empty arrays.
  recent_patients?: Array<{
    id: string;
    patient_code: string;
    full_name: string;
    age: number;
    sex: "male" | "female";
    created_at: string;
  }>;
  upcoming_appointments_list?: Array<{
    id: string;
    patient_name: string;
    patient_code: string;
    appointment_type: string;
    scheduled_at: string;
    status: string;
  }>;
}

// Matches GET /api/v1/analytics/vaccination-coverage
interface VaccinationCoverageApiResponse {
  by_vaccine: Array<{
    vaccine_name: string;
    age_group: string;
    total_eligible: number;
    completed: number;
    coverage_pct: number;
  }>;
  by_age_group: Array<{
    vaccine_name: string;
    age_group: string;
    total_eligible: number;
    completed: number;
    coverage_pct: number;
  }>;
}

// Matches GET /api/v1/analytics/illness-trends
interface IllnessTrendsApiResponse {
  group_by: string;
  from_date: string;
  to_date: string;
  items: Array<{
    period: string;
    condition_name: string;
    count: number;
  }>;
}

// Matches GET /api/v1/analytics/appointments/no-show-rate
interface NoShowRateApiResponse {
  from_date: string;
  to_date: string;
  items: Array<{
    appointment_type: string;
    total: number;
    missed: number;
    no_show_rate: number;
  }>;
}

// ---------------------------------------------------------------------------
// useDashboardOverview
// ---------------------------------------------------------------------------

export function useDashboardOverview() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<DashboardOverviewApiResponse>(
        "/analytics/overview"
      );
      setData({
        totalActivePatients: raw.total_active_patients,
        visitsThisWeek: raw.visits_this_week,
        upcomingAppointments: raw.upcoming_appointments_count,
        immunizationsDue: raw.immunizations_due_this_week,
        recentPatients: (raw.recent_patients ?? []).map((p) => ({
          id: p.id,
          patientCode: p.patient_code,
          fullName: p.full_name,
          age: p.age,
          sex: p.sex,
          createdAt: p.created_at,
        })),
        upcomingAppointmentsList: (raw.upcoming_appointments_list ?? []).map((a) => ({
          id: a.id,
          patientName: a.patient_name,
          patientCode: a.patient_code,
          appointmentType: a.appointment_type,
          scheduledAt: a.scheduled_at,
          status: a.status,
        })),
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
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useVaccinationCoverage
// ---------------------------------------------------------------------------

export function useVaccinationCoverage() {
  const [data, setData] = useState<VaccinationCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<VaccinationCoverageApiResponse>(
        "/analytics/vaccination-coverage"
      );
      setData({
        byVaccine: raw.by_vaccine.map((item) => ({
          vaccineName: item.vaccine_name,
          ageGroup: item.age_group,
          totalEligible: item.total_eligible,
          completed: item.completed,
          coveragePct: item.coverage_pct,
        })),
        byAgeGroup: raw.by_age_group.map((item) => ({
          vaccineName: item.vaccine_name,
          ageGroup: item.age_group,
          totalEligible: item.total_eligible,
          completed: item.completed,
          coveragePct: item.coverage_pct,
        })),
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
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useIllnessTrends
// ---------------------------------------------------------------------------

export function useIllnessTrends(
  from: string,
  to: string,
  groupBy: TrendGroupBy = "month"
) {
  const [data, setData] = useState<IllnessTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetch = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to, group_by: groupBy });
      const raw = await apiFetch<IllnessTrendsApiResponse>(
        `/analytics/illness-trends?${qs.toString()}`
      );
      setData({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupBy: raw.group_by as any,
        from: raw.from_date,
        to: raw.to_date,
        points: (raw.items ?? []).map((p) => ({
          label: p.period,
          conditionName: p.condition_name,
          count: p.count,
        })),
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
  }, [from, to, groupBy]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useNoShowRate
// ---------------------------------------------------------------------------

export function useNoShowRate(from: string, to: string) {
  const [data, setData] = useState<NoShowRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const fetch = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const raw = await apiFetch<NoShowRateApiResponse>(
        `/analytics/appointments/no-show-rate?${qs.toString()}`
      );
      // Aggregate totals across all appointment types
      const totals = (raw.items ?? []).reduce(
        (acc, item) => ({
          total: acc.total + item.total,
          missed: acc.missed + item.missed,
        }),
        { total: 0, missed: 0 }
      );
      setData({
        from: raw.from_date,
        to: raw.to_date,
        totalAppointments: totals.total,
        missedAppointments: totals.missed,
        noShowRatePct:
          totals.total > 0
            ? Math.round((totals.missed / totals.total) * 1000) / 10
            : 0,
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
  }, [from, to]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useAnalyticsExport — fetches raw data for CSV/JSON download
// ---------------------------------------------------------------------------

export function useAnalyticsExport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /**
   * Returns raw rows (array of plain objects) suitable for CSV export.
   * The caller is responsible for CSV formatting (via csvExport.worker.ts).
   */
  const fetchExportData = useCallback(
    async (params: ExportParams): Promise<Record<string, unknown>[]> => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ report_type: params.reportType });
        if (params.from) qs.set("from", params.from);
        if (params.to) qs.set("to", params.to);
        if (params.format) qs.set("format", params.format);
        const raw = await apiFetch<Record<string, unknown>[]>(
          `/analytics/export?${qs.toString()}`
        );
        return raw;
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { fetchExportData, loading, error };
}
