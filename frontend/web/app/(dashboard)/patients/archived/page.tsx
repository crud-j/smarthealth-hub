"use client";
/**
 * Archived Patients page.
 * URL: /patients/archived
 * Auth: Admin / Physician only
 *
 * Lists all archived patients with search, and provides an Unarchive action.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchivedPatientSummary {
  id: string;
  patient_code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  birth_date: string;
  age: number;
  sex: string;
  mobile_number: string | null;
  is_senior: boolean;
  is_pwd: boolean;
  is_active: boolean;
  blood_type: string | null;
  archived_at: string;
  archived_by: string | null;
  archive_reason: string | null;
}

interface PaginatedArchivedPatients {
  items: ArchivedPatientSummary[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastState { message: string; kind: "success" | "error"; }

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-xs rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-xl ${
        toast.kind === "success" ? "bg-[#16a34a]" : "bg-[#dc2626]"
      }`}
    >
      {toast.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unarchive confirmation modal
// ---------------------------------------------------------------------------

function UnarchiveModal({
  patient,
  onConfirm,
  onCancel,
  loading,
}: {
  patient: ArchivedPatientSummary;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" style={{ border: "1px solid #e5d4cc" }}>
        <h2 className="text-base font-bold text-[#1a0808] mb-2">Unarchive Patient?</h2>
        <p className="text-sm text-[#7a5252] mb-1">
          <strong>{patient.full_name || `${patient.first_name} ${patient.last_name}`}</strong> ({patient.patient_code})
          will be restored and visible again in the patient list.
        </p>
        {patient.archive_reason && (
          <p className="text-xs text-[#9b6e6e] mb-4">
            Archive reason: <em>{patient.archive_reason}</em>
          </p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-[#b5343e] px-5 py-2 text-sm font-bold text-white hover:bg-[#9d1f29] disabled:opacity-60"
          >
            {loading ? "Restoring..." : "Yes, Unarchive"}
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
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export default function ArchivedPatientsPage() {
  const { user } = useCurrentUser();
  const [patients, setPatients] = useState<ArchivedPatientSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [unarchiveTarget, setUnarchiveTarget] = useState<ArchivedPatientSummary | null>(null);
  const [unarchiving, setUnarchiving] = useState(false);

  const isAdmin = user?.role === "admin";

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      const data = await apiFetch<PaginatedArchivedPatients>(`/patients/archived?${params.toString()}`);
      // Compute full_name if not present
      const items = data.items.map((p) => ({
        ...p,
        full_name: p.full_name || [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" "),
      }));
      setPatients(items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load archived patients.");
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => { void fetchPatients(); }, [fetchPatients]);

  async function handleUnarchive() {
    if (!unarchiveTarget) return;
    setUnarchiving(true);
    try {
      await apiFetch(`/patients/${unarchiveTarget.id}/unarchive`, { method: "POST" });
      setUnarchiveTarget(null);
      setToast({ message: `${unarchiveTarget.full_name} has been restored.`, kind: "success" });
      void fetchPatients();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Unarchive failed.",
        kind: "error",
      });
    } finally {
      setUnarchiving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!isAdmin && user?.role !== "physician") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Access denied. Only Admins and Physicians can view the patient archive.
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/patients" className="text-sm text-[#b5343e] hover:underline font-medium">
              &larr; Patients
            </Link>
            <span className="text-[#d4b0b0]">/</span>
            <span className="text-sm text-[#7a5252]">Archive</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Patient Archive
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Archived patients are hidden from the main patient list. Their records are fully preserved.
          </p>
        </div>
      </header>

      {/* Search */}
      <div className="mb-5 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search by name, patient code, or mobile..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="rounded-lg border border-[#e5d4cc] px-3 py-2 text-sm text-[#1a0808] placeholder-[#b09090] focus:outline-none focus:ring-2 focus:ring-[#b5343e] w-80"
        />
        <span className="text-sm text-slate-500">{total} archived patient{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#e5d4cc] bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading archived patients...</div>
        ) : patients.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No archived patients found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#edd9d0] bg-gradient-to-br from-[#fdf0eb] to-white">
              <tr>
                {["Patient", "Age / Sex", "Archive Date", "Archived By", "Reason", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#b09090]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-b border-[#f0e4dd] hover:bg-[#fdf5f0] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${p.id}`} className="font-semibold text-[#1a0808] hover:text-[#b5343e]">
                      {p.full_name}
                    </Link>
                    <span className="block text-xs font-mono text-[#9b6e6e]">{p.patient_code}</span>
                    {p.mobile_number && (
                      <span className="block text-xs text-[#7a5252]">{p.mobile_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#7a5252]">
                    {p.age} y/o &middot; {p.sex.charAt(0).toUpperCase() + p.sex.slice(1)}
                    {p.is_senior && (
                      <span className="ml-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[0.625rem] font-semibold text-violet-700">
                        Sr
                      </span>
                    )}
                    {p.is_pwd && (
                      <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-[0.625rem] font-semibold text-sky-700">
                        PWD
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#7a5252] whitespace-nowrap">
                    {new Date(p.archived_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}
                  </td>
                  <td className="px-4 py-3 text-[#7a5252] text-xs">{p.archived_by ?? "—"}</td>
                  <td className="max-w-[200px] px-4 py-3 text-xs text-[#7a5252] truncate" title={p.archive_reason ?? undefined}>
                    {p.archive_reason ?? <span className="italic text-[#d4b0b0]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setUnarchiveTarget(p)}
                        className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 text-xs font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                      >
                        Unarchive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-between items-center text-sm text-slate-500">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 disabled:opacity-40 hover:bg-[#fdf5f0]"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 disabled:opacity-40 hover:bg-[#fdf5f0]"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Unarchive modal */}
      {unarchiveTarget && (
        <UnarchiveModal
          patient={unarchiveTarget}
          onConfirm={() => void handleUnarchive()}
          onCancel={() => setUnarchiveTarget(null)}
          loading={unarchiving}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
