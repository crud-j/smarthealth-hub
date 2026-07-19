"use client";

/**
 * VaccinationCoverageChart — horizontal bar chart showing vaccination
 * coverage percentage per vaccine name.
 *
 * Implemented as an accessible SVG chart using Tailwind classes for
 * theming. Recharts is not installed; this keeps the bundle small
 * for low-bandwidth rural BHC environments (SDP §7.3).
 *
 * Consumed by: app/(dashboard)/analytics/page.tsx
 * Data source:  useVaccinationCoverage() hook → GET /analytics/vaccination-coverage
 */

import type { VaccinationCoverageItem } from "@/types/analytics";

interface VaccinationCoverageChartProps {
  items: VaccinationCoverageItem[];
  /** Show loading skeleton when true */
  loading?: boolean;
}

const CHART_HEIGHT = 220;
const BAR_COLOR = "#0d9488"; // teal-600
const GRID_COLOR = "#e2e8f0"; // slate-200

export default function VaccinationCoverageChart({
  items,
  loading = false,
}: VaccinationCoverageChartProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-4" role="status" aria-label="Loading chart">
        {[80, 65, 50, 40, 30].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div
              className="h-6 animate-pulse rounded bg-slate-200"
              style={{ width: `${w}%` }}
            />
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

  const maxPct = 100; // always 0–100%
  const paddingLeft = 130; // space for vaccine labels
  const paddingRight = 48;
  const paddingTop = 12;
  const paddingBottom = 24;
  const chartWidth = 480;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const barHeight = 22;
  const barGap = 10;
  const totalHeight =
    paddingTop + items.length * (barHeight + barGap) + paddingBottom;

  // Grid lines at 0%, 25%, 50%, 75%, 100%
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="overflow-x-auto" aria-label="Vaccination coverage bar chart">
      <svg
        viewBox={`0 0 ${chartWidth} ${totalHeight}`}
        width="100%"
        style={{ maxHeight: CHART_HEIGHT + 40 }}
        role="img"
        aria-label="Bar chart of vaccination coverage by vaccine"
      >
        <title>Vaccination Coverage by Vaccine</title>

        {/* Grid lines */}
        {gridLines.map((pct) => {
          const x = paddingLeft + (pct / maxPct) * plotWidth;
          return (
            <g key={pct}>
              <line
                x1={x}
                y1={paddingTop}
                x2={x}
                y2={totalHeight - paddingBottom}
                stroke={GRID_COLOR}
                strokeWidth="1"
              />
              <text
                x={x}
                y={totalHeight - paddingBottom + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {pct}%
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {items.map((item, i) => {
          const y = paddingTop + i * (barHeight + barGap);
          const barWidth = (item.coveragePct / maxPct) * plotWidth;

          return (
            <g key={item.vaccineName}>
              {/* Label */}
              <text
                x={paddingLeft - 8}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fontSize="11"
                fill="#475569"
              >
                {item.vaccineName.length > 16
                  ? item.vaccineName.slice(0, 15) + "…"
                  : item.vaccineName}
              </text>

              {/* Background track */}
              <rect
                x={paddingLeft}
                y={y}
                width={plotWidth}
                height={barHeight}
                rx="3"
                fill="#f1f5f9"
              />

              {/* Filled bar */}
              <rect
                x={paddingLeft}
                y={y}
                width={Math.max(barWidth, 2)}
                height={barHeight}
                rx="3"
                fill={BAR_COLOR}
                aria-label={`${item.vaccineName}: ${item.coveragePct}%`}
              />

              {/* Percentage label */}
              <text
                x={paddingLeft + barWidth + 5}
                y={y + barHeight / 2 + 4}
                fontSize="10"
                fill="#475569"
              >
                {item.coveragePct}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
