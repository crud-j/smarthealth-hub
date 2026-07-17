import type { Metadata } from "next";

export const metadata: Metadata = { title: "Immunizations" };

/**
 * Immunizations tracking page — record and track vaccination schedules,
 * coverage rates, and upcoming immunization reminders.
 * Full implementation in Phase 2 (Patient Records).
 */
export default function ImmunizationsPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Immunizations
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Track vaccination schedules and immunization records
      </p>
      {/* TODO: Implement ImmunizationTracker in Phase 2 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
        Immunization tracking — coming in Phase 2
      </p>
    </div>
  );
}
