"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePatient, usePatientVisits, useDeactivatePatient, useArchivePatient } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import type { VisitSummary } from "@/types/patient";
import React, { useEffect, useState } from "react";
import ProfilePhotoUploader from "@/app/(dashboard)/patients/_components/ProfilePhotoUploader";

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastState { message: string; kind: "success" | "error"; }

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-xs rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${toast.kind === "success" ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}
    >
      {toast.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Flag badge
// ---------------------------------------------------------------------------

const FLAG_COLORS: Record<string, string> = {
  "Senior Citizen": "bg-violet-100 text-violet-700 border border-violet-200",
  "PWD": "bg-sky-100 text-sky-700 border border-sky-200",
  "Pregnant": "bg-pink-100 text-pink-700 border border-pink-200",
  "Inactive": "bg-stone-100 text-stone-500 border border-stone-200",
  "Archived": "bg-amber-100 text-amber-700 border border-amber-200",
};

function FlagBadge({ label }: { label: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${FLAG_COLORS[label] ?? "bg-stone-100 text-stone-600 border border-stone-200"}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Demographics field
// ---------------------------------------------------------------------------

function DemoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-[#b09090]">{label}</p>
      <p className="text-sm font-medium text-[#1a0808]">
        {value || <span className="italic text-[#d4b0b0]">—</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel wrapper
// ---------------------------------------------------------------------------

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-xl bg-white border border-[#e5d4cc] ${className}`}
      style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
    >
      {children}
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
      <div className="flex items-center gap-2.5">
        <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
        <h2 className="text-sm font-bold text-[#1a0808]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visit row
// ---------------------------------------------------------------------------

function VisitRow({ visit }: { visit: VisitSummary }) {
  return (
    <tr className="border-b border-[#f0e4dd] hover:bg-[#fdf5f0] transition-colors duration-150">
      <td className="px-4 py-3 font-mono text-sm font-medium text-[#1a0808] whitespace-nowrap">{visit.caseNo ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-[#7a5252] whitespace-nowrap">{formatDateTime(visit.visitDate)}</td>
      <td className="px-4 py-3 text-sm text-[#7a5252]">{visit.visitType.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</td>
      <td className="max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-sm text-[#7a5252]" title={visit.chiefComplaint ?? undefined}>
        {visit.chiefComplaint ?? <span className="italic text-[#d4b0b0]">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-[#7a5252]">{visit.bloodPressure ?? "—"}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Archive confirmation modal
// ---------------------------------------------------------------------------

function ArchiveModal({
  patientName,
  onConfirm,
  onCancel,
  loading,
}: {
  patientName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit() {
    if (reason.trim().length < 5) {
      setLocalError("Reason must be at least 5 characters.");
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" style={{ border: "1px solid #e5d4cc" }}>
        <h2 className="text-base font-bold text-[#1a0808] mb-2">Archive Patient</h2>
        <p className="text-sm text-[#7a5252] mb-4">
          <strong>{patientName}</strong> will be removed from the main patient list.
          All records are preserved and can be viewed in the Patient Archive.
        </p>
        <label className="block text-xs font-bold uppercase tracking-wider text-[#3d2222] mb-1">
          Reason for archiving *
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => { setReason(e.target.value); setLocalError(null); }}
          placeholder="e.g. Patient relocated, duplicate record, transferred to another facility..."
          className="w-full rounded-lg border border-[#e5d4cc] px-3 py-2 text-sm text-[#1a0808] focus:outline-none focus:ring-2 focus:ring-[#b5343e]"
        />
        {localError && (
          <p className="text-xs text-red-600 mt-1">{localError}</p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-lg bg-[#b5343e] px-5 py-2 text-sm font-bold text-white hover:bg-[#9d1f29] disabled:opacity-60"
          >
            {loading ? "Archiving..." : "Archive Patient"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#e5d4cc] px-5 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PatientProfilePage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = React.use(params);
  const router = useRouter();
  const { data: patient, loading, error } = usePatient(patientId);
  const { data: visits, loading: visitsLoading, error: visitsError } = usePatientVisits(patientId);
  const { user: currentUser } = useCurrentUser();
  const { deactivatePatient, loading: deactivating } = useDeactivatePatient();
  const { archivePatient, loading: archiving } = useArchivePatient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  async function handleDeactivate() {
    if (!confirm("This will mark the patient as inactive. They will no longer appear in search results. Continue?")) return;
    const ok = await deactivatePatient(patientId);
    if (ok) { router.push("/patients"); }
    else { setToast({ message: "Could not deactivate patient. Please try again.", kind: "error" }); }
  }

  async function handleArchive(reason: string) {
    const ok = await archivePatient(patientId, reason);
    if (ok) {
      setShowArchiveModal(false);
      router.push("/patients");
    } else {
      setShowArchiveModal(false);
      setToast({ message: "Could not archive patient. Please try again.", kind: "error" });
    }
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api/v1", "") ?? "http://localhost:8000";
  const initialPhotoUrl = patient?.photoPath ? `${apiBase}${patient.photoPath}` : null;
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const photoEndpointUrl = patientId ? `${apiBase}/api/v1/patients/${patientId}/photo` : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-[960px]">
        <div className="mb-6 space-y-3">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-[#e8d5cc]" />
          <div className="h-5 w-40 animate-pulse rounded bg-[#e8d5cc]" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-[#e8d5cc]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div role="alert" className="rounded-xl border border-[#fcc] bg-[#fef2f2] p-6 text-sm font-medium text-[#b91c1c]">
        {error?.message ?? "Patient not found."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px]">
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs text-[#9b6e6e]">{patient.patientCode}</p>
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">{patient.fullName}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {patient.isSenior && <FlagBadge label="Senior Citizen" />}
            {patient.isPwd && <FlagBadge label="PWD" />}
            {patient.isPregnant && <FlagBadge label="Pregnant" />}
            {!patient.isActive && <FlagBadge label="Inactive" />}
            {patient.archivedAt && <FlagBadge label="Archived" />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/patients/${patientId}/edit`}
            className="rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          >
            Edit
          </Link>
          <Link
            href={`/health-cards/${patientId}/print`}
            className="rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          >
            Print Card
          </Link>
          <Link
            href={`/patients/${patientId}/verify`}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
          >
            Verify
          </Link>
          <button
            type="button"
            onClick={() => { window.open(`/api/v1/patients/${patientId}/summary-pdf`, "_blank"); }}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
          >
            Download Summary
          </button>
          {isAdmin && patient.isActive && (
            <button
              type="button"
              onClick={() => void handleDeactivate()}
              disabled={deactivating}
              className="rounded-lg border border-[#fca5a5] px-4 py-2 text-sm font-bold text-[#dc2626] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dc2626]"
            >
              {deactivating ? "Deactivating..." : "Deactivate Patient"}
            </button>
          )}
          {isAdmin && !patient.archivedAt && (
            <button
              type="button"
              onClick={() => setShowArchiveModal(true)}
              disabled={archiving}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
            >
              Archive Patient
            </button>
          )}
        </div>
      </div>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {showArchiveModal && patient && (
        <ArchiveModal
          patientName={patient.fullName}
          onConfirm={(reason) => void handleArchive(reason)}
          onCancel={() => setShowArchiveModal(false)}
          loading={archiving}
        />
      )}

      {/* Archived banner */}
      {patient.archivedAt && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
          <span className="text-amber-600 text-lg">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              This patient record is archived
              {patient.archivedAt && (
                <> &mdash; since {new Date(patient.archivedAt).toLocaleDateString("en-PH", { dateStyle: "medium" })}</>
              )}
            </p>
            {patient.archiveReason && (
              <p className="text-xs text-amber-700">Reason: {patient.archiveReason}</p>
            )}
            {isAdmin && (
              <Link href="/patients/archived" className="text-xs font-semibold text-amber-800 underline mt-0.5 inline-block">
                View Patient Archive &rarr;
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Demographics card */}
      <Panel className="mb-4">
        <PanelHeader title="Patient Demographics" />
        <div className="p-5">
          <div className="flex items-start gap-5">
            <div className="shrink-0">
              <img
                src={currentPhotoUrl ?? initialPhotoUrl ?? photoEndpointUrl ?? undefined}
                alt="Patient profile photo"
                width={80}
                height={80}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                className="h-20 w-20 rounded-xl border border-[#e5d4cc] bg-[#f0e4dd] object-cover"
              />
            </div>
            <div className="flex-1 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              <DemoField label="Registration Date" value={formatDate(patient.createdAt)} />
              <DemoField label="Birthday" value={`${formatDate(patient.birthDate)} (Age ${patient.age})`} />
              <DemoField label="Sex" value={patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)} />
              <DemoField label="Civil Status" value={patient.civilStatus} />
              <DemoField label="Contact No." value={patient.mobileNumber} />
              <DemoField
                label="PhilHealth"
                value={patient.philhealthNo ? `${patient.philhealthNo}${patient.philhealthMemberType ? ` (${patient.philhealthMemberType})` : ""}` : undefined}
              />
              <DemoField label="Complete Address" value={patient.address} />
              {(patient.guardianName || patient.guardianContact) && (
                <DemoField
                  label="Guardian"
                  value={`${patient.guardianName ?? ""}${patient.guardianContact ? ` — ${patient.guardianContact}` : ""}`.trim()}
                />
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* Photo uploader */}
      <ProfilePhotoUploader
        patientId={patientId}
        currentPhotoUrl={null}
        onPhotoSaved={(url) => {
          const base = (process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api/v1", "") ?? "http://localhost:8000") + url;
          setCurrentPhotoUrl(`${base}?t=${Date.now()}`);
        }}
      />

      {/* Latest vitals */}
      {!visitsLoading && visits.length > 0 && (
        <Panel className="mb-4">
          <PanelHeader title="Latest Recorded Vitals" />
          <div className="p-5">
            <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-4">
              <DemoField label="Blood Pressure" value={visits[0].bloodPressure ?? "—"} />
              <DemoField label="Temperature" value={visits[0].temperature != null ? `${visits[0].temperature}°C` : "—"} />
              <DemoField label="Pulse Rate" value={visits[0].pulseRate != null ? `${visits[0].pulseRate} bpm` : "—"} />
              <DemoField label="Last Visit" value={formatDateTime(visits[0].visitDate)} />
            </div>
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <DemoField label="Chief Complaint" value={visits[0].chiefComplaint ?? "—"} />
              <DemoField
                label="Visit Type"
                value={visits[0].visitType ? visits[0].visitType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "—"}
              />
            </div>
          </div>
        </Panel>
      )}

      {/* Visit history */}
      <Panel>
        <PanelHeader
          title="Visit History"
          action={
            <Link
              href={`/patients/${patientId}/visits/new`}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
              style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
            >
              + Add Visit
            </Link>
          }
        />

        {visitsError && (
          <div role="alert" className="px-5 py-3 text-sm font-medium text-[#dc2626]">{visitsError.message}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Visit history">
            <thead>
              <tr className="bg-gradient-to-br from-[#fdf5f0] to-white">
                {["Case No.", "Date / Time", "Visit Type", "Chief Complaint", "BP"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[#9b6e6e] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visitsLoading && (
                <tr>
                  <td colSpan={5}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 border-b border-[#f0e4dd] px-4 py-3">
                        <div className="h-4 w-16 animate-pulse rounded bg-[#e8d5cc]" />
                        <div className="h-4 w-32 animate-pulse rounded bg-[#e8d5cc]" />
                        <div className="h-4 w-24 animate-pulse rounded bg-[#e8d5cc]" />
                      </div>
                    ))}
                  </td>
                </tr>
              )}
              {!visitsLoading && visits.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 text-[#c08080]">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#9b6e6e]">No visits recorded yet.</p>
                      <p className="mt-1 text-xs text-[#c08080]">Add the first visit to start tracking this patient's care history.</p>
                    </div>
                  </td>
                </tr>
              )}
              {!visitsLoading && visits.map((v) => <VisitRow key={v.id} visit={v} />)}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
