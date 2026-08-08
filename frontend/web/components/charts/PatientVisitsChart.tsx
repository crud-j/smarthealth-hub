"use client";

/**
 * PatientVisitsChart — area chart of patient visit counts per week.
 *
 * Implemented with Recharts AreaChart with a teal gradient fill for
 * interactivity and responsive resizing.
 *
 * Consumed by: app/(dashboard)/analytics/page.tsx
 * Data source:  useVisitTrends() hook → GET /analytics/visit-trends
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import type { TimeSeriesPoint } from "@/types/analytics";

interface PatientVisitsChartProps {
  points: TimeSeriesPoint[];
  loading?: boolean;
  /** Chart title shown above the chart */
  title?: string;
}

const tooltipStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5d4cc",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 2px 10px rgba(160,80,80,0.10)",
};

function VisitsTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ ...tooltipStyle, borderLeft: "3px solid #0d9488", padding: "10px 14px" }}>
      <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 4px", fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 800, color: "#0d9488", margin: 0 }}>
        {payload[0].value}{" "}
        <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>visits</span>
      </p>
    </div>
  );
}

export default function PatientVisitsChart({
  points,
  loading = false,
  title = "Patient Visits Over Time",
}: PatientVisitsChartProps) {
  if (loading) {
    return (
      <div
        style={{ height: 220, borderRadius: 12, background: "#f8fafc" }}
        role="status"
        aria-label="Loading chart"
      />
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No visit data available.
      </div>
    );
  }

  return (
    <div aria-label={title}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id="visitsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.45} />
              <stop offset="55%" stopColor="#0d9488" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            content={(props) => <VisitsTooltip {...props} />}
            cursor={{ stroke: "#b5343e", strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#0d9488"
            strokeWidth={2.5}
            fill="url(#visitsGrad)"
            dot={false}
            activeDot={{ r: 7, fill: "#b5343e", stroke: "#fff", strokeWidth: 2.5 }}
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
