"use client";
/**
 * Inactive Patients page.
 * URL: /patients/inactive
 * Auth: Admin / Physician can look (GET /patients/inactive); only Admin can
 * reactivate (POST /patients/{id}/reactivate).
 *
 * Where deactivated patients go. Deactivating switches a patient off for now
 * (hidden from the list and search, no SMS); nothing is deleted, and this page
 * switches them back on. Archived records live on the Patient Archive page.
 */

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/hooks/useAuth";

interface InactivePatientRow {
  id: string;
  patient_code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  age: number;
  sex: string;
  mobile_number: string | null;
  archived_at: string | null;
  deactivated_at: string | null;
  deactivated_by_name: string | null;
  deactivation_reason: string | null;
}

interface PaginatedInactivePatients {
  items: InactivePatientRow[];
  total: number;
  page: number;
  page_size: number;
}

interface LoadResult {
  key: string;
  data?: PaginatedInactivePatients;
  error?: string;
}

const PAGE_SIZE = 20;

function displayName(p: InactivePatientRow): string {
  return p.full_name || [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ");
}

function ReactivateDialog({
  patient,
  onConfirm,
  onCancel,
  loading,
}: {
  patient: InactivePatientRow;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const titleId = useId();
  const name = displayName(patient);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-[#eadbd3] bg-white p-6 shadow-2xl"
      >
        <h2 id={titleId} className="mb-2 text-xl text-[#2a1414] font-display">
          Reactivate {name}?
        </h2>
        <p className="text-sm text-[#5a3a3a]">
          <strong>{name}</strong> ({patient.patient_code}) will be back in the patient list and search, and will get
          SMS reminders again.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-[#b5343e] px-5 py-2 text-sm font-bold text-white hover:bg-[#9c2a33] disabled:opacity-60"
          >
            {loading ? "Reactivating..." : "Yes, reactivate"}
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

export default function InactivePatientsPage() {
  const { user } = useCurrentUser();
  const role = user?.role;
  const canView = role === "admin" || role === "physician";
  const canReactivate = role === "admin";

  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [target, setTarget] = useState<InactivePatientRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (q.trim()) params.set("q", q.trim());
  const query = params.toString();
  const key = `${query}#${reload}`;

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    apiFetch<PaginatedInactivePatients>(`/patients/inactive?${query}`).then(
      (data) => {
        if (!cancelled) setResult({ key: `${query}#${reload}`, data });
      },
      (err: unknown) => {
        if (!cancelled) {
          setResult({
            key: `${query}#${reload}`,
            error: err instanceof ApiError ? err.message : "Failed to load inactive patients.",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canView, query, reload]);

  async function handleReactivate() {
    if (!target) return;
    const name = displayName(target);
    setSaving(true);
    try {
      await apiFetch(`/patients/${target.id}/reactivate`, { method: "POST" });
      setTarget(null);
      setNotice({ text: `${name} is active again.`, ok: true });
      setReload((n) => n + 1);
    } catch (err) {
      setTarget(null);
      setNotice({ text: err instanceof ApiError ? err.message : "Could not reactivate the patient.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <div className="p-8 text-center text-sm text-[#8a6a6a]">Loading...</div>;
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Only Admins and Physicians can view inactive patients.
        </div>
      </div>
    );
  }

  const loading = result?.key !== key;
  const patients = result?.data?.items ?? [];
  const total = result?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-5">
        <div className="mb-1 flex items-center gap-2 text-sm">
          <Link href="/patients" className="font-medium text-[#b5343e] hover:underline">
            &larr; Patients
          </Link>
          <span className="text-[#d4b0b0]">/</span>
          <span className="text-[#8a6a6a]">Inactive</span>
        </div>
        <h1 className="text-3xl text-[#2a1414] font-display">Inactive Patients</h1>
      </header>

      <div className="mb-5 grid gap-3 rounded-2xl border border-[#eadbd3] bg-[#fdf7f3] p-4 text-sm text-[#5a3a3a] sm:grid-cols-2">
        <p>
          <strong className="text-[#2a1414]">Deactivated</strong> patients are switched off for now: hidden from the
          patient list and search, and they get no SMS reminders. Nothing is deleted.
          {canReactivate ? " Reactivate switches them back on." : ""}
        </p>
        <p>
          <strong className="text-[#2a1414]">Archived</strong> patients are old records stored away (moved, transferred,
          duplicate). They are on the{" "}
          <Link href="/patients/archived" className="font-semibold text-[#b5343e] underline">
            Patient Archive
          </Link>
          .
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search inactive patients"
          placeholder="Search by name, patient code, or mobile..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-lg border border-[#e5d4cc] px-3 py-2 text-sm text-[#1a0808] placeholder-[#b09090] focus:outline-none focus:ring-2 focus:ring-[#b5343e] sm:w-80"
        />
        <span className="text-sm text-[#8a6a6a]">
          {total} inactive patient{total !== 1 ? "s" : ""}
        </span>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            notice.ok ? "border-teal-200 bg-teal-50 text-teal-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {result?.error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#eadbd3] bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#8a6a6a]">Loading inactive patients...</div>
        ) : patients.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#8a6a6a]">No inactive patients.</div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-[#f1e6e0] bg-[#fdf0eb]">
              <tr>
                {["Patient", "Deactivated", "By", "Reason", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#8a6a6a]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => {
                const name = displayName(p);
                return (
                  <tr key={p.id} className="border-b border-[#f1e6e0] last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/patients/${p.id}`} className="font-semibold text-[#2a1414] hover:text-[#b5343e]">
                        {name}
                      </Link>
                      <span className="block font-mono text-xs text-[#8a6a6a]">{p.patient_code}</span>
                      {p.archived_at && (
                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-semibold text-amber-800">
                          Also archived
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#5a3a3a]">
                      {p.deactivated_at ? (
                        new Date(p.deactivated_at).toLocaleDateString("en-PH", { dateStyle: "medium" })
                      ) : (
                        <span className="italic text-[#b09090]">Not recorded</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#5a3a3a]">{p.deactivated_by_name ?? "—"}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-xs text-[#5a3a3a]" title={p.deactivation_reason ?? undefined}>
                      {p.deactivation_reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canReactivate && (
                        <button
                          type="button"
                          aria-label={`Reactivate ${name}`}
                          onClick={() => setTarget(p)}
                          className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 text-xs font-bold text-[#b5343e] hover:bg-[#fdf5f0]"
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-[#8a6a6a]">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
              className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 hover:bg-[#fdf5f0] disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
              className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 hover:bg-[#fdf5f0] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {target && (
        <ReactivateDialog
          patient={target}
          onConfirm={() => void handleReactivate()}
          onCancel={() => setTarget(null)}
          loading={saving}
        />
      )}
    </main>
  );
}
