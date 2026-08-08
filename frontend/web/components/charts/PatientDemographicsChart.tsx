"use client";

/**
 * PatientDemographicsChart — split layout: donut on the left (55% width),
 * sidebar progress stats on the right (45% width). The Recharts Legend is
 * removed entirely; the sidebar replaces it with color-coded progress bars.
 *
 * NOTE: The backend /analytics/overview endpoint does not yet expose
 * seniorCount / pwdCount / pregnantCount. Until it does, callers pass 0
 * for those three props and the chart renders a single "General" segment.
 *
 * Consumed by: app/(dashboard)/analytics/page.tsx
 * Data source:  useDashboardOverview() → GET /analytics/overview
 */

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

export interface PatientDemographicsChartProps {
  totalActivePatients: number;
  seniorCount: number;
  pwdCount: number;
  pregnantCount: number;
  loading?: boolean;
}

interface DemographicSlice {
  name: string;
  value: number;
  color: string;
  total: number;
}

const tooltipStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 10,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
  padding: 0,
};

function DemographicsTooltip({
  active,
  payload,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as DemographicSlice;
  const pct = entry.total > 0 ? Math.round((entry.value / entry.total) * 100) : 0;
  const color = String(payload[0].color);
  return (
    <div style={{ ...tooltipStyle, borderLeft: `3px solid ${color}`, padding: "12px 16px" }}>
      <p style={{ fontWeight: 700, margin: "0 0 4px", fontSize: 13, color: "#0f172a" }}>{entry.name}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.03em" }}>
        {entry.value.toLocaleString()}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>{pct}% of active patients</p>
    </div>
  );
}

export default function PatientDemographicsChart({
  totalActivePatients,
  seniorCount,
  pwdCount,
  pregnantCount,
  loading = false,
}: PatientDemographicsChartProps) {
  if (loading) {
    return (
      <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
        {/* Donut skeleton */}
        <div style={{ flex: "0 0 55%", display: "flex", alignItems: "center", justifyContent: "center", height: 220 }}>
          <div style={{ width: 160, height: 160, borderRadius: "50%", background: "#f1f5f9" }} />
        </div>
        {/* Sidebar skeleton */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          {[100, 70, 45, 60].map((w, i) => (
            <div key={i}>
              <div style={{ height: 14, width: `${w}%`, borderRadius: 6, background: "#f1f5f9", marginBottom: 8 }} />
              <div style={{ height: 4, borderRadius: 2, background: "#f1f5f9" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (totalActivePatients === 0) {
    return (
      <div style={{ display: "flex", height: 200, alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
        No active patient data available.
      </div>
    );
  }

  const generalCount = Math.max(
    0,
    totalActivePatients - seniorCount - pwdCount - pregnantCount
  );

  const rawSlices: Omit<DemographicSlice, "total">[] = [
    { name: "General",  value: generalCount, color: "#0d9488" },
    { name: "Senior",   value: seniorCount,   color: "#d97706" },
    { name: "PWD",      value: pwdCount,      color: "#0284c7" },
    { name: "Pregnant", value: pregnantCount, color: "#db2777" },
  ];

  const data: DemographicSlice[] = rawSlices
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, total: totalActivePatients }));

  return (
    <div style={{ display: "flex", gap: 32, alignItems: "center" }} aria-label="Patient demographics">

      {/* ── Donut chart ──────────────────────────────────────────────────── */}
      <div style={{ flex: "0 0 55%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="54%"
              outerRadius="82%"
              paddingAngle={3}
              label={false}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
              <Label
                position="center"
                content={({ viewBox }) => {
                  const { cx, cy } = (viewBox ?? {}) as { cx?: number; cy?: number; innerRadius: number; outerRadius: number };
                  if (cx == null || cy == null || isNaN(cx) || isNaN(cy)) return null;
                  return (
                    <g>
                      <text
                        x={cx} y={cy - 8}
                        textAnchor="middle"
                        fill="#0f172a"
                        fontSize={28}
                        fontWeight={800}
                        style={{ letterSpacing: "-0.03em" }}
                      >
                        {totalActivePatients.toLocaleString()}
                      </text>
                      <text
                        x={cx} y={cy + 14}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize={12}
                        fontWeight={500}
                      >
                        patients
                      </text>
                    </g>
                  );
                }}
              />
            </Pie>
            <Tooltip content={(props) => <DemographicsTooltip {...props} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ── Sidebar stats ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20,
        }}>
          Breakdown
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {data.map((slice) => {
            const pct = totalActivePatients > 0
              ? Math.round((slice.value / totalActivePatients) * 100)
              : 0;
            return (
              <div key={slice.name}>
                {/* Row: dot + name · value + % */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: slice.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>{slice.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 800, color: "#0f172a",
                      letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
                    }}>
                      {slice.value.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{pct}%</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: 5, borderRadius: 3, background: "#f1f5f9", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    background: `linear-gradient(90deg, ${slice.color} 0%, ${slice.color}cc 100%)`,
                    width: `${pct}%`,
                    transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
