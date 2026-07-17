import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics page — vaccination coverage charts, illness trend analysis,
 * appointment no-show rates, and demographic breakdowns.
 * Full implementation in Phase 5 (Analytics).
 */
export default function AnalyticsPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Analytics</h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Real-time health center metrics and trend analysis
      </p>
      {/* TODO: Implement analytics charts (vaccination coverage, illness trends) in Phase 5 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Analytics charts — coming in Phase 5</p>
    </div>
  );
}
