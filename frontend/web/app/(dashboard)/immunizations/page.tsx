"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useImmunizationList, useImmunizationDueSummary, useImmunizationStats,
  useCreateImmunization, useUpdateImmunization, useDeleteImmunization,
  type Immunization, type ImmunizationListParams,
  type ImmunizationCreatePayload, type ImmunizationUpdatePayload,
} from "@/hooks/useImmunizations";
import { usePatientList } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import { toast } from "@/lib/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VACCINE_NAMES = ["BCG", "Hepatitis B", "OPV", "DPT-HepB-Hib", "MMR", "Flu", "COVID-19", "Tetanus", "Others"] as const;

type DueFilter = "due_this_week" | "due_this_month" | "overdue" | "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusBadge(imm: Immunization): { label: string; cls: string } {
  if (imm.status === "completed") return { label: "Completed", cls: "bg-green-50 text-green-800 ring-green-600/20" };
  if (imm.status === "missed")    return { label: "Missed",    cls: "bg-red-50 text-red-800 ring-red-600/20" };
  if (imm.status === "cancelled") return { label: "Cancelled", cls: "bg-slate-50 text-slate-500 ring-slate-500/20" };
  if (!imm.nextDueDate)           return { label: "Scheduled", cls: "bg-blue-50 text-blue-800 ring-blue-600/20" };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(imm.nextDueDate); due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0)  return { label: "Overdue",   cls: "bg-red-50 text-red-800 ring-red-600/20" };
  if (diffDays <= 7) return { label: "Due Soon",  cls: "bg-yellow-50 text-yellow-800 ring-yellow-600/20" };
  return                       { label: "Scheduled", cls: "bg-blue-50 text-blue-800 ring-blue-600/20" };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function todayIso(): string { return new Date().toISOString().slice(0, 10); }

function StatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat Cards
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number | string;
  variant?: "default" | "warning" | "danger" | "success";
  href?: string;
}

function StatCard({ label, value, variant = "default", href }: StatCardProps) {
  const variantCls = {
    default: "bg-white border-slate-200 text-slate-900",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-900",
    danger:  "bg-red-50 border-red-200 text-red-900",
    success: "bg-green-50 border-green-200 text-green-900",
  }[variant];

  const labelCls = {
    default: "text-slate-500",
    warning: "text-yellow-700",
    danger:  "text-red-700",
    success: "text-green-700",
  }[variant];

  const inner = (
    <>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className={`mt-1 text-xs font-medium ${labelCls}`}>{label}</p>
    </>
  );

  const base = `flex min-w-0 flex-1 flex-col rounded-xl border p-5 shadow-sm transition-all ${variantCls}`;

  if (href) {
    return <Link href={href} className={`${base} hover:shadow-md`}>{inner}</Link>;
  }
  return <div className={base}>{inner}</div>;
}

// ---------------------------------------------------------------------------
// Immunization Modal
// ---------------------------------------------------------------------------

