"use client";

/**
 * PatientVisitsChart — line chart of patient visit counts per week or month.
 *
 * Accepts pre-aggregated TimeSeriesPoint data (from analyticsAggregator.worker.ts
 * or synchronous fallback) and renders a simple SVG line chart.
 *
 * Consumed by: app/(dashboard)/analytics/page.tsx
 * Data source:  useVaccinationCoverage or analyticsAggregator groupByWeek output
 */

import type { TimeSeriesPoint } from "@/workers/analyticsAggregator.worker";

interface PatientVisitsChartProps {
  points: TimeSeriesPoint[];
  loading?: boolean;
  /** Chart title shown above the SVG */
  title?: string;
}

export default function PatientVisitsChart({
  points,
  loading = false,
  title = "Patient Visits Over Time",
}: PatientVisitsChartProps) {
  if (loading) {
    return (
      <div className="h-48 animate-pulse rounded-lg bg-slate-100" role="status" aria-label="Loading chart" />
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        No visit data available.
      </div>
    );
  }

  const maxValue = Math.max(...points.map((p) => p.value), 1);

  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 40;
  const svgWidth = Math.max(480, points.length * 60);
  const svgHeight = 200;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const xPos = (i: number) =>
    paddingLeft +
    (points.length > 1 ? (i / (points.length - 1)) * plotWidth : plotWidth / 2);
  const yPos = (val: number) =>
    paddingTop + plotHeight - (val / maxValue) * plotHeight;

  const polyPoints = points
    .map((p, i) => `${xPos(i)},${yPos(p.value)}`)
    .join(" ");

  // Filled area path
  const areaPath =
    `M ${xPos(0)},${yPos(points[0].value)} ` +
    points
      .slice(1)
      .map((p, i) => `L ${xPos(i + 1)},${yPos(p.value)}`)
      .join(" ") +
    ` L ${xPos(points.length - 1)},${paddingTop + plotHeight} L ${xPos(0)},${paddingTop + plotHeight} Z`;

  const yGridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div aria-label={title}>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          style={{ minWidth: 320 }}
          role="img"
          aria-label={title}
        >
          <title>{title}</title>

          {/* Area fill */}
          <path d={areaPath} fill="#0d9488" fillOpacity="0.1" />

          {/* Y-axis grid lines */}
          {yGridLines.map((frac) => {
            const y = paddingTop + plotHeight - frac * plotHeight;
            const label = Math.round(frac * maxValue);
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
          {points.map((p, i) => {
            const step = Math.ceil(points.length / 8);
            if (i % step !== 0 && i !== points.length - 1) return null;
            return (
              <text
                key={p.label}
                x={xPos(i)}
                y={svgHeight - paddingBottom + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#94a3b8"
              >
                {p.label}
              </text>
            );
          })}

          {/* Line */}
          <polyline
            points={polyPoints}
            fill="none"
            stroke="#0d9488"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Dots */}
          {points.map((p, i) => (
            <circle
              key={p.label}
              cx={xPos(i)}
              cy={yPos(p.value)}
              r="3.5"
              fill="#0d9488"
              aria-label={`${p.label}: ${p.value} visits`}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
