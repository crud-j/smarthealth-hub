import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Main analytics dashboard — shows vaccination coverage, illness trends,
 * appointment no-show rates, and other real-time BHC metrics.
 * Full implementation in Phase 5 (Analytics).
 */
export default function DashboardPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Dashboard</h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Real-time health center analytics and overview
      </p>
      {/* TODO: Implement analytics widgets in Phase 5 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Dashboard — coming in Phase 5</p>
    </div>
  );
}
