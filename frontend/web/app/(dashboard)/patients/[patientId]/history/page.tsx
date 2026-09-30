"use client";

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
  return new Date(iso).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function capitalizeWords(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface VisitApiResponse {
  id: string; patient_id: string; recorded_by?: string | null; case_no?: string | null;
  visit_date: string; visit_type: string; created_at: string; blood_pressure?: string | null;
  temperature?: number | null; pulse_rate?: number | null; respiratory_rate?: number | null;
  oxygen_saturation?: number | null; weight_kg?: number | null; height_cm?: number | null;
  chief_complaint?: string | null; past_medical_history?: string | null;
  present_medical_history?: string | null; diagnosis?: string | null;
  treatment_notes?: string | null; patient_name?: string | null;
}

function mapVisitResponse(r: VisitApiResponse): Visit {
  return {
    id: r.id, patientId: r.patient_id, recordedBy: r.recorded_by, caseNo: r.case_no,
    visitDate: r.visit_date, visitType: r.visit_type, createdAt: r.created_at,
    bloodPressure: r.blood_pressure, temperature: r.temperature, pulseRate: r.pulse_rate,
    respiratoryRate: r.respiratory_rate, oxygenSaturation: r.oxygen_saturation,
    weightKg: r.weight_kg, heightCm: r.height_cm, chiefComplaint: r.chief_complaint,
    pastMedicalHistory: r.past_medical_history, presentMedicalHistory: r.present_medical_history,
    diagnosis: r.diagnosis, treatmentNotes: r.treatment_notes, patientName: r.patient_name,
  };
}

// ---------------------------------------------------------------------------
// Visit row
// ---------------------------------------------------------------------------

interface VisitRowProps { visit: VisitSummary; canEdit: boolean; onEdit: (id: string) => void; editLoading: boolean; }

function VisitRow({ visit, canEdit, onEdit, editLoading }: VisitRowProps) {
  return (
    <tr className="border-b border-[#f0e4dd] hover:bg-[#fdf5f0] transition-colors duration-150">
      <td className="px-4 py-3 font-mono text-sm font-medium text-[#1a0808] whitespace-nowrap">{visit.caseNo ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-[#7a5252] whitespace-nowrap">{formatDateTime(visit.visitDate)}</td>
      <td className="px-4 py-3 text-sm text-[#7a5252]">{capitalizeWords(visit.visitType)}</td>
      <td className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-sm text-[#7a5252]" title={visit.chiefComplaint ?? undefined}>
        {visit.chiefComplaint ?? <span className="italic text-[#d4b0b0]">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-[#7a5252]">{visit.bloodPressure ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-[#7a5252]">{visit.temperature != null ? `${visit.temperature}°C` : "—"}</td>
      {canEdit && (
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={() => onEdit(visit.id)}
            disabled={editLoading}
            className="rounded-lg border border-[#e5d4cc] bg-[#fff0ee] px-3 py-1.5 text-xs font-semibold text-[#b5343e] hover:bg-[#fde8e4] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
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

export default function PatientHistoryPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = React.use(params);
  const { user: currentUser } = useCurrentUser();
  const { data: visits, loading, error, refetch } = usePatientVisits(patientId);

  const canEdit = currentUser?.role === "physician" || currentUser?.role === "admin";

  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [editFetchLoading, setEditFetchLoading] = useState(false);
  const [editFetchError, setEditFetchError] = useState<string | null>(null);

  const handleEditClick = useCallback(async (visitId: string) => {
    setEditFetchLoading(true);
    setEditFetchError(null);
    try {
      const raw = await apiFetch<VisitApiResponse>(`/visits/${visitId}`);
      setEditingVisit(mapVisitResponse(raw));
    } catch (err) {
      setEditFetchError(err instanceof ApiError ? err.message : "Could not load visit details.");
    } finally {
      setEditFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!editFetchError) return;
    const t = window.setTimeout(() => setEditFetchError(null), 5000);
    return () => window.clearTimeout(t);
  }, [editFetchError]);

  const headers = ["Case No.", "Date / Time", "Visit Type", "Chief Complaint", "BP", "Temp", ...(canEdit ? [""] : [])];

  return (
    <div className="mx-auto max-w-[1024px]">
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/patients/${patientId}`}
            className="text-xs font-medium text-[#9b6e6e] hover:text-[#b5343e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          >
            &larr; Back to patient profile
          </Link>
          <h1 className="mt-1 text-3xl leading-tight text-[#1a0808] font-display">Visit History</h1>
        </div>
        <Link
          href={`/patients/${patientId}/visits/new`}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
        >
          + Add Visit
        </Link>
      </div>

      {/* Edit fetch error */}
      {editFetchError && (
        <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] p-4 text-sm font-medium text-[#b91c1c]">
          {editFetchError}
        </div>
      )}

      {/* Table card */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        {/* Loading */}
        {loading && (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                {Array.from({ length: 6 }).map((__, j) => (
                  <div key={j} className="h-4 flex-1 animate-pulse rounded bg-[#e8d5cc]" />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div role="alert" className="px-5 py-4 text-sm font-medium text-[#dc2626]">{error.message}</div>
        )}

        {/* Empty */}
        {!loading && !error && visits.length === 0 && (
          <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-[#c08080]">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[#9b6e6e]">No visits recorded yet.</p>
            <p className="mt-1 text-xs text-[#c08080]">Add the first visit to start tracking care history.</p>
          </div>
        )}

        {/* Table */}
        {!loading && visits.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" aria-label="Visit history">
              <thead>
                <tr className="border-b-2 border-[#e5d4cc]" style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#9b6e6e] whitespace-nowrap ${i === headers.length - 1 && canEdit ? "text-right" : "text-left"}`}
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
          </div>
        )}
      </div>

      {editingVisit && (
        <VisitEditModal
          visit={editingVisit}
          onClose={() => setEditingVisit(null)}
          onSaved={() => { setEditingVisit(null); refetch(); }}
        />
      )}
    </div>
  );
}