interface ImmunizationModalProps {
  mode: "add" | "edit";
  initial?: Immunization | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500";
const labelCls = "mb-1.5 block text-xs font-medium text-slate-500";

function ImmunizationModal({ mode, initial, onClose, onSaved }: ImmunizationModalProps) {
  const [patientSearch, setPatientSearch]       = useState("");
  const [selectedPatientId, setSelectedPatientId]     = useState<string>(initial?.patientId ?? "");
  const [selectedPatientName, setSelectedPatientName] = useState<string>(initial?.patientName ?? "");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  const { data: patientResults, loading: patientSearchLoading } = usePatientList(
    patientSearch.trim().length >= 2 ? { q: patientSearch, pageSize: 8 } : {}
  );

  const [vaccineName, setVaccineName]           = useState(initial?.vaccineName ?? "");
  const [doseNumber, setDoseNumber]             = useState<number>(initial?.doseNumber ?? 1);
  const [dateAdministered, setDateAdministered] = useState<string>(initial?.dateAdministered ?? todayIso());
  const [nextDueDate, setNextDueDate]           = useState<string>(initial?.nextDueDate ?? "");
  const [batchNumber, setBatchNumber]           = useState(initial?.batchNumber ?? "");
  const [notes, setNotes]                       = useState(initial?.notes ?? "");
  const [status, setStatus]                     = useState(initial?.status ?? "scheduled");
  const [submitting, setSubmitting]             = useState(false);
  const [fieldError, setFieldError]             = useState<string | null>(null);

  const { createImmunization } = useCreateImmunization();
  const { updateImmunization } = useUpdateImmunization();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFieldError(null);
    if (mode === "add" && !selectedPatientId) { setFieldError("Please select a patient."); return; }
    if (!vaccineName) { setFieldError("Please select a vaccine name."); return; }
    if (doseNumber < 1) { setFieldError("Dose number must be at least 1."); return; }
    setSubmitting(true);
    try {
      const payload: ImmunizationCreatePayload & ImmunizationUpdatePayload = {
        vaccine_name: vaccineName, dose_number: doseNumber,
        date_administered: dateAdministered || null, next_due_date: nextDueDate || null,
        batch_number: batchNumber || null, notes: notes || null, status,
      };
      if (mode === "add") {
        const result = await createImmunization(selectedPatientId, payload);
        if (result) { toast.success("Immunization record added successfully."); onSaved(); onClose(); }
        else { setFieldError("Failed to add immunization record. Please try again."); }
      } else if (initial) {
        const result = await updateImmunization(initial.patientId, initial.id, payload);
        if (result) { toast.success("Immunization record updated successfully."); onSaved(); onClose(); }
        else { setFieldError("Failed to update immunization record. Please try again."); }
      }
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "add" ? "Add Immunization Record" : "Edit Immunization Record"}
        className="relative z-10 w-full max-w-[560px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
        style={{ maxHeight: "90vh" }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === "add" ? "Add Immunization Record" : "Edit Immunization Record"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">

          {/* Patient selector */}
          {mode === "add" && (
            <div className="relative">
              <label className={labelCls} htmlFor="modal-patient-search">Patient *</label>
              {selectedPatientId ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm">
                  <span className="font-medium text-rose-900">{selectedPatientName}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedPatientId(""); setSelectedPatientName(""); setPatientSearch(""); }}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 focus-visible:outline-none focus-visible:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id="modal-patient-search"
                    type="text"
                    placeholder="Type at least 2 characters to search…"
                    value={patientSearch}
                    onChange={(e) => { setPatientSearch(e.target.value); setShowPatientDropdown(true); }}
                    onFocus={() => setShowPatientDropdown(true)}
                    className={inputCls}
                    autoComplete="off"
                  />
                  {showPatientDropdown && patientSearch.trim().length >= 2 && (
                    <ul className="absolute top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {patientSearchLoading && (
                        <li className="px-4 py-3 text-sm text-slate-500">Searching…</li>
                      )}
                      {!patientSearchLoading && (patientResults?.items ?? []).length === 0 && (
                        <li className="px-4 py-3 text-sm text-slate-500">No patients found.</li>
                      )}
                      {(patientResults?.items ?? []).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => { setSelectedPatientId(p.id); setSelectedPatientName(p.fullName); setPatientSearch(""); setShowPatientDropdown(false); }}
                            className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                          >
                            <span className="text-sm font-medium text-slate-900">{p.fullName}</span>
                            <span className="font-mono text-xs text-slate-500">{p.patientCode}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {/* Vaccine */}
          <div>
            <label className={labelCls} htmlFor="modal-vaccine-name">Vaccine Name *</label>
            <select id="modal-vaccine-name" value={vaccineName} onChange={(e) => setVaccineName(e.target.value)} className={inputCls} required>
              <option value="">Select vaccine…</option>
              {VACCINE_NAMES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Dose + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="modal-dose-number">Dose Number *</label>
              <input id="modal-dose-number" type="number" min={1} max={10} value={doseNumber} onChange={(e) => setDoseNumber(Number(e.target.value))} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls} htmlFor="modal-status">Status</label>
              <select id="modal-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="modal-date-administered">Date Administered</label>
              <input id="modal-date-administered" type="date" value={dateAdministered} onChange={(e) => setDateAdministered(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="modal-next-due-date">Next Due Date</label>
              <input id="modal-next-due-date" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Batch */}
          <div>
            <label className={labelCls} htmlFor="modal-batch-number">Batch / Lot Number</label>
            <input id="modal-batch-number" type="text" placeholder="Optional" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={inputCls} maxLength={50} />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls} htmlFor="modal-notes">Notes</label>
            <textarea id="modal-notes" placeholder="Optional clinical notes…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-y`} />
          </div>

          {/* Field error */}
          {fieldError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {fieldError}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-50 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-100 hover:bg-rose-700 disabled:opacity-60 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              {submitting ? "Saving…" : mode === "add" ? "Add Record" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Due Soon Panel (sidebar)
// ---------------------------------------------------------------------------

function DueSoonPanel({ onViewAll }: { onViewAll: () => void }) {
  const { data, loading } = useImmunizationList({ dueFilter: "due_this_week", pageSize: 5 });
  const items = data?.items ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Due Within 7 Days</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm font-medium text-rose-600 hover:text-rose-500 focus-visible:outline-none focus-visible:underline"
        >
          View all
        </button>
      </header>

      {loading && (
        <ul className="divide-y divide-slate-100">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex flex-col gap-2 px-5 py-4">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length === 0 && (
        <p role="status" className="px-5 py-8 text-center text-sm text-slate-500">
          No immunizations due within 7 days.
        </p>
      )}

      {!loading && items.length > 0 && (
        <ul role="list" className="divide-y divide-slate-100">
          {items.map((imm) => {
            const badge = getStatusBadge(imm);
            return (
              <li key={imm.id} className="px-5 py-4">
                <p className="text-sm font-medium text-slate-900">
                  {imm.vaccineName}
                  <span className="ml-1 font-normal text-slate-500">· Dose {imm.doseNumber}</span>
                </p>
                <Link
                  href={`/patients/${imm.patientId}`}
                  className="mt-0.5 block text-sm text-rose-600 hover:text-rose-500 focus-visible:outline-none focus-visible:underline"
                >
                  {imm.patientName ?? "Unknown patient"}
                </Link>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge label={badge.label} cls={badge.cls} />
                  <span className="text-xs text-slate-500">Due {formatDate(imm.nextDueDate)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quick Filters panel (sidebar)
// ---------------------------------------------------------------------------

const QUICK_FILTER_OPTIONS: { label: string; value: DueFilter; activeCls: string }[] = [
  { label: "Overdue",        value: "overdue",        activeCls: "border-red-300 bg-red-50 text-red-800 ring-1 ring-inset ring-red-300" },
  { label: "Due This Week",  value: "due_this_week",  activeCls: "border-yellow-300 bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-300" },
  { label: "Due This Month", value: "due_this_month", activeCls: "border-sky-300 bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-300" },
];

function QuickFiltersPanel({ dueFilter, onSelect, onClear }: { dueFilter: DueFilter; onSelect: (v: DueFilter) => void; onClear: () => void }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Quick Filters</h2>
      </header>
      <div className="flex flex-col gap-2 p-4">
        {QUICK_FILTER_OPTIONS.map(({ label, value, activeCls }) => (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500 ${
              dueFilter === value
                ? activeCls
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
        {dueFilter && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
          >
            Show All Records
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Table skeleton / empty
// ---------------------------------------------------------------------------

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-4 animate-pulse rounded bg-slate-100" style={{ width: j === 0 ? "8rem" : j === 1 ? "5rem" : "4rem" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ImmunizationsPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite  = ["admin", "bhw", "physician"].includes(currentUser?.role ?? "");
  const canDelete = ["admin", "physician"].includes(currentUser?.role ?? "");

  const [vaccineName, setVaccineName] = useState<string>("");
  const [dueFilter, setDueFilter]     = useState<DueFilter>("");
  const [page, setPage]               = useState(1);
  const PAGE_SIZE = 15;

  const listParams: ImmunizationListParams = {
    vaccineName: vaccineName || undefined,
    dueFilter:   dueFilter   || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, loading, error, refetch }   = useImmunizationList(listParams);
  const { data: dueSummary }               = useImmunizationDueSummary();
  const { data: stats }                    = useImmunizationStats();
  const { deleteImmunization, loading: deleting } = useDeleteImmunization();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget]     = useState<Immunization | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Immunization | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  useEffect(() => {
    if (error) { toast.error(`Failed to load immunizations: ${error.message}`); }
  }, [error]);

  function applyFilters() { setPage(1); }
  function resetFilters() { setVaccineName(""); setDueFilter(""); setPage(1); }
  function viewDueThisWeek() { setDueFilter("due_this_week"); setPage(1); }
  function handleQuickFilter(v: DueFilter) { setDueFilter(v); setPage(1); }

  function handleDelete(imm: Immunization) {
    setDeleteTarget(imm);
  }

  async function confirmDeleteImmunization() {
    if (!deleteTarget) return;
    setDeleteInProgress(true);
    try {
      const ok = await deleteImmunization(deleteTarget.patientId, deleteTarget.id);
      if (ok) { toast.success("Immunization record deleted."); refetch(); }
      else { toast.error("Failed to delete the record. Please try again."); }
    } finally {
      setDeleteTarget(null);
      setDeleteInProgress(false);
    }
  }

  const totalPages     = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const totalRecords   = stats?.totalRecords   ?? 0;
  const distinctVaccines = stats?.distinctVaccines ?? 0;
  const dueThisWeek    = dueSummary?.dueThisWeek  ?? 0;
  const dueThisMonth   = dueSummary?.dueThisMonth ?? 0;

  return (
    <>
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Page header */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Immunization Records</h1>
          <p className="mt-2 text-sm text-slate-500">Track vaccination schedules and immunization records.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Immunization
          </button>
        )}
      </header>

      {/* Stat cards */}
      <section className="mb-8 flex flex-wrap gap-4" aria-label="Immunization statistics">
        <StatCard label="Total Immunizations" value={totalRecords.toLocaleString()} variant="default" />
        <StatCard label="Due This Week"        value={dueThisWeek.toLocaleString()}  variant="warning" />
        <StatCard label="Due This Month"       value={dueThisMonth.toLocaleString()} variant="warning" />
        <StatCard label="Vaccines Covered"     value={distinctVaccines.toLocaleString()} variant="success" />
      </section>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px] lg:items-start">

        {/* Left column: filters + table */}
        <div className="min-w-0 space-y-5">

          {/* Filter bar */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Filters">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">Filters</h2>
            </div>
            <div className="flex flex-wrap items-end gap-4 p-5">
              <div className="min-w-[160px] flex-1">
                <label htmlFor="filter-vaccine" className="mb-1.5 block text-xs font-medium text-slate-500">Vaccine</label>
                <select
                  id="filter-vaccine"
                  value={vaccineName}
                  onChange={(e) => setVaccineName(e.target.value)}
                  className={inputCls}
                >
                  <option value="">All Vaccines</option>
                  {VACCINE_NAMES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="min-w-[160px] flex-1">
                <label htmlFor="filter-due" className="mb-1.5 block text-xs font-medium text-slate-500">Due Status</label>
                <select
                  id="filter-due"
                  value={dueFilter}
                  onChange={(e) => setDueFilter(e.target.value as DueFilter)}
                  className={inputCls}
                >
                  <option value="">All Records</option>
                  <option value="due_this_week">Due This Week</option>
                  <option value="due_this_month">Due This Month</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyFilters}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-100 hover:bg-rose-700 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                >
                  Apply
                </button>
                {(vaccineName || dueFilter) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all duration-100 hover:bg-slate-50 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Table */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" aria-label="Immunization records">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {["Patient", "Vaccine", "Dose", "Date Given", "Next Due", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && <TableSkeleton cols={7} />}

                  {!loading && (data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 2l4 4" /><path d="m17 7 3-3" />
                              <path d="M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5" />
                              <path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-700">
                            {vaccineName || dueFilter ? "No records match the selected filters." : "No immunization records found."}
                          </p>
                          {canWrite && !vaccineName && !dueFilter && (
                            <button
                              type="button"
                              onClick={() => setShowAddModal(true)}
                              className="mt-3 text-sm font-medium text-rose-600 hover:text-rose-500 focus-visible:outline-none focus-visible:underline"
                            >
                              Add the first record
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && (data?.items ?? []).map((imm) => {
                    const badge = getStatusBadge(imm);
                    return (
                      <tr key={imm.id} className="transition-colors duration-100 hover:bg-slate-50">
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/patients/${imm.patientId}`}
                            className="text-sm font-medium text-rose-600 hover:text-rose-500 focus-visible:outline-none focus-visible:underline"
                          >
                            {imm.patientName ?? imm.patientId.slice(0, 8) + "…"}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">
                          {imm.vaccineName}
                        </td>
                        <td className="px-4 py-3.5 text-center text-sm text-slate-600">
                          {imm.doseNumber}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                          {formatDate(imm.dateAdministered)}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                          {formatDate(imm.nextDueDate)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge label={badge.label} cls={badge.cls} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-4">
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => setEditTarget(imm)}
                                className="text-sm font-medium text-sky-600 hover:text-sky-500 transition-colors focus-visible:outline-none focus-visible:underline"
                              >
                                Edit
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDelete(imm)}
                                disabled={deleting}
                                className="text-sm font-medium text-slate-500 hover:text-red-600 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:underline"
                              >
                                Delete
                              </button>
                            )}
                            <Link
                              href={`/patients/${imm.patientId}`}
                              className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:underline"
                            >
                              Patient
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total.toLocaleString()} records
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <span className="px-2 text-xs text-slate-500">Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-5">
          <DueSoonPanel onViewAll={viewDueThisWeek} />
          <QuickFiltersPanel dueFilter={dueFilter} onSelect={handleQuickFilter} onClear={resetFilters} />
        </aside>
      </div>

      {/* Modals */}
      {showAddModal && (
        <ImmunizationModal mode="add" onClose={() => setShowAddModal(false)} onSaved={() => { refetch(); }} />
      )}
      {editTarget && (
        <ImmunizationModal
          mode="edit"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { refetch(); setEditTarget(null); }}
        />
      )}

    </main>

    <AlertDialog
      open={deleteTarget !== null}
      title="Delete immunization record?"
      description={
        deleteTarget
          ? `This will permanently remove the ${deleteTarget.vaccineName} (Dose ${deleteTarget.doseNumber}) record.`
          : "This will permanently remove the immunization record."
      }
      confirmLabel="Yes, delete it"
      isDangerous
      loading={deleteInProgress}
      onConfirm={() => void confirmDeleteImmunization()}
      onCancel={() => setDeleteTarget(null)}
    />
    </>
  );
}
