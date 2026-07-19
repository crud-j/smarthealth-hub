"use client";

/**
 * IllnessTrendChart — line chart showing illness/diagnosis trends over time.
 *
 * Supports multiple condition_name series rendered as separate polylines.
 * Each point is a { label, conditionName, count } from the illness-trends API.
 *
 * Consumed by: app/(dashboard)/analytics/illness-trends/page.tsx
 * Data source:  useIllnessTrends() hook → GET /analytics/illness-trends
 */

import type { IllnessTrendPoint } from "@/types/analytics";

interface IllnessTrendChartProps {
  points: IllnessTrendPoint[];
  loading?: boolean;
}

// Color palette for up to 8 condition series
const SERIES_COLORS = [
  "#0d9488", // teal-600
  "#0284c7", // sky-600
  "#7c3aed", // violet-600
  "#dc2626", // red-600
  "#d97706", // amber-600
  "#16a34a", // green-600
  "#db2777", // pink-600
  "#64748b", // slate-500
];

export default function IllnessTrendChart({
  points,
  loading = false,
}: IllnessTrendChartProps) {
  if (loading) {
    return (
      <div className="h-48 animate-pulse rounded-lg bg-slate-100" role="status" aria-label="Loading chart" />
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No illness trend data for the selected range.
      </div>
    );
  }

  // Derive unique labels (x-axis) and unique series (conditions)
  const allLabels = [...new Set(points.map((p) => p.label))].sort();
  const allConditions = [...new Set(points.map((p) => p.conditionName))];

  // Build a lookup: label → conditionName → count
  const lookup: Record<string, Record<string, number>> = {};
  for (const p of points) {
    if (!lookup[p.label]) lookup[p.label] = {};
    lookup[p.label][p.conditionName] = p.count;
  }

  const maxCount = Math.max(...points.map((p) => p.count), 1);

  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 40;
  const svgWidth = Math.max(480, allLabels.length * 60);
  const svgHeight = 220;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const xPos = (i: number) =>
    paddingLeft +
    (allLabels.length > 1 ? (i / (allLabels.length - 1)) * plotWidth : plotWidth / 2);
  const yPos = (count: number) =>
    paddingTop + plotHeight - (count / maxCount) * plotHeight;

  // Y-axis grid — 4 lines
  const yGridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="overflow-x-auto" aria-label="Illness trend line chart">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        style={{ minWidth: 320 }}
        role="img"
        aria-label="Line chart of illness trends over time"
      >
        <title>Illness Trends Over Time</title>

        {/* Y-axis grid lines */}
        {yGridLines.map((frac) => {
          const y = paddingTop + plotHeight - frac * plotHeight;
          const label = Math.round(frac * maxCount);
          return (
            <g key={frac}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={svgWidth - paddingRight}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text x={paddingLeft - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                {label}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {allLabels.map((label, i) => {
          // Show every nth label to avoid crowding
          const step = Math.ceil(allLabels.length / 8);
          if (i % step !== 0 && i !== allLabels.length - 1) return null;
          return (
            <text
              key={label}
              x={xPos(i)}
              y={svgHeight - paddingBottom + 14}
              textAnchor="middle"
              fontSize="9"
              fill="#94a3b8"
            >
              {label}
            </text>
          );
        })}

        {/* Series lines */}
        {allConditions.map((condition, ci) => {
          const color = SERIES_COLORS[ci % SERIES_COLORS.length];
          const pts = allLabels.map((label, i) => {
            const count = lookup[label]?.[condition] ?? 0;
            return `${xPos(i)},${yPos(count)}`;
          });

          return (
            <g key={condition}>
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Dots */}
              {allLabels.map((label, i) => {
                const count = lookup[label]?.[condition] ?? 0;
                return (
                  <circle
                    key={label}
                    cx={xPos(i)}
                    cy={yPos(count)}
                    r="3"
                    fill={color}
                    aria-label={`${condition} on ${label}: ${count}`}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      {allConditions.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2">
          {allConditions.map((cond, ci) => (
            <div key={cond} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className="inline-block h-2.5 w-4 rounded-sm"
                style={{ backgroundColor: SERIES_COLORS[ci % SERIES_COLORS.length] }}
                aria-hidden="true"
              />
              {cond}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
