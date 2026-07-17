import type { Metadata } from "next";

export const metadata: Metadata = { title: "Patient Details" };

interface PatientDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Patient detail page — shows full medical history, visits, immunizations,
 * and health card options for a specific patient.
 * Full implementation in Phase 2 (Patient Records).
 */
export default async function PatientDetailPage({ params }: PatientDetailPageProps) {
  const { id } = await params;
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Patient Details
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Patient ID: {id}
      </p>
      {/* TODO: Implement PatientDetailView in Phase 2 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Patient detail view — coming in Phase 2</p>
    </div>
  );
}
