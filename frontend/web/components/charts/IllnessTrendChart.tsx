"use client";

/**
 * IllnessTrendChart — multi-series line chart of illness/diagnosis trends.
 *
 * Pivots flat IllnessTrendPoint[] into one object per x-axis period so
 * Recharts LineChart can render one Line per unique conditionName.
 *
 * Consumed by: app/(dashboard)/analytics/illness-trends/page.tsx
 * Data source:  useIllnessTrends() hook → GET /analytics/illness-trends
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import type { IllnessTrendPoint } from "@/types/analytics";

interface IllnessTrendChartProps {
  points: IllnessTrendPoint[];
  loading?: boolean;
}

// Color palette for up to 8 condition series — crimson first per spec
const SERIES_COLORS = [
  "#b5343e", // crimson
  "#0d9488", // teal
  "#0284c7", // sky-600
  "#7c3aed", // violet-600
  "#d97706", // amber-600
  "#16a34a", // green-600
  "#db2777", // pink-600
  "#64748b", // slate-500
];

const tooltipStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5d4cc",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  color: "#1a0808",
  boxShadow: "0 2px 10px rgba(160,80,80,0.10)",
};

function TrendTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 700, marginBottom: 4, color: "#1a0808" }}>
        {label}
      </p>
      {payload.map((entry: { name?: NameType; color?: string; value?: ValueType }) => (
        <p
          key={String(entry.name)}
          style={{ margin: 0, color: String(entry.color) }}
        >
          {entry.name}: <strong>{entry.value}</strong>
        </p>
      ))}
    </div>
  );
}

export default function IllnessTrendChart({
  points,
  loading = false,
}: IllnessTrendChartProps) {
  if (loading) {
    return (
      <div
        className="h-48 animate-pulse rounded-lg bg-slate-100"
        role="status"
        aria-label="Loading chart"
      />
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No illness trend data for the selected range.
      </div>
    );
  }

  // Pivot flat array → one object per label with each condition as a key
  const allLabels = [...new Set(points.map((p) => p.label))].sort();
  const allConditions = [...new Set(points.map((p) => p.conditionName))];

  const pivoted: Record<string, string | number>[] = allLabels.map((label) => {
    const row: Record<string, string | number> = { label };
    for (const cond of allConditions) {
      const match = points.find(
        (p) => p.label === label && p.conditionName === cond
      );
      row[cond] = match?.count ?? 0;
    }
    return row;
  });

  return (
    <div aria-label="Illness trend line chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={pivoted}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0e4dd" />
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
            width={30}
          />
          <Tooltip
            content={(props) => <TrendTooltip {...props} />}
            cursor={{ stroke: "#e5d4cc", strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          {allConditions.map((cond, index) => (
            <Line
              key={cond}
              type="monotone"
              dataKey={cond}
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
