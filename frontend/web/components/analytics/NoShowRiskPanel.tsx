"use client";
/**
 * NoShowRiskPanel — top-5 high-risk upcoming appointments.
 *
 * Placement: inside a ChartCard in analytics/page.tsx, below the demographics chart.
 * ChartCard props to use:
 *   title="Priority Follow-Up"
 *   subtitle="AI-prioritized appointments needing attention in the next 7 days"
 *   accentColor="#7c3aed"
 *   badge="AI-powered"
 *
 * Empty state: "No high-risk appointments in the next 7 days"
 * Loading: skeleton rows
 *
 * Each row:
 *   - patient_code (left)
 *   - risk level badge (colored chip)
 *   - recommendation text (truncated to 2 lines)
 *   - "View" link → /patients/{patient_id}
 */

import Link from "next/link";
import React from "react";
import type { NoShowRiskResponse, RiskLevel } from "@/types/aiAnalytics";

interface NoShowRiskPanelProps {
  data: NoShowRiskResponse | null;
  loading: boolean;
}

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  high: { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  medium: { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  low: { bg: "#f0fdf4", text: "#166534", border: "#86efac" },
};

function SkeletonRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <div style={{ width: 80, height: 14, background: "#f1f5f9", borderRadius: 6 }} />
      <div style={{ width: 48, height: 20, background: "#f1f5f9", borderRadius: 6 }} />
      <div style={{ flex: 1, height: 14, background: "#f1f5f9", borderRadius: 6 }} />
      <div style={{ width: 36, height: 14, background: "#f1f5f9", borderRadius: 6 }} />
    </div>
  );
}

export default function NoShowRiskPanel({ data, loading }: NoShowRiskPanelProps) {
  if (loading) {
    return (
      <div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  const highRiskItems = data?.items.filter((item) => item.riskLevel === "high") ?? [];
  const displayItems = highRiskItems.slice(0, 5);

  if (displayItems.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "32px 16px",
          color: "#94a3b8",
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>&#x2713;</div>
        <p style={{ margin: 0, fontWeight: 500 }}>
          No high-risk appointments in the next 7 days
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>
          Run the scoring task to refresh results.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary row */}
      {data && data.highRiskCount > 0 && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 16,
            padding: "10px 14px",
            background: "#fef2f2",
            borderRadius: 10,
            border: "1px solid #fca5a5",
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: "#991b1b" }}>
            {data.highRiskCount}
          </span>
          <span style={{ fontSize: 12, color: "#7f1d1d", alignSelf: "center" }}>
            high-risk appointments need attention
          </span>
        </div>
      )}

      {/* Risk rows */}
      {displayItems.map((item, idx) => {
        const colors = RISK_COLORS[item.riskLevel];
        return (
          <div
            key={item.appointmentId}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 0",
              borderBottom:
                idx < displayItems.length - 1 ? "1px solid #f1f5f9" : "none",
            }}
          >
            {/* Patient code */}
            <span
              style={{
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 700,
                color: "#475569",
                minWidth: 90,
                fontFamily: "monospace",
              }}
            >
              {item.patientCode}
            </span>

            {/* Risk badge */}
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                color: colors.text,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                padding: "2px 7px",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {item.riskLevel}
            </span>

            {/* Recommendation (truncated) */}
            <p
              style={{
                flex: 1,
                margin: 0,
                fontSize: 12,
                color: "#374151",
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {item.recommendation}
            </p>

            {/* View link */}
            <Link
              href={`/patients/${item.patientId}`}
              style={{
                flexShrink: 0,
                fontSize: 12,
                color: "#7c3aed",
                textDecoration: "none",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              View &rarr;
            </Link>
          </div>
        );
      })}

      {/* View all link */}
      {data && data.total > 5 && (
        <div style={{ textAlign: "right", marginTop: 12 }}>
          <Link
            href="/analytics/ai"
            style={{
              fontSize: 12,
              color: "#7c3aed",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            View all {data.total} scored appointments &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
