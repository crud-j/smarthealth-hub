"use client";

/**
 * VaccinationCoverageChart — horizontal bar chart showing vaccination
 * coverage percentage per vaccine name.
 *
 * Implemented with Recharts BarChart (layout="vertical") for interactivity
 * and responsive resizing.
 *
 * Consumed by: app/(dashboard)/analytics/page.tsx
 * Data source:  useVaccinationCoverage() hook → GET /analytics/vaccination-coverage
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import type { VaccinationCoverageItem } from "@/types/analytics";

interface VaccinationCoverageChartProps {
  items: VaccinationCoverageItem[];
  /** Show loading skeleton when true */
  loading?: boolean;
}

/** Color-codes bars by coverage threshold. */
function barColor(pct: number): string {
  if (pct >= 90) return "#16a34a"; // green — good
  if (pct >= 70) return "#0d9488"; // teal — acceptable
  if (pct >= 50) return "#d97706"; // amber — warning
  return "#b5343e";                 // crimson — critical
}

const tooltipStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5d4cc",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 2px 10px rgba(160,80,80,0.10)",
};

function VaccinationTooltip({
  active,
  payload,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as VaccinationCoverageItem;
  return (
    <div style={{ ...tooltipStyle, borderLeft: `3px solid ${barColor(item.coveragePct)}`, padding: "10px 14px" }}>
      <p style={{ fontWeight: 700, marginBottom: 4, color: "#0f172a" }}>
        {item.vaccineName}
      </p>
      <p style={{ margin: 0, color: barColor(item.coveragePct) }}>
        Coverage: <strong>{item.coveragePct}%</strong>
      </p>
      <p style={{ margin: 0, color: "#64748b" }}>
        {item.completed} / {item.totalEligible} eligible
      </p>
    </div>
  );
}

export default function VaccinationCoverageChart({
  items,
  loading = false,
}: VaccinationCoverageChartProps) {
  if (loading) {
    return (
      <div style={{ padding: "16px 0" }} role="status" aria-label="Loading chart">
        {[80, 65, 50, 40, 30].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ height: 14, width: 96, borderRadius: 6, background: "#f1f5f9" }} />
            <div style={{ height: 22, borderRadius: 6, background: "#f1f5f9", width: `${w}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No vaccination data available.
      </div>
    );
  }

  // Height scales with item count so bars don't get cramped
  const chartHeight = Math.max(220, items.length * 42);

  return (
    <div aria-label="Vaccination coverage bar chart">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 4, right: 60, bottom: 8, left: 8 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="#f1f5f9"
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="vaccineName"
            width={140}
            tick={{ fontSize: 12, fill: "#475569", fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={(props) => <VaccinationTooltip {...props} />}
            cursor={{ fill: "rgba(0,0,0,0.02)" }}
          />
          <Bar dataKey="coveragePct" radius={[4, 4, 4, 4]} isAnimationActive>
            {items.map((item) => (
              <Cell
                key={item.vaccineName}
                fill={barColor(item.coveragePct)}
              />
            ))}
            <LabelList
              dataKey="coveragePct"
              position="right"
              formatter={(v: unknown) => `${v}%`}
              style={{ fontSize: 11, fill: "#475569" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
