"use client";

/**
 * Appointments list page — Phase 4.
 *
 * Features:
 *  - Paginated table of appointments with status/date/patient filters
 *  - Inline "New Appointment" dialog (links to /appointments/new)
 *  - Status badge color coding
 *  - Cancel action with optimistic refetch
 *
 * All data via useAppointmentList / useCancelAppointment hooks.
 */

import { useState } from "react";
import Link from "next/link";
import {
  useAppointmentList,
  useCancelAppointment,
} from "@/hooks/useAppointments";
import type {
  AppointmentStatus,
  AppointmentListParams,
} from "@/types/appointment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  missed: "Missed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const APPT_TYPE_LABELS: Record<string, string> = {
  checkup: "Check-up",
  prenatal: "Prenatal",
  follow_up: "Follow-up",
  vaccination: "Vaccination",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AppointmentsPage() {
  const [filters, setFilters] = useState<AppointmentListParams>({
    page: 1,
    pageSize: 15,
  });
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [patientSearch, setPatientSearch] = useState("");

  const effectiveFilters: AppointmentListParams = {
    ...filters,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
  };

  const { data, loading, error, refetch } = useAppointmentList(effectiveFilters);
  const { cancelAppointment, loading: cancelling } = useCancelAppointment();

  function applyFilters() {
    setFilters((f) => ({ ...f, page: 1 }));
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this appointment?")) return;
    await cancelAppointment(id);
    refetch();
  }

  // Simple client-side patient name filter over the current page
  const rows =
    patientSearch.trim()
      ? (data?.items ?? []).filter((a) =>
          (a.patientName ?? "")
            .toLowerCase()
            .includes(patientSearch.toLowerCase())
        )
      : (data?.items ?? []);

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize ?? 15)) : 1;

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Schedule and manage patient appointments
          </p>
        </div>
        <Link
          href="/appointments/new"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Appointment
        </Link>
      </div>

      {/* Filter bar */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          {/* Patient name search */}
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="appt-patient" className="mb-1 block text-xs font-medium text-slate-600">
              Patient name
            </label>
            <input
              id="appt-patient"
              type="text"
              placeholder="Search patient name…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Status filter */}
          <div className="min-w-[140px]">
            <label htmlFor="appt-status" className="mb-1 block text-xs font-medium text-slate-600">
              Status
            </label>
            <select
              id="appt-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div className="min-w-[140px]">
            <label htmlFor="appt-from" className="mb-1 block text-xs font-medium text-slate-600">
              From date
            </label>
            <input
              id="appt-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Date to */}
          <div className="min-w-[140px]">
            <label htmlFor="appt-to" className="mb-1 block text-xs font-medium text-slate-600">
              To date
            </label>
            <input
              id="appt-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Apply */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={applyFilters}
              className="min-h-[44px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load appointments: {error.message}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Appointments table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Code</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Type</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Scheduled At</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                // Loading skeleton rows
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No appointments found.
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((appt) => (
                  <tr
                    key={appt.id}
                    className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {appt.patientName ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {appt.patientCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {APPT_TYPE_LABELS[appt.appointmentType] ?? appt.appointmentType}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTime(appt.scheduledAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[appt.status]}`}
                      >
                        {STATUS_LABELS[appt.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/appointments/${appt.id}`}
                          className="text-teal-600 hover:text-teal-800 focus-visible:outline focus-visible:outline-1"
                          aria-label={`View appointment for ${appt.patientName ?? "patient"}`}
                        >
                          View
                        </Link>
                        {appt.status !== "cancelled" &&
                          appt.status !== "completed" && (
                            <button
                              type="button"
                              onClick={() => void handleCancel(appt.id)}
                              disabled={cancelling}
                              className="text-red-600 hover:text-red-800 focus-visible:outline focus-visible:outline-1 disabled:opacity-50"
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
        {data && data.total > (filters.pageSize ?? 15) && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              Showing {((filters.page ?? 1) - 1) * (filters.pageSize ?? 15) + 1}–
              {Math.min((filters.page ?? 1) * (filters.pageSize ?? 15), data.total)} of{" "}
              {data.total} appointments
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40"
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="flex items-center text-xs text-slate-500">
                Page {filters.page ?? 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={(filters.page ?? 1) >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
