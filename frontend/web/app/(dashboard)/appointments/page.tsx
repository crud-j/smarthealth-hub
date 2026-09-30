"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAppointmentList, useCancelAppointment } from "@/hooks/useAppointments";
import { toast } from "@/lib/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import type { AppointmentStatus, AppointmentListParams } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending", confirmed: "Confirmed", completed: "Completed", missed: "Missed", cancelled: "Cancelled",
};

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  pending:   "bg-yellow-50  text-yellow-800 ring-yellow-600/20",
  confirmed: "bg-green-50   text-green-800  ring-green-600/20",
  completed: "bg-slate-50   text-slate-700  ring-slate-500/20",
  missed:    "bg-red-50     text-red-800    ring-red-600/20",
  cancelled: "bg-slate-50   text-slate-500  ring-slate-500/20",
};

const APPT_TYPE_LABELS: Record<string, string> = {
  checkup: "Check-up", prenatal: "Prenatal", follow_up: "Follow-up", vaccination: "Vaccination",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-4 animate-pulse rounded bg-slate-100" style={{ width: j === 0 ? "9rem" : j === 3 ? "7rem" : "5rem" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={6}>
        <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">No appointments found</p>
          <p className="mt-1 text-xs text-slate-500">Try adjusting the filters or schedule a new appointment.</p>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AppointmentsPage() {
  const [filters, setFilters] = useState<AppointmentListParams>({ page: 1, pageSize: 15 });
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [patientSearch, setPatientSearch] = useState("");

  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelInProgress, setCancelInProgress] = useState(false);

  const effectiveFilters: AppointmentListParams = {
    ...filters,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
  };

  const { data, loading, error, refetch } = useAppointmentList(effectiveFilters);
  const { cancelAppointment, loading: cancelling } = useCancelAppointment();

  useEffect(() => {
    if (error) { toast.error(`Failed to load appointments: ${error.message}`); }
  }, [error]);

  function applyFilters() { setFilters((f) => ({ ...f, page: 1 })); }

  function handleCancel(id: string) {
    setCancelTargetId(id);
  }

  async function confirmCancel() {
    if (!cancelTargetId) return;
    setCancelInProgress(true);
    try {
      await cancelAppointment(cancelTargetId);
      refetch();
      setCancelTargetId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel appointment.");
    } finally {
      setCancelInProgress(false);
    }
  }

  const rows = patientSearch.trim()
    ? (data?.items ?? []).filter((a) => (a.patientName ?? "").toLowerCase().includes(patientSearch.toLowerCase()))
    : (data?.items ?? []);

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize ?? 15)) : 1;
  const currentPage = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 15;

  return (
    <>
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Page header */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Appointments</h1>
          <p className="mt-2 text-sm text-slate-500">Schedule and manage patient appointments.</p>
        </div>
        <Link
          href="/appointments/new"
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Appointment
        </Link>
      </header>

      {/* Filter bar */}
      <section
        className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-label="Appointment filters"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Filters</h2>
        </div>
        <div className="flex flex-wrap items-end gap-4 p-5">
          <div className="min-w-[180px] flex-1">
            <label htmlFor="appt-patient" className="mb-1.5 block text-xs font-medium text-slate-500">Patient name</label>
            <input
              id="appt-patient"
              type="text"
              placeholder="Search by patient name…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            />
          </div>
          <div className="min-w-[150px]">
            <label htmlFor="appt-status" className="mb-1.5 block text-xs font-medium text-slate-500">Status</label>
            <select
              id="appt-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label htmlFor="appt-from" className="mb-1.5 block text-xs font-medium text-slate-500">From date</label>
            <input
              id="appt-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            />
          </div>
          <div className="min-w-[150px]">
            <label htmlFor="appt-to" className="mb-1.5 block text-xs font-medium text-slate-500">To date</label>
            <input
              id="appt-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            />
          </div>
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          >
            Apply
          </button>
        </div>
      </section>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Appointments table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {["Patient", "Code", "Type", "Scheduled At", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <TableSkeleton />}

              {!loading && rows.length === 0 && <EmptyRow />}

              {!loading && rows.map((appt) => (
                <tr
                  key={appt.id}
                  className="transition-colors duration-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">
                    {appt.patientName ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                    {appt.patientCode ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">
                    {APPT_TYPE_LABELS[appt.appointmentType] ?? appt.appointmentType}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                    <time dateTime={appt.scheduledAt}>{formatDateTime(appt.scheduledAt)}</time>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={appt.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/appointments/${appt.id}`}
                        className="text-sm font-medium text-rose-600 hover:text-rose-500 transition-colors focus-visible:outline-none focus-visible:underline"
                        aria-label={`View appointment for ${appt.patientName ?? "patient"}`}
                      >
                        View
                      </Link>
                      {appt.status !== "cancelled" && appt.status !== "completed" && (
                        <button
                          type="button"
                          onClick={() => handleCancel(appt.id)}
                          disabled={cancelling}
                          className="text-sm font-medium text-slate-500 hover:text-red-600 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:underline"
                          aria-label={`Cancel appointment for ${appt.patientName ?? "patient"}`}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
            <p className="text-xs text-slate-500">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, data.total)} of {data.total.toLocaleString()} appointments
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="px-2 text-xs text-slate-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </main>

    <AlertDialog
      open={cancelTargetId !== null}
      title="Cancel appointment?"
      description="This appointment will be marked as cancelled and cannot be undone."
      confirmLabel="Yes, cancel it"
      isDangerous
      loading={cancelInProgress}
      onConfirm={() => void confirmCancel()}
      onCancel={() => setCancelTargetId(null)}
    />
    </>
  );
}
