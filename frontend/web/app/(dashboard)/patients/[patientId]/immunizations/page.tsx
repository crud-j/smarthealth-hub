"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Immunization {
  id: string; patientId: string; vaccineName: string; doseNumber: number;
  dateAdministered: string | null; administeredBy: string | null; batchNumber: string | null;
  nextDueDate: string | null; notes: string | null;
  status: "scheduled" | "completed" | "missed" | "cancelled";
  createdAt: string; updatedAt: string;
}

interface ImmunizationListResponse { items: Immunization[]; total: number; page: number; page_size: number; }

interface ApiImmunizationRaw {
  id: string; patient_id: string; vaccine_name: string; dose_number: number;
  date_administered: string | null; administered_by: string | null; batch_number: string | null;
  next_due_date: string | null; notes: string | null;
  status: "scheduled" | "completed" | "missed" | "cancelled";
  created_at: string; updated_at: string;
}

interface FormState {
  vaccineName: string; doseNumber: string; dateAdministered: string;
  batchNumber: string; nextDueDate: string; notes: string; status: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function toCamel(raw: ApiImmunizationRaw): Immunization {
  return {
    id: raw.id, patientId: raw.patient_id, vaccineName: raw.vaccine_name,
    doseNumber: raw.dose_number, dateAdministered: raw.date_administered,
    administeredBy: raw.administered_by, batchNumber: raw.batch_number,
    nextDueDate: raw.next_due_date, notes: raw.notes, status: raw.status,
    createdAt: raw.created_at, updatedAt: raw.updated_at,
  };
}

async function fetchImmunizations(patientId: string, page: number): Promise<ImmunizationListResponse> {
  const res = await fetch(`${API_BASE}/patients/${patientId}/immunizations?page=${page}&page_size=20`, { credentials: "include" });
  if (!res.ok) { const body = (await res.json().catch(() => ({}))) as { detail?: string }; throw new Error(body.detail ?? `Failed to load immunizations (${res.status})`); }
  const data = (await res.json()) as { items: ApiImmunizationRaw[]; total: number; page: number; page_size: number; };
  return { items: data.items.map(toCamel), total: data.total, page: data.page, page_size: data.page_size };
}

async function apiCreateImmunization(patientId: string, form: FormState): Promise<Immunization> {
  const body = { vaccine_name: form.vaccineName.trim(), dose_number: parseInt(form.doseNumber, 10) || 1, date_administered: form.dateAdministered || null, batch_number: form.batchNumber.trim() || null, next_due_date: form.nextDueDate || null, notes: form.notes.trim() || null, status: form.status };
  const res = await fetch(`${API_BASE}/patients/${patientId}/immunizations`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const data = (await res.json().catch(() => ({}))) as { detail?: string }; throw new Error(data.detail ?? `Create failed (${res.status})`); }
  return toCamel((await res.json()) as ApiImmunizationRaw);
}

async function apiUpdateImmunization(patientId: string, immunizationId: string, form: FormState): Promise<Immunization> {
  const body: Record<string, string | number | null> = {};
  if (form.vaccineName.trim()) body.vaccine_name = form.vaccineName.trim();
  if (form.doseNumber) body.dose_number = parseInt(form.doseNumber, 10);
  if (form.dateAdministered) body.date_administered = form.dateAdministered;
  if (form.batchNumber.trim()) body.batch_number = form.batchNumber.trim();
  if (form.nextDueDate) body.next_due_date = form.nextDueDate;
  body.notes = form.notes.trim() || null;
  if (form.status) body.status = form.status;
  const res = await fetch(`${API_BASE}/patients/${patientId}/immunizations/${immunizationId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const data = (await res.json().catch(() => ({}))) as { detail?: string }; throw new Error(data.detail ?? `Update failed (${res.status})`); }
  return toCamel((await res.json()) as ApiImmunizationRaw);
}

async function apiDeleteImmunization(patientId: string, immunizationId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/patients/${patientId}/immunizations/${immunizationId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok && res.status !== 204) { const data = (await res.json().catch(() => ({}))) as { detail?: string }; throw new Error(data.detail ?? `Delete failed (${res.status})`); }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 border border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  missed: "bg-orange-100 text-orange-700 border border-orange-200",
  cancelled: "bg-stone-100 text-stone-500 border border-stone-200",
};

const EMPTY_FORM: FormState = { vaccineName: "", doseNumber: "1", dateAdministered: "", batchNumber: "", nextDueDate: "", notes: "", status: "scheduled" };

// ---------------------------------------------------------------------------
// Inline form
// ---------------------------------------------------------------------------

const inputCls = "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]";

function ImmunizationForm({ initial, onSubmit, onCancel, submitLabel, submitting }: { initial: FormState; onSubmit: (f: FormState) => void; onCancel: () => void; submitLabel: string; submitting: boolean; }) {
  const [form, setForm] = useState<FormState>(initial);
  function set(field: keyof FormState, value: string) { setForm((prev) => ({ ...prev, [field]: value })); }
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="rounded-xl border border-[#e5d4cc] bg-[#fdf7f3] p-5 mb-4">
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="vaccine_name">Vaccine Name *</label>
          <input suppressHydrationWarning id="vaccine_name" className={inputCls} required value={form.vaccineName} onChange={(e) => set("vaccineName", e.target.value)} placeholder="e.g. BCG, Hepatitis B" maxLength={100} />
        </div>
        <div>
          <label className={labelCls} htmlFor="dose_number">Dose No.</label>
          <input suppressHydrationWarning id="dose_number" type="number" min={1} className={inputCls} value={form.doseNumber} onChange={(e) => set("doseNumber", e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="status">Status</label>
          <select id="status" className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="missed">Missed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="date_administered">Date Administered</label>
          <input suppressHydrationWarning id="date_administered" type="date" className={inputCls} value={form.dateAdministered} onChange={(e) => set("dateAdministered", e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="batch_number">Batch / Lot No.</label>
          <input suppressHydrationWarning id="batch_number" className={inputCls} value={form.batchNumber} onChange={(e) => set("batchNumber", e.target.value)} placeholder="Optional" maxLength={50} />
        </div>
        <div>
          <label className={labelCls} htmlFor="next_due_date">Next Due Date</label>
          <input suppressHydrationWarning id="next_due_date" type="date" className={inputCls} value={form.nextDueDate} onChange={(e) => set("nextDueDate", e.target.value)} />
        </div>
      </div>
      <div className="mb-4">
        <label className={labelCls} htmlFor="notes">Notes</label>
        <textarea id="notes" rows={2} className={`${inputCls} resize-y`} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional clinical notes" />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={submitting}
          className="rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          style={{ background: submitting ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}>
          {submitting ? "Saving..." : submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-[#e5d4cc] bg-white px-5 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastState { message: string; kind: "success" | "error"; }

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => { const t = window.setTimeout(onDismiss, 4000); return () => window.clearTimeout(t); }, [onDismiss]);
  return (
    <div role="status" aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-xs rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${toast.kind === "success" ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}>
      {toast.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function PatientImmunizationsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = React.use(params);
  const { user: currentUser } = useCurrentUser();

  const [records, setRecords] = useState<Immunization[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const canDelete = currentUser?.role === "physician" || currentUser?.role === "admin";
  const canWrite = !!currentUser;

  const load = useCallback(async (p: number) => {
    setLoading(true); setFetchError(null);
    try {
      const data = await fetchImmunizations(patientId, p);
      setRecords(data.items); setTotal(data.total); setPage(p);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load.");
    } finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { void load(1); }, [load]);

  async function handleAdd(form: FormState) {
    setAddSubmitting(true);
    try {
      const rec = await apiCreateImmunization(patientId, form);
      setRecords((prev) => [rec, ...prev]); setTotal((t) => t + 1);
      setShowAddForm(false); setToast({ message: "Immunization record added.", kind: "success" });
    } catch (err: unknown) { setToast({ message: err instanceof Error ? err.message : "Failed to add.", kind: "error" }); }
    finally { setAddSubmitting(false); }
  }

  async function handleEdit(immunizationId: string, form: FormState) {
    setEditSubmitting(true);
    try {
      const rec = await apiUpdateImmunization(patientId, immunizationId, form);
      setRecords((prev) => prev.map((r) => (r.id === immunizationId ? rec : r)));
      setEditingId(null); setToast({ message: "Record updated.", kind: "success" });
    } catch (err: unknown) { setToast({ message: err instanceof Error ? err.message : "Failed to update.", kind: "error" }); }
    finally { setEditSubmitting(false); }
  }

  async function handleDelete(immunizationId: string, vaccineName: string) {
    if (!window.confirm(`Delete the "${vaccineName}" immunization record? This action cannot be undone.`)) return;
    setDeletingId(immunizationId);
    try {
      await apiDeleteImmunization(patientId, immunizationId);
      setRecords((prev) => prev.filter((r) => r.id !== immunizationId));
      setTotal((t) => Math.max(0, t - 1));
      setToast({ message: "Record deleted.", kind: "success" });
    } catch (err: unknown) { setToast({ message: err instanceof Error ? err.message : "Failed to delete.", kind: "error" }); }
    finally { setDeletingId(null); }
  }

  function editInitial(r: Immunization): FormState {
    return { vaccineName: r.vaccineName, doseNumber: String(r.doseNumber), dateAdministered: r.dateAdministered?.slice(0, 10) ?? "", batchNumber: r.batchNumber ?? "", nextDueDate: r.nextDueDate?.slice(0, 10) ?? "", notes: r.notes ?? "", status: r.status };
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="mx-auto max-w-[1080px]">
      {/* Page header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Immunization Records</h1>
          <p className="mt-1 text-sm font-medium text-[#9b6e6e]">{total} record{total !== 1 ? "s" : ""}</p>
        </div>
        {canWrite && !showAddForm && (
          <button type="button" onClick={() => { setShowAddForm(true); setEditingId(null); }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Immunization
          </button>
        )}
      </div>

      {showAddForm && (
        <ImmunizationForm initial={EMPTY_FORM} onSubmit={(f) => void handleAdd(f)} onCancel={() => setShowAddForm(false)} submitLabel="Add Record" submitting={addSubmitting} />
      )}

      {fetchError && (
        <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] p-4 text-sm font-medium text-[#b91c1c]">{fetchError}</div>
      )}

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Immunization records">
            <thead>
              <tr className="border-b-2 border-[#e5d4cc]" style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}>
                {["Vaccine", "Dose", "Status", "Date Administered", "Batch / Lot", "Next Due", "Notes", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#9b6e6e] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f0e4dd]">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-[#e8d5cc]" /></td>
                  ))}
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 text-[#c08080]">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M18 2l4 4" /><path d="m17 7 3-3" /><path d="M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5" /><path d="m9 11 4 4" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#9b6e6e]">No immunization records found.</p>
                      <p className="mt-1 text-xs text-[#c08080]">Add the first immunization record above.</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && records.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className={`border-b border-[#f0e4dd] hover:bg-[#fdf5f0] transition-colors duration-150 ${editingId === r.id ? "bg-[#fdf7f3]" : "bg-white"}`}>
                    <td className="px-4 py-3 text-sm font-semibold text-[#1a0808]">{r.vaccineName}</td>
                    <td className="px-4 py-3 text-sm text-[#7a5252]">{r.doseNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[r.status] ?? STATUS_BADGE.scheduled}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#7a5252] whitespace-nowrap">{formatDate(r.dateAdministered)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#7a5252]">
                      {r.batchNumber ?? <span className="italic text-[#d4b0b0]">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-sm whitespace-nowrap ${r.nextDueDate && new Date(r.nextDueDate) < new Date() ? "text-[#dc2626]" : "text-[#7a5252]"}`}>
                      {formatDate(r.nextDueDate)}
                    </td>
                    <td className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-sm text-[#7a5252]" title={r.notes ?? undefined}>
                      {r.notes ?? <span className="italic text-[#d4b0b0]">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {canWrite && (
                          <button type="button" onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                            className="rounded border border-[#e5d4cc] bg-white px-2.5 py-1 text-xs font-medium text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
                            {editingId === r.id ? "Close" : "Edit"}
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" disabled={deletingId === r.id} onClick={() => void handleDelete(r.id, r.vaccineName)}
                            className="rounded border border-[#fca5a5] bg-[#fef2f2] px-2.5 py-1 text-xs font-medium text-[#dc2626] hover:bg-[#fee2e2] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dc2626]">
                            {deletingId === r.id ? "Deleting..." : "Delete"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr>
                      <td colSpan={8} className="bg-[#fdf7f3] p-3">
                        <ImmunizationForm initial={editInitial(r)} onSubmit={(f) => void handleEdit(r.id, f)} onCancel={() => setEditingId(null)} submitLabel="Save Changes" submitting={editSubmitting} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-[#e5d4cc] px-5 py-3">
            <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)}
              className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
              Prev
            </button>
            <span className="text-sm text-[#9b6e6e]">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)}
              className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
              Next
            </button>
          </div>
        )}
      </div>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
