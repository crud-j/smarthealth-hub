"use client";
/**
 * AnomalyAlertBanner — dismissible alert card for illness trend anomalies.
 *
 * Placement: rendered ABOVE the gradient header panel in analytics/page.tsx.
 * If alerts list is empty or data is null: renders null (no empty state shown).
 * Loading: renders a skeleton placeholder with the same height.
 *
 * Each alert row shows:
 *   - severity badge (yellow chip = "warning", red chip = "critical")
 *   - condition name
 *   - z-score in parentheses
 *   - AI-generated alert_message
 *   - dismiss button (per-alert, client-side only — does not call any API)
 */

import React, { useState } from "react";
import type { AnomalyAlertsResponse, AnomalyAlert } from "@/types/aiAnalytics";

interface AnomalyAlertBannerProps {
  data: AnomalyAlertsResponse | null;
  loading: boolean;
}

const SEVERITY_COLORS = {
  warning: {
    bg: "#fefce8",
    border: "#fde047",
    badge: "#854d0e",
    badgeBg: "#fef08a",
  },
  critical: {
    bg: "#fef2f2",
    border: "#fca5a5",
    badge: "#991b1b",
    badgeBg: "#fee2e2",
  },
};

function AlertRow({
  alert,
  onDismiss,
}: {
  alert: AnomalyAlert;
  onDismiss: (id: string) => void;
}) {
  const colors = SEVERITY_COLORS[alert.severity];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        marginBottom: 8,
      }}
    >
      {/* Severity badge */}
      <span
        style={{
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 700,
          color: colors.badge,
          background: colors.badgeBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: "3px 8px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginTop: 1,
        }}
      >
        {alert.severity}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#0f172a",
            margin: "0 0 3px",
          }}
        >
          {alert.conditionName}
          <span
            style={{ fontSize: 12, fontWeight: 400, color: "#64748b", marginLeft: 6 }}
          >
            ({alert.zScore.toFixed(1)}&sigma; above baseline)
          </span>
        </p>
        <p style={{ fontSize: 12, color: "#374151", margin: 0, lineHeight: 1.5 }}>
          {alert.alertMessage}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(alert.id)}
        aria-label={`Dismiss alert for ${alert.conditionName}`}
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#94a3b8",
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
          borderRadius: 4,
        }}
      >
        &times;
      </button>
    </div>
  );
}

export default function AnomalyAlertBanner({
  data,
  loading,
}: AnomalyAlertBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <div
        style={{
          height: 72,
          background: "#f8fafc",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          marginBottom: 16,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
        aria-busy="true"
        aria-label="Loading anomaly alerts"
      />
    );
  }

  if (!data || data.alerts.length === 0) {
    return null;
  }

  const visible = data.alerts.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) {
    return null;
  }

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  return (
    <div style={{ marginBottom: 20 }} role="alert" aria-live="polite">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#7c3aed",
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: 6,
            padding: "3px 8px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          AI Alerts
        </span>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {visible.length} active trend {visible.length === 1 ? "anomaly" : "anomalies"} detected this week
        </span>
      </div>
      {visible.map((alert) => (
        <AlertRow key={alert.id} alert={alert} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
