/**
 * TypeScript interfaces for AI analytics endpoints.
 * Mirrors backend/app/schemas/ai_analytics.py (Pydantic v2).
 *
 * Wire shape: snake_case from backend.
 * Hook shape: camelCase (mapped in useAiAnalytics.ts).
 */

// ---------------------------------------------------------------------------
// No-show risk (GET /analytics/ai/no-show-risk)
// ---------------------------------------------------------------------------

export type RiskLevel = "high" | "medium" | "low";

/** Wire shape — matches AppointmentRiskScore Pydantic schema */
export interface AppointmentRiskScoreWire {
  appointment_id: string;
  patient_id: string;
  patient_code: string;
  risk_level: RiskLevel;
  risk_score: number;
  recommendation: string;
  reasoning: string;
  computed_at: string;
  expires_at: string | null;
}

/** Wire shape — matches NoShowRiskResponse Pydantic schema */
export interface NoShowRiskResponseWire {
  items: AppointmentRiskScoreWire[];
  total: number;
  high_risk_count: number;
  generated_at: string;
}

/** CamelCase shape used in components */
export interface AppointmentRiskScore {
  appointmentId: string;
  patientId: string;
  patientCode: string;
  riskLevel: RiskLevel;
  riskScore: number;
  recommendation: string;
  reasoning: string;
  computedAt: string;
  expiresAt: string | null;
}

export interface NoShowRiskResponse {
  items: AppointmentRiskScore[];
  total: number;
  highRiskCount: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Anomaly alerts (GET /analytics/ai/anomaly-alerts)
// ---------------------------------------------------------------------------

export type AnomalySeverity = "warning" | "critical";

/** Wire shape — matches AnomalyAlert Pydantic schema */
export interface AnomalyAlertWire {
  id: string;
  condition_name: string;
  severity: AnomalySeverity;
  z_score: number;
  current_count: number;
  baseline_mean: number;
  baseline_stdev: number;
  alert_message: string;
  week_label: string;
  created_at: string;
}

/** Wire shape — matches AnomalyAlertsResponse Pydantic schema */
export interface AnomalyAlertsResponseWire {
  alerts: AnomalyAlertWire[];
  total: number;
  generated_at: string;
}

/** Camelcase shape used in components */
export interface AnomalyAlert {
  id: string;
  conditionName: string;
  severity: AnomalySeverity;
  zScore: number;
  currentCount: number;
  baselineMean: number;
  baselineStdev: number;
  alertMessage: string;
  weekLabel: string;
  createdAt: string;
}

export interface AnomalyAlertsResponse {
  alerts: AnomalyAlert[];
  total: number;
  generatedAt: string;
}
