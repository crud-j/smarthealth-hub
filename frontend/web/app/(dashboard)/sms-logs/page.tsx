"use client";

/**
 * SMS Logs page — Phase 4.
 *
 * Features:
 *  - Paginated table of SMS log entries with status + date filters
 *  - "Send Manual SMS" button → dialog with patient picker + message textarea
 *  - Status badge color coding
 *
 * Access: Admin and BHW roles only (enforced by backend RBAC + middleware).
 */

import { useState } from "react";
import { useSmsLogList, useSendManualSms } from "@/hooks/useSmsLogs";
import { usePatientList } from "@/hooks/usePatients";
import type { SmsStatus, SmsLogListParams } from "@/types/sms";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<SmsStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
  delivered: "Delivered",
};

const STATUS_COLORS: Record<SmsStatus, string> = {
  queued: "bg-amber-100 text-amber-700",
  sent: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
  delivered: "bg-green-100 text-green-700",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SmsLogsPage() {
  const [filters, setFilters] = useState<SmsLogListParams>({ page: 1, pageSize: 15 });
  const [statusFilter, setStatusFilter] = useState<SmsStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Manual SMS dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualPatientQuery, setManualPatientQuery] = useState("");
  const [manualPatientId, setManualPatientId] = useState("");
  const [manualPatientName, setManualPatientName] = useState("");
  const [showMPatientDropdown, setShowMPatientDropdown] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [sendError, setSendError] = useState("");

  const effectiveFilters: SmsLogListParams = {
    ...filters,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const { data, loading, error, refetch } = useSmsLogList(effectiveFilters);
  const { sendSms, loading: sending } = useSendManualSms();

  // Patient search for the manual SMS dialog
  const { data: patientData, loading: patientLoading } = usePatientList({
    q: manualPatientQuery.length >= 2 ? manualPatientQuery : undefined,
    pageSize: 6,
  });

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize ?? 15)) : 1;

  async function handleSendSms(e: React.FormEvent) {
    e.preventDefault();
    setSendSuccess("");
    setSendError("");

    if (!manualPatientId) {
      setSendError("Please select a patient.");
      return;
    }
    if (!manualMessage.trim()) {
      setSendError("Message cannot be empty.");
      return;
    }

    const result = await sendSms({ patientId: manualPatientId, message: manualMessage.trim() });
    if (result) {
      setSendSuccess("SMS queued successfully.");
      setManualMessage("");
      setManualPatientId("");
      setManualPatientName("");
      setManualPatientQuery("");
      refetch();
      setTimeout(() => {
        setDialogOpen(false);
        setSendSuccess("");
      }, 1500);
    } else {
      setSendError("Failed to send SMS. Please try again.");
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SMS Logs</h1>
          <p className="mt-0.5 text-sm text-slate-500">Delivery history and manual SMS dispatch</p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Send Manual SMS
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[140px]">
            <label htmlFor="sms-status" className="mb-1 block text-xs font-medium text-slate-600">Status</label>
            <select
              id="sms-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SmsStatus | "")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABELS) as SmsStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="sms-from" className="mb-1 block text-xs font-medium text-slate-600">From date</label>
            <input id="sms-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="sms-to" className="mb-1 block text-xs font-medium text-slate-600">To date</label>
            <input id="sms-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => setFilters((f) => ({ ...f, page: 1 }))}
              className="min-h-[44px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Failed to load SMS logs: {error.message}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="SMS logs table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Mobile</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Message</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-slate-200" />
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && (data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No SMS logs found.
                  </td>
                </tr>
              )}

              {!loading && (data?.items ?? []).map((log) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{log.patientName ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{log.mobileNumber}</td>
                  <td className="px-4 py-3 text-slate-700" title={log.message}>
                    {truncate(log.message)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[log.status]}`}>
                      {STATUS_LABELS[log.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(log.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > (filters.pageSize ?? 15) && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              {data.total} total records
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40" aria-label="Previous page">
                Previous
              </button>
              <span className="flex items-center text-xs text-slate-500">
                Page {filters.page ?? 1} of {totalPages}
              </span>
              <button type="button" disabled={(filters.page ?? 1) >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40" aria-label="Next page">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual SMS Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sms-dialog-title">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <h2 id="sms-dialog-title" className="text-lg font-bold text-slate-900">Send Manual SMS</h2>
              <button type="button" onClick={() => setDialogOpen(false)} aria-label="Close dialog"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {sendSuccess && (
              <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700" role="status">{sendSuccess}</div>
            )}
            {sendError && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{sendError}</div>
            )}

            <form onSubmit={(e) => void handleSendSms(e)} className="space-y-4">
              {/* Patient picker */}
              <div className="relative">
                <label htmlFor="manual-patient" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Patient <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  id="manual-patient"
                  type="text"
                  value={manualPatientQuery}
                  onChange={(e) => {
                    setManualPatientQuery(e.target.value);
                    setManualPatientId("");
                    setShowMPatientDropdown(true);
                  }}
                  placeholder="Type to search patient…"
                  autoComplete="off"
                  aria-autocomplete="list"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {showMPatientDropdown && manualPatientQuery.length >= 2 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg" role="listbox">
                    {patientLoading && <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>}
                    {!patientLoading && (patientData?.items ?? []).map((p) => (
                      <li key={p.id} role="option" aria-selected={p.id === manualPatientId}
                        className="cursor-pointer px-3 py-2.5 text-sm hover:bg-teal-50"
                        onClick={() => {
                          setManualPatientId(p.id);
                          setManualPatientName(p.fullName);
                          setManualPatientQuery(p.fullName);
                          setShowMPatientDropdown(false);
                        }}>
                        <span className="font-medium">{p.fullName}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">{p.patientCode}</span>
                      </li>
                    ))}
                    {!patientLoading && (patientData?.items ?? []).length === 0 && (
                      <li className="px-3 py-2 text-sm text-slate-400">No patients found.</li>
                    )}
                  </ul>
                )}
                {manualPatientId && (
                  <p className="mt-1 text-xs text-teal-600">Selected: <span className="font-medium">{manualPatientName}</span></p>
                )}
              </div>

              {/* Message */}
              <div>
                <label htmlFor="manual-message" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Message <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="manual-message"
                  value={manualMessage}
                  onChange={(e) => setManualMessage(e.target.value)}
                  rows={4}
                  maxLength={160}
                  placeholder="Type your message (max 160 characters)…"
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="mt-1 text-right text-xs text-slate-400">{manualMessage.length}/160</p>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={sending}
                  className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
                  {sending ? "Sending…" : "Send SMS"}
                </button>
                <button type="button" onClick={() => setDialogOpen(false)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
