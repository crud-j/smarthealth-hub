"use client";

/**
 * Patient Visit History page.
 *
 * Shows a full table of visit summaries for the given patient.  A clinical
 * role user (physician / admin) sees an "Edit" button on each row that opens
 * VisitEditModal to update the visit record in-place.
 *
 * PHI note: The list view shows VisitSummary rows (no encrypted PHI).
 * Editing a visit via VisitEditModal calls GET /visits/{id} first to surface
 * the decrypted diagnosis and treatment_notes for physician/admin users.
 *
 * Data strategy: usePatientVisits (VisitSummary list) + useGetVisit for
 * single-visit PHI access on edit open.  useUpdateVisit powers the modal.
 */

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePatientVisits } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { VisitSummary, Visit } from "@/types/patient";
import VisitEditModal from "@/components/modals/VisitEditModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function capitalizeWords(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Mirrors VisitApiResponse shape from usePatients.ts for the single-visit fetch
interface VisitApiResponse {
  id: string;
  patient_id: string;
  recorded_by?: string | null;
  case_no?: string | null;
  visit_date: string;
  visit_type: string;
  created_at: string;
  blood_pressure?: string | null;
  temperature?: number | null;
  pulse_rate?: number | null;
  respiratory_rate?: number | null;
  oxygen_saturation?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  chief_complaint?: string | null;
  past_medical_history?: string | null;
  present_medical_history?: string | null;
  diagnosis?: string | null;
  treatment_notes?: string | null;
  patient_name?: string | null;
}

function mapVisitResponse(r: VisitApiResponse): Visit {
  return {
    id: r.id,
    patientId: r.patient_id,
    recordedBy: r.recorded_by,
    caseNo: r.case_no,
    visitDate: r.visit_date,
    visitType: r.visit_type,
    createdAt: r.created_at,
    bloodPressure: r.blood_pressure,
    temperature: r.temperature,
    pulseRate: r.pulse_rate,
    respiratoryRate: r.respiratory_rate,
    oxygenSaturation: r.oxygen_saturation,
    weightKg: r.weight_kg,
    heightCm: r.height_cm,
    chiefComplaint: r.chief_complaint,
    pastMedicalHistory: r.past_medical_history,
    presentMedicalHistory: r.present_medical_history,
    diagnosis: r.diagnosis,
    treatmentNotes: r.treatment_notes,
    patientName: r.patient_name,
  };
}

// ---------------------------------------------------------------------------
// Visit table row
// ---------------------------------------------------------------------------

interface VisitRowProps {
  visit: VisitSummary;
  canEdit: boolean;
  onEdit: (id: string) => void;
  editLoading: boolean;
}

