"use client";

/**
 * AI Analytics dedicated page.
 *
 * Shows the full no-show risk table (up to 50 rows) with risk-level filter
 * tabs and anomaly alert banners. Linked from NoShowRiskPanel's "View all N
 * scored appointments" footer link.
 *
 * Visual language: matches analytics/page.tsx exactly — gradient header panel,
 * inline styles, same color palette, no Tailwind, no new CSS files.
 */

import Link from "next/link";
import React, { useState, useMemo } from "react";
import { useNoShowRisk, useAnomalyAlerts } from "@/hooks/useAiAnalytics";
import AnomalyAlertBanner from "@/components/analytics/AnomalyAlertBanner";
import type { AppointmentRiskScore, RiskLevel } from "@/types/aiAnalytics";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  high: { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  medium: { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  low: { bg: "#f0fdf4", text: "#166534", border: "#86efac" },
};

type FilterTab = "all" | RiskLevel;

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

// ---------------------------------------------------------------------------
// KPI stat card — matches analytics/page.tsx KpiCard
// ---------------------------------------------------------------------------

function MiniStatCard({
  label,
  value,
  accentColor,
  loading,
}: {
  label: string;
  value: number;
  accentColor: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "18px 20px 16px",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow:
          "0 0 0 1px rgba(0,0,0,0.02), 0 4px 16px rgba(0,0,0,0.05)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* Decorative radial blob */}
      <div
        style={{
          position: "absolute",
          top: -24,
          right: -24,
          width: 88,
          height: 88,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}22 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {loading ? (
        <>
          <div
            style={{
              height: 32,
              width: 64,
              borderRadius: 8,
              background: "#f1f5f9",
              marginBottom: 8,
            }}
          />
          <div
            style={{ height: 12, width: 100, borderRadius: 5, background: "#f1f5f9" }}
          />
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              marginBottom: 6,
            }}
          >
            {value.toLocaleString()}
          </div>
          <div
            style={{ fontSize: 12, color: "#64748b", fontWeight: 500, lineHeight: 1.35 }}
          >
            {label}
          </div>
        </>
      )}

      {/* Bottom accent stripe */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor}40 100%)`,
          borderRadius: "0 0 16px 16px",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  counts: Record<FilterTab, number>;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "4px",
        background: "#f8fafc",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.06)",
        width: "fit-content",
      }}
    >
      {TABS.map(({ key, label }) => {
        const isActive = active === key;
        const accent =
          key === "high"
            ? "#991b1b"
            : key === "medium"
            ? "#92400e"
            : key === "low"
            ? "#166534"
            : "#7c3aed";

        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: isActive ? `1px solid ${accent}28` : "1px solid transparent",
              background: isActive ? "#fff" : "transparent",
              color: isActive ? accent : "#64748b",
              fontWeight: isActive ? 700 : 500,
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.12s",
            }}
          >
            {label}
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                minWidth: 18,
                textAlign: "center",
                padding: "1px 5px",
                borderRadius: 5,
                background: isActive ? `${accent}14` : "#e2e8f0",
                color: isActive ? accent : "#94a3b8",
              }}
            >
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table skeleton rows
// ---------------------------------------------------------------------------

function TableSkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          {[90, 56, 64, 110, 72, 160, 48].map((w, j) => (
            <td
              key={j}
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div
                style={{
                  height: 13,
                  width: w,
                  borderRadius: 5,
                  background: "#f1f5f9",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Risk score bar
// ---------------------------------------------------------------------------

function RiskScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70 ? "#dc2626" : pct >= 40 ? "#d97706" : "#16a34a";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "#f1f5f9",
          borderRadius: 3,
          overflow: "hidden",
          minWidth: 48,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lead time formatter
// ---------------------------------------------------------------------------

function formatLeadTime(computedAt: string, expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diffMs = expiry - now;
  if (diffMs <= 0) return "Expired";
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day";
  return `${diffDays} days`;
}

// ---------------------------------------------------------------------------
// Main table row
// ---------------------------------------------------------------------------

function RiskTableRow({
  item,
  isLast,
}: {
  item: AppointmentRiskScore;
  isLast: boolean;
}) {
  const colors = RISK_COLORS[item.riskLevel];

  return (
    <tr
      style={{
        borderBottom: isLast ? "none" : "1px solid #f8fafc",
      }}
    >
      {/* Patient Code */}
      <td
        style={{
          padding: "13px 16px",
          fontSize: 12,
          fontWeight: 700,
          color: "#475569",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        {item.patientCode}
      </td>

      {/* Risk Level badge */}
      <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: colors.text,
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            padding: "3px 8px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {item.riskLevel}
        </span>
      </td>

      {/* Risk Score bar */}
      <td style={{ padding: "13px 16px", minWidth: 120 }}>
        <RiskScoreBar score={item.riskScore} />
      </td>

      {/* Appointment Type — derived from reasoning snippet if present */}
      <td
        style={{
          padding: "13px 16px",
          fontSize: 12,
          color: "#374151",
          whiteSpace: "nowrap",
        }}
      >
        {item.reasoning
          ? item.reasoning.split(" ").slice(0, 3).join(" ")
          : "Follow-up"}
      </td>

      {/* Lead Time */}
      <td
        style={{
          padding: "13px 16px",
          fontSize: 12,
          color: "#64748b",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatLeadTime(item.computedAt, item.expiresAt)}
      </td>

      {/* Recommendation */}
      <td
        style={{
          padding: "13px 16px",
          fontSize: 12,
          color: "#374151",
          lineHeight: 1.45,
          maxWidth: 260,
        }}
      >
        <span
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } as React.CSSProperties}
        >
          {item.recommendation}
        </span>
      </td>

      {/* View link */}
      <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
        <Link
          href={`/patients/${item.patientId}`}
          style={{
            fontSize: 12,
            color: "#7c3aed",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          View &rarr;
        </Link>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AiAnalyticsPage() {
  const { data: noShowData, loading: noShowLoading } = useNoShowRisk(50);
  const { data: anomalyData, loading: anomalyLoading } = useAnomalyAlerts();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // Filtered + sorted items (highest risk score first within each tab)
  const filteredItems = useMemo<AppointmentRiskScore[]>(() => {
    const items = noShowData?.items ?? [];
    const filtered =
      activeTab === "all" ? items : items.filter((i) => i.riskLevel === activeTab);
    return [...filtered].sort((a, b) => b.riskScore - a.riskScore);
  }, [noShowData, activeTab]);

  // Tab counts
  const counts = useMemo<Record<FilterTab, number>>(() => {
    const items = noShowData?.items ?? [];
    return {
      all: items.length,
      high: items.filter((i) => i.riskLevel === "high").length,
      medium: items.filter((i) => i.riskLevel === "medium").length,
      low: items.filter((i) => i.riskLevel === "low").length,
    };
  }, [noShowData]);

  const highCount = noShowData?.highRiskCount ?? 0;
  const mediumCount = counts.medium;
  const totalCount = noShowData?.total ?? 0;

  return (
    <div style={{ minHeight: "100vh" }}>

      {/* Anomaly alert banner — rendered above the header, same as analytics/page */}
      <AnomalyAlertBanner data={anomalyData} loading={anomalyLoading} />

      {/* ── Gradient header panel ────────────────────────────────────────── */}
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(124,58,237,0.07) 0%, rgba(124,58,237,0.02) 45%, rgba(255,255,255,0) 100%)",
          borderRadius: 20,
          padding: "28px 32px",
          border: "1px solid rgba(124,58,237,0.09)",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative arcs */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            borderRadius: "50%",
            border: "1px solid rgba(124,58,237,0.06)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -30,
            right: -30,
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: "1px solid rgba(124,58,237,0.06)",
            pointerEvents: "none",
          }}
        />

        <div>
          {/* Back link */}
          <Link
            href="/analytics"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: "#7c3aed",
              textDecoration: "none",
              fontWeight: 600,
              marginBottom: 10,
              opacity: 0.85,
            }}
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
            Analytics
          </Link>

          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.03em",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            AI Analytics
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 6, margin: "6px 0 0" }}>
            No-show risk scoring &amp; illness trend anomaly detection
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 14px",
              background: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.2)",
              borderRadius: 20,
              fontSize: 12,
              color: "#7c3aed",
              fontWeight: 700,
            }}
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
              <path d="M12 6v6l4 2" />
            </svg>
            AI-powered
          </div>
        </div>
      </div>

      {/* ── Summary KPI cards ────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <MiniStatCard
          label="Total Scored Appointments"
          value={totalCount}
          accentColor="#7c3aed"
          loading={noShowLoading}
        />
        <MiniStatCard
          label="High-Risk Appointments"
          value={highCount}
          accentColor="#dc2626"
          loading={noShowLoading}
        />
        <MiniStatCard
          label="Medium-Risk Appointments"
          value={mediumCount}
          accentColor="#d97706"
          loading={noShowLoading}
        />
      </div>

      {/* ── Full risk table card ─────────────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.02), 0 8px 24px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Top accent stripe — purple to match AI theme */}
        <div
          style={{
            height: 3,
            background:
              "linear-gradient(90deg, #7c3aed 0%, #7c3aed40 100%)",
          }}
        />

        <div style={{ padding: "20px 24px 0" }}>
          {/* Card header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 18,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#0f172a",
                  margin: "0 0 4px",
                  letterSpacing: "-0.01em",
                }}
              >
                No-Show Risk Table
              </h2>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
                All scored upcoming appointments, sorted by risk score (highest first)
              </p>
            </div>

            <FilterTabs
              active={activeTab}
              onChange={setActiveTab}
              counts={counts}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#f8fafc",
                  borderTop: "1px solid #f1f5f9",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                {[
                  { label: "Patient Code", width: 110 },
                  { label: "Risk Level", width: 90 },
                  { label: "Risk Score", width: 140 },
                  { label: "Appt. Type", width: 120 },
                  { label: "Lead Time", width: 90 },
                  { label: "Recommendation", width: "auto" as const },
                  { label: "", width: 60 },
                ].map((col, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                      width: col.width,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {noShowLoading ? (
                <TableSkeletonRows count={8} />
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "48px 24px",
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 10 }}>&#x2713;</div>
                    <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 14, color: "#64748b" }}>
                      {activeTab === "all"
                        ? "No scored appointments found"
                        : `No ${activeTab}-risk appointments`}
                    </p>
                    <p style={{ margin: 0, fontSize: 12 }}>
                      {activeTab === "all"
                        ? "Run the risk scoring task to populate this table."
                        : `Switch to the "All" tab to see appointments of other risk levels.`}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <RiskTableRow
                    key={item.appointmentId}
                    item={item}
                    isLast={idx === filteredItems.length - 1}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Card footer */}
        {!noShowLoading && filteredItems.length > 0 && (
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Showing {filteredItems.length} of {totalCount} scored appointment
              {totalCount !== 1 ? "s" : ""}
            </span>
            {noShowData?.generatedAt && (
              <span style={{ fontSize: 11, color: "#cbd5e1" }}>
                Scored{" "}
                {new Date(noShowData.generatedAt).toLocaleString("en-PH", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
