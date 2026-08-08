"use client";
/**
 * Data hooks for AI analytics features.
 *
 * Hooks:
 *   useNoShowRisk(limit?)   — GET /analytics/ai/no-show-risk
 *   useAnomalyAlerts()      — GET /analytics/ai/anomaly-alerts
 *
 * Pattern: useEffect + apiFetch + useState, same as useAnalytics.ts.
 * No Web Workers — AI result sets are small (< 50 rows).
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type {
  NoShowRiskResponse,
  NoShowRiskResponseWire,
  AppointmentRiskScore,
  AnomalyAlertsResponse,
  AnomalyAlertsResponseWire,
  AnomalyAlert,
} from "@/types/aiAnalytics";

// ---------------------------------------------------------------------------
// Wire → camelCase mappers
// ---------------------------------------------------------------------------

function mapRiskScore(
  wire: NoShowRiskResponseWire["items"][number]
): AppointmentRiskScore {
  return {
    appointmentId: wire.appointment_id,
    patientId: wire.patient_id,
    patientCode: wire.patient_code,
    riskLevel: wire.risk_level,
    riskScore: wire.risk_score,
    recommendation: wire.recommendation,
    reasoning: wire.reasoning,
    computedAt: wire.computed_at,
    expiresAt: wire.expires_at,
  };
}

function mapAnomalyAlert(wire: AnomalyAlertsResponseWire["alerts"][number]): AnomalyAlert {
  return {
    id: wire.id,
    conditionName: wire.condition_name,
    severity: wire.severity,
    zScore: wire.z_score,
    currentCount: wire.current_count,
    baselineMean: wire.baseline_mean,
    baselineStdev: wire.baseline_stdev,
    alertMessage: wire.alert_message,
    weekLabel: wire.week_label,
    createdAt: wire.created_at,
  };
}

// ---------------------------------------------------------------------------
// useNoShowRisk
// ---------------------------------------------------------------------------

export function useNoShowRisk(limit: number = 10): {
  data: NoShowRiskResponse | null;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const [data, setData] = useState<NoShowRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<NoShowRiskResponseWire>(
      `/analytics/ai/no-show-risk?limit=${limit}`
    )
      .then((wire) => {
        if (cancelled) return;
        setData({
          items: wire.items.map(mapRiskScore),
          total: wire.total,
          highRiskCount: wire.high_risk_count,
          generatedAt: wire.generated_at,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError("Unknown error", 0, "unknown"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [limit, version]);

  return { data, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// useAnomalyAlerts
// ---------------------------------------------------------------------------

export function useAnomalyAlerts(): {
  data: AnomalyAlertsResponse | null;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const [data, setData] = useState<AnomalyAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<AnomalyAlertsResponseWire>("/analytics/ai/anomaly-alerts")
      .then((wire) => {
        if (cancelled) return;
        setData({
          alerts: wire.alerts.map(mapAnomalyAlert),
          total: wire.total,
          generatedAt: wire.generated_at,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError("Unknown error", 0, "unknown"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  return { data, loading, error, refetch };
}
