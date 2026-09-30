"use client";

import Link from "next/link";
import React, { useState, useMemo } from "react";
import { useNoShowRisk, useAnomalyAlerts } from "@/hooks/useAiAnalytics";
import AnomalyAlertBanner from "@/components/analytics/AnomalyAlertBanner";
import type { AppointmentRiskScore, RiskLevel } from "@/types/aiAnalytics";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_BADGE: Record<RiskLevel, string> = {
  high:   "bg-red-50 text-red-800 ring-1 ring-inset ring-red-600/20",
  medium: "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-600/20",
  low:    "bg-green-50 text-green-800 ring-1 ring-inset ring-green-600/20",
};

type FilterTab = "all" | RiskLevel;

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all",    label: "All"    },
  { key: "high",   label: "High"   },
  { key: "medium", label: "Medium" },
  { key: "low",    label: "Low"    },
];

const TAB_ACTIVE_TEXT: Record<FilterTab, string> = {
  all:    "text-slate-800",
  high:   "text-red-700",
  medium: "text-yellow-700",
  low:    "text-green-700",
};

// ---------------------------------------------------------------------------
// KPI card (no decorations — data is the focus)
// ---------------------------------------------------------------------------

function KpiCard({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {loading ? (
        <div className="mt-4 h-9 w-16 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
      ) : (
        <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
          {value.toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs — segmented control
// ---------------------------------------------------------------------------

function FilterTabs({ active, onChange, counts }: {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  counts: Record<FilterTab, number>;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Filter by risk level">
      {TABS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500 ${
              isActive
                ? `bg-white shadow-sm ${TAB_ACTIVE_TEXT[key]}`
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            <span className={`rounded px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums ${
              isActive ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"
            }`}>
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk score bar
// ---------------------------------------------------------------------------

function RiskScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#dc2626" : pct >= 40 ? "#d97706" : "#16a34a";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-[48px] flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lead time formatter
// ---------------------------------------------------------------------------

function formatLeadTime(_computedAt: string, expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Expired";
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day";
  return `${diffDays} days`;
}

// ---------------------------------------------------------------------------
// Table skeleton
// ---------------------------------------------------------------------------

function TableSkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {[90, 56, 64, 110, 72, 160, 48].map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-100" style={{ width: w }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

function RiskTableRow({ item, isLast }: { item: AppointmentRiskScore; isLast: boolean }) {
  return (
    <tr className={`transition-colors duration-100 hover:bg-slate-50 ${!isLast ? "border-b border-slate-100" : ""}`}>
      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-600 whitespace-nowrap">
        {item.patientCode}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold capitalize ${RISK_BADGE[item.riskLevel]}`}>
          {item.riskLevel}
        </span>
      </td>
      <td className="px-4 py-3.5 min-w-[120px]">
        <RiskScoreBar score={item.riskScore} />
      </td>
      <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
        {item.reasoning ? item.reasoning.split(" ").slice(0, 3).join(" ") : "Follow-up"}
      </td>
      <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap tabular-nums">
        {formatLeadTime(item.computedAt, item.expiresAt)}
      </td>
      <td className="max-w-[260px] px-4 py-3.5 text-xs text-slate-600 leading-relaxed">
        <p
          className="overflow-hidden"
          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}
        >
          {item.recommendation}
        </p>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <Link
          href={`/patients/${item.patientId}`}
          className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors focus-visible:outline-none focus-visible:underline"
        >
          View
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

  const filteredItems = useMemo<AppointmentRiskScore[]>(() => {
    const items = noShowData?.items ?? [];
    const filtered = activeTab === "all" ? items : items.filter((i) => i.riskLevel === activeTab);
    return [...filtered].sort((a, b) => b.riskScore - a.riskScore);
  }, [noShowData, activeTab]);

  const counts = useMemo<Record<FilterTab, number>>(() => {
    const items = noShowData?.items ?? [];
    return {
      all:    items.length,
      high:   items.filter((i) => i.riskLevel === "high").length,
      medium: items.filter((i) => i.riskLevel === "medium").length,
      low:    items.filter((i) => i.riskLevel === "low").length,
    };
  }, [noShowData]);

  const highCount   = noShowData?.highRiskCount ?? 0;
  const mediumCount = counts.medium;
  const totalCount  = noShowData?.total ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AnomalyAlertBanner data={anomalyData} loading={anomalyLoading} />

      {/* Header */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2">
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:underline"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15,18 9,12 15,6" />
              </svg>
              Analytics
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">AI Analytics</h1>
          <p className="mt-2 text-sm text-slate-500">No-show risk scoring and illness trend anomaly detection.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-700">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
          </svg>
          AI-powered
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-8 flex flex-wrap gap-4" aria-label="AI analytics summary">
        <KpiCard label="Total Scored Appointments" value={totalCount}  loading={noShowLoading} />
        <KpiCard label="High-Risk Appointments"    value={highCount}   loading={noShowLoading} />
        <KpiCard label="Medium-Risk Appointments"  value={mediumCount} loading={noShowLoading} />
      </section>

      {/* Risk table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Card header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">No-Show Risk Table</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              All scored upcoming appointments, sorted by risk score — highest first.
            </p>
          </div>
          <FilterTabs active={activeTab} onChange={setActiveTab} counts={counts} />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="No-show risk scores">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {[
                  { label: "Patient Code", w: 110 },
                  { label: "Risk Level",   w: 90  },
                  { label: "Risk Score",   w: 140 },
                  { label: "Appt. Type",   w: 120 },
                  { label: "Lead Time",    w: 90  },
                  { label: "Recommendation"       },
                  { label: "",             w: 60  },
                ].map((col, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
                    style={col.w ? { width: col.w } : {}}
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
                  <td colSpan={7}>
                    <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20,6 9,17 4,12" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-slate-700">
                        {activeTab === "all" ? "No scored appointments found" : `No ${activeTab}-risk appointments`}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {activeTab === "all"
                          ? "Run the risk scoring task to populate this table."
                          : `Switch to "All" to see appointments at other risk levels.`}
                      </p>
                    </div>
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

        {/* Footer */}
        {!noShowLoading && filteredItems.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
            <span className="text-xs text-slate-500">
              Showing {filteredItems.length} of {totalCount} scored appointment{totalCount !== 1 ? "s" : ""}
            </span>
            {noShowData?.generatedAt && (
              <span className="text-xs text-slate-400">
                Scored{" "}
                {new Date(noShowData.generatedAt).toLocaleString("en-PH", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
