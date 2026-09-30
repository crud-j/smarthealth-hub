"use client";

/**
 * VisitTypeBreakdownChart — donut chart showing the distribution of visit
 * types over a selected date range.
 *
 * Implemented with Recharts PieChart (innerRadius set for a donut style)
 * to match the existing chart library used throughout the analytics module.
 *
 * Consumed by: app/(dashboard)/analytics/page.tsx
 * Data source:  useVisitTypeBreakdown() hook → GET /analytics/visit-type-breakdown
 */

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import type { VisitTypeBreakdownItem } from "@/types/analytics";

interface VisitTypeBreakdownChartProps {
  items: VisitTypeBreakdownItem[];
  /** Show loading skeleton when true */
  loading?: boolean;
}

/**
 * Palette — distinct colours that remain readable on white backgrounds.
 * Cycles if there are more visit types than palette entries.
 */
const PALETTE: readonly string[] = [
  "#b5343e", // crimson — primary brand accent
  "#0d9488", // teal
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
];

function sliceColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? "#94a3b8";
}

/**
 * Format a raw visit_type slug into a human-readable label.
 * "prenatal_checkup" → "Prenatal Checkup"
 */
function formatVisitType(visitType: string): string {
  return visitType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

const tooltipStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5d4cc",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 2px 10px rgba(160,80,80,0.10)",
};

interface TooltipPayloadEntry {
  payload: VisitTypeBreakdownItem & { fill: string };
  value: number;
}

function VisitTypeTooltip({
  active,
  payload,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0] as TooltipPayloadEntry;
  const item = entry.payload;
  const total = payload.reduce((sum, p) => sum + (p.value as number), 0);
  const pct =
    total > 0 ? Math.round((entry.value / total) * 1000) / 10 : 0;

  return (
    <div
      style={{
        ...tooltipStyle,
        borderLeft: `3px solid ${item.fill}`,
        padding: "10px 14px",
      }}
    >
      <p style={{ fontWeight: 700, marginBottom: 4, color: "#0f172a" }}>
        {formatVisitType(item.visitType)}
      </p>
      <p style={{ margin: 0, color: item.fill }}>
        <strong>{entry.value.toLocaleString()}</strong>{" "}
        <span style={{ color: "#64748b" }}>visits</span>
      </p>
      <p style={{ margin: 0, color: "#94a3b8", fontSize: 11 }}>{pct}% of total</p>
    </div>
  );
}

/** Custom legend renderer that shows count alongside each label. */
function renderLegend(props: { payload?: Array<{ color: string; value: string; payload: { count: number } }> }) {
  const { payload = [] } = props;
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: "8px 0 0",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      role="list"
      aria-label="Visit type legend"
    >
      {payload.map((entry, i) => (
        <li
          key={i}
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: entry.color,
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <span style={{ color: "#475569", flex: 1 }}>{entry.value}</span>
          <span style={{ color: "#0f172a", fontWeight: 600, tabularNums: "normal" } as React.CSSProperties}>
            {entry.payload.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function VisitTypeBreakdownChart({
  items,
  loading = false,
}: VisitTypeBreakdownChartProps) {
  if (loading) {
    return (
      <div
        style={{ display: "flex", gap: 24, alignItems: "center", padding: "16px 0" }}
        role="status"
        aria-label="Loading chart"
      >
        {/* Donut skeleton */}
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background:
              "conic-gradient(#f1f5f9 0deg, #e2e8f0 360deg)",
            flexShrink: 0,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
        {/* Legend skeleton */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {[80, 65, 50, 40, 30].map((w, i) => (
            <div
              key={i}
              style={{
                height: 12,
                width: `${w}%`,
                borderRadius: 6,
                background: "#f1f5f9",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No visit data available for this period.
      </div>
    );
  }

  /** Enrich items with display label and slice colour for use in chart data. */
  const chartData = items.map((item, i) => ({
    ...item,
    name: formatVisitType(item.visitType),
    fill: sliceColor(i),
  }));

  return (
    <div aria-label="Visit type distribution donut chart">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="35%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="count"
            nameKey="name"
            paddingAngle={2}
            isAnimationActive
          >
            {chartData.map((entry, i) => (
              <Cell key={entry.visitType} fill={sliceColor(i)} />
            ))}
          </Pie>
          <Tooltip
            content={(props) => <VisitTypeTooltip {...props} />}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            content={(props) =>
              renderLegend(
                props as {
                  payload?: Array<{ color: string; value: string; payload: { count: number } }>;
                }
              )
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