function VisitRow({ visit, canEdit, onEdit, editLoading }: VisitRowProps) {
  return (
    <tr style={{ borderBottom: "1px solid #f0e4dd" }}>
      <td
        style={{
          padding: "0.625rem 1rem",
          fontSize: "0.8125rem",
          fontFamily: "monospace",
          color: "#1a0808",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {visit.caseNo ?? "—"}
      </td>
      <td
        style={{
          padding: "0.625rem 1rem",
          fontSize: "0.8125rem",
          color: "#7a5252",
          whiteSpace: "nowrap",
        }}
      >
        {formatDateTime(visit.visitDate)}
      </td>
      <td style={{ padding: "0.625rem 1rem", fontSize: "0.8125rem", color: "#7a5252" }}>
        {capitalizeWords(visit.visitType)}
      </td>
      <td
        style={{
          padding: "0.625rem 1rem",
          fontSize: "0.8125rem",
          color: "#7a5252",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={visit.chiefComplaint ?? undefined}
      >
        {visit.chiefComplaint ?? (
          <span style={{ color: "#d4b0b0", fontStyle: "italic" }}>—</span>
        )}
      </td>
      <td style={{ padding: "0.625rem 1rem", fontSize: "0.8125rem", color: "#7a5252" }}>
        {visit.bloodPressure ?? "—"}
      </td>
      <td style={{ padding: "0.625rem 1rem", fontSize: "0.8125rem", color: "#7a5252" }}>
        {visit.temperature != null ? `${visit.temperature}°C` : "—"}
      </td>
      {canEdit && (
        <td style={{ padding: "0.625rem 1rem", textAlign: "right" }}>
          <button
            type="button"
            onClick={() => onEdit(visit.id)}
            disabled={editLoading}
            style={{
              padding: "0.25rem 0.625rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#b5343e",
              background: "#fff0ee",
              border: "1px solid #e5d4cc",
              borderRadius: "0.375rem",
              cursor: editLoading ? "not-allowed" : "pointer",
              opacity: editLoading ? 0.6 : 1,
            }}
          >
            Edit
          </button>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PatientHistoryPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = React.use(params);
  const { user: currentUser } = useCurrentUser();
  const { data: visits, loading, error, refetch } = usePatientVisits(patientId);

  // Only physician and admin may edit visits
  const canEdit =
    currentUser?.role === "physician" || currentUser?.role === "admin";

  // State for the edit modal: holds the fully loaded Visit (with decrypted PHI)
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [editFetchLoading, setEditFetchLoading] = useState(false);
  const [editFetchError, setEditFetchError] = useState<string | null>(null);

  // When "Edit" is clicked on a summary row, fetch the full visit (with PHI)
  // before opening the modal so the form can pre-fill diagnosis/treatmentNotes.
  const handleEditClick = useCallback(
    async (visitId: string) => {
      setEditFetchLoading(true);
      setEditFetchError(null);
      try {
        const raw = await apiFetch<VisitApiResponse>(`/visits/${visitId}`);
        setEditingVisit(mapVisitResponse(raw));
      } catch (err) {
        setEditFetchError(
          err instanceof ApiError ? err.message : "Could not load visit details."
        );
      } finally {
        setEditFetchLoading(false);
      }
    },
    []
  );

  // Dismiss the edit-fetch error toast automatically after 5 s
  useEffect(() => {
    if (!editFetchError) return;
    const t = window.setTimeout(() => setEditFetchError(null), 5000);
    return () => window.clearTimeout(t);
  }, [editFetchError]);

  // Column headers — add "Actions" column for clinical roles
  const headers = [
    "Case No.",
    "Date / Time",
    "Visit Type",
    "Chief Complaint",
    "BP",
    "Temp",
    ...(canEdit ? [""] : []),
  ];

  return (
    <div style={{ maxWidth: 1024, margin: "0 auto" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <Link
            href={`/patients/${patientId}`}
            style={{
              fontSize: "0.75rem",
              color: "#9b6e6e",
              textDecoration: "none",
            }}
          >
            &larr; Back to patient profile
          </Link>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#1a0808",
              margin: "0.25rem 0 0",
            }}
          >
            Visit History
          </h1>
        </div>
        <Link
          href={`/patients/${patientId}/visits/new`}
          style={{
            padding: "0.5rem 1rem",
            background: "linear-gradient(135deg, #b5343e, #c94060)",
            color: "white",
            borderRadius: "0.375rem",
            fontSize: "0.8125rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          + Add Visit
        </Link>
      </div>

      {/* Edit-fetch error (inline banner, not alert()) */}
      {editFetchError && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "0.5rem",
            color: "#dc2626",
            fontSize: "0.875rem",
          }}
        >
          {editFetchError}
        </div>
      )}

      {/* Visit table card */}
      <div
        style={{
          background: "white",
          border: "1px solid #e5d4cc",
          borderRadius: "1rem",
          overflow: "hidden",
          boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
        }}
      >
        {/* Loading state */}
        {loading && (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "#b09090",
              fontSize: "0.875rem",
            }}
          >
            Loading visits...
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div
            style={{
              padding: "1rem 1.5rem",
              color: "#dc2626",
              fontSize: "0.875rem",
            }}
          >
            {error.message}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && visits.length === 0 && (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "#b09090",
              fontSize: "0.875rem",
            }}
          >
            No visits recorded yet.
          </div>
        )}

        {/* Table */}
        {!loading && visits.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "0.5rem 1rem",
                      textAlign: i === headers.length - 1 && canEdit ? "right" : "left",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      color: "#9b6e6e",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <VisitRow
                  key={v.id}
                  visit={v}
                  canEdit={canEdit}
                  onEdit={(id) => void handleEditClick(id)}
                  editLoading={editFetchLoading}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit modal — rendered when a fully loaded visit is ready */}
      {editingVisit && (
        <VisitEditModal
          visit={editingVisit}
          onClose={() => setEditingVisit(null)}
          onSaved={() => {
            setEditingVisit(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
