import type { Metadata } from "next";

export const metadata: Metadata = { title: "Patients" };

/**
 * Patient list page — search, filter, and manage patient records.
 * Full implementation in Phase 2 (Patient Records).
 */
export default function PatientsPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Patients</h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Search and manage patient records
      </p>
      {/* TODO: Implement patient list with search/filter in Phase 2 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Patient management — coming in Phase 2</p>
    </div>
  );
}
