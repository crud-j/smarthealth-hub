"use client";

import { useState } from "react";
import { useSmsLogList, useSendManualSms } from "@/hooks/useSmsLogs";
import { usePatientList } from "@/hooks/usePatients";
import type { SmsStatus, SmsLogListParams } from "@/types/sms";

const STATUS_LABELS: Record<SmsStatus, string> = {
  queued: "Queued", sent: "Sent", failed: "Failed", delivered: "Delivered",
};

const STATUS_BADGE: Record<SmsStatus, string> = {
  queued: "bg-amber-100 text-amber-700 border border-amber-200",
  sent: "bg-blue-100 text-blue-700 border border-blue-200",
  failed: "bg-red-100 text-red-700 border border-red-200",
  delivered: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default function SmsLogsPage() {
  const [filters, setFilters] = useState<SmsLogListParams>({ page: 1, pageSize: 15 });
  const [statusFilter, setStatusFilter] = useState<SmsStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualPatientQuery, setManualPatientQuery] = useState("");
  const [manualPatientId, setManualPatientId] = useState("");
  const [manualPatientName, setManualPatientName] = useState("");
  const [showMPatientDropdown, setShowMPatientDropdown] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [sendNow, setSendNow] = useState(false);
  const [sendSuccess, setSendSuccess] = useState("");
  const [sendError, setSendError] = useState("");

  const effectiveFilters: SmsLogListParams = { ...filters, ...(statusFilter ? { status: statusFilter } : {}), ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) };
  const { data, loading, error, refetch } = useSmsLogList(effectiveFilters);
  const { sendSms, loading: sending } = useSendManualSms();

  const { data: patientData, loading: patientLoading } = usePatientList({
    q: manualPatientQuery.length >= 2 ? manualPatientQuery : undefined,
    pageSize: 6,
  });

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize ?? 15)) : 1;

  function closeDialog() {
    setDialogOpen(false); setSendNow(false); setSendSuccess(""); setSendError("");
    setManualPatientQuery(""); setManualPatientId(""); setManualPatientName(""); setManualMessage("");
  }

  async function handleSendSms(e: React.FormEvent) {
    e.preventDefault(); setSendSuccess(""); setSendError("");
    if (!manualPatientId) { setSendError("Please select a patient."); return; }
    if (!manualMessage.trim()) { setSendError("Message cannot be empty."); return; }
    const result = await sendSms({ patientId: manualPatientId, message: manualMessage.trim(), sendNow });
    if (!result) { setSendError("Failed to send SMS. Please try again."); return; }
    if (result.status === "failed") { setSendError(result.errorDetail || "SMS delivery failed. Please try again."); refetch(); return; }
    setSendSuccess(result.status === "sent" ? "SMS sent successfully." : "SMS queued — will be delivered shortly.");
    setManualMessage(""); setManualPatientId(""); setManualPatientName(""); setManualPatientQuery("");
    refetch();
    setTimeout(() => { setDialogOpen(false); setSendSuccess(""); }, 1500);
  }

  const inputCls = "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">SMS Logs</h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">Delivery history and manual SMS dispatch</p>
        </div>
        <button type="button" onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Send Manual SMS
        </button>
      </div>

      {/* Filter bar */}
      <div
        className="mb-4 overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
          <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#1a0808]">Filters</h2>
        </div>
        <div className="flex flex-wrap gap-3 p-5">
          <div className="min-w-[140px]">
            <label htmlFor="sms-status" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">Status</label>
            <select id="sms-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SmsStatus | "")} className={inputCls}>
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABELS) as SmsStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="sms-from" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">From date</label>
            <input id="sms-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="sms-to" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">To date</label>
            <input id="sms-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => setFilters((f) => ({ ...f, page: 1 }))}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
              style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] p-4 text-sm font-medium text-[#b91c1c]">
          Failed to load SMS logs: {error.message}
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="SMS logs table">
            <thead>
              <tr className="border-b-2 border-[#e5d4cc]" style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}>
                {["Patient", "Mobile", "Message", "Status", "Sent At"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f0e4dd]">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-[#e8d5cc]" /></td>
                  ))}
                </tr>
              ))}

              {!loading && (data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 text-[#c08080]">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#9b6e6e]">No SMS logs found.</p>
                      <p className="mt-1 text-xs text-[#c08080]">Sent messages will appear here.</p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && (data?.items ?? []).map((log) => (
                <tr key={log.id} className="border-b border-[#f0e4dd] hover:bg-[#fdf5f0] transition-colors duration-150">
                  <td className="px-4 py-3 text-sm font-semibold text-[#1a0808]">{log.patientName ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#7a5252]">{log.mobileNumber}</td>
                  <td className="px-4 py-3 text-sm text-[#7a5252]" title={log.message}>{truncate(log.message)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[log.status]}`}>
                      {STATUS_LABELS[log.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#9b6e6e] whitespace-nowrap">{formatDateTime(log.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > (filters.pageSize ?? 15) && (
          <div className="flex items-center justify-between border-t border-[#e5d4cc] px-5 py-3">
            <p className="text-xs font-medium text-[#9b6e6e]">{data.total} total records</p>
            <div className="flex gap-2">
              <button type="button" disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                aria-label="Previous page">
                Previous
              </button>
              <span className="flex items-center px-2 text-xs text-[#9b6e6e]">Page {filters.page ?? 1} of {totalPages}</span>
              <button type="button" disabled={(filters.page ?? 1) >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                aria-label="Next page">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual SMS Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sms-dialog-title">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between border-b border-[#edd9d0] bg-gradient-to-br from-[#fdf0eb] to-white px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
                <h2 id="sms-dialog-title" className="text-sm font-bold text-[#1a0808]">Send Manual SMS</h2>
              </div>
              <button type="button" onClick={closeDialog} aria-label="Close dialog"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9b6e6e] hover:bg-[#fdf5f0] text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-5">
              {sendSuccess && (
                <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {sendSuccess}
                </div>
              )}
              {sendError && (
                <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] px-4 py-3 text-sm font-medium text-[#b91c1c]">
                  {sendError}
                </div>
              )}

              <form onSubmit={(e) => void handleSendSms(e)} className="space-y-4">
                {/* Patient picker */}
                <div className="relative">
                  <label htmlFor="manual-patient" className="mb-1.5 block text-sm font-semibold text-[#3d2222]">
                    Patient <span className="text-[#dc2626]" aria-hidden="true">*</span>
                  </label>
                  <input id="manual-patient" type="text" value={manualPatientQuery}
                    onChange={(e) => { setManualPatientQuery(e.target.value); setManualPatientId(""); setShowMPatientDropdown(true); }}
                    placeholder="Type to search patient..."
                    autoComplete="off" aria-autocomplete="list"
                    className={inputCls} />
                  {showMPatientDropdown && manualPatientQuery.length >= 2 && (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-[#e5d4cc] bg-white shadow-lg" role="listbox">
                      {patientLoading && <li className="px-4 py-2.5 text-sm text-[#9b6e6e]">Searching...</li>}
                      {!patientLoading && (patientData?.items ?? []).map((p) => (
                        <li key={p.id} role="option" aria-selected={p.id === manualPatientId}
                          className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#fdf5f0] transition-colors"
                          onClick={() => { setManualPatientId(p.id); setManualPatientName(p.fullName); setManualPatientQuery(p.fullName); setShowMPatientDropdown(false); }}>
                          <span className="font-semibold text-[#1a0808]">{p.fullName}</span>
                          <span className="font-mono text-xs text-[#9b6e6e]">{p.patientCode}</span>
                        </li>
                      ))}
                      {!patientLoading && (patientData?.items ?? []).length === 0 && (
                        <li className="px-4 py-2.5 text-sm text-[#9b6e6e]">No patients found.</li>
                      )}
                    </ul>
                  )}
                  {manualPatientId && (
                    <p className="mt-1 text-xs font-medium text-[#b5343e]">Selected: <span className="font-bold">{manualPatientName}</span></p>
                  )}
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="manual-message" className="mb-1.5 block text-sm font-semibold text-[#3d2222]">
                    Message <span className="text-[#dc2626]" aria-hidden="true">*</span>
                  </label>
                  <textarea id="manual-message" value={manualMessage} onChange={(e) => setManualMessage(e.target.value)}
                    rows={4} maxLength={160} placeholder="Type your message (max 160 characters)..."
                    className={`${inputCls} resize-y`} />
                  <p className="mt-1 text-right text-xs text-[#9b6e6e]">{manualMessage.length}/160</p>
                </div>

                {/* Delivery mode */}
                <div className="rounded-xl border border-[#e5d4cc] bg-[#fdf7f3] p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#b5343e]" />
                    <span>
                      <span className="block text-sm font-semibold text-[#3d2222]">Send now</span>
                      <span className="block text-xs text-[#9b6e6e] mt-0.5">
                        {sendNow
                          ? "Sends immediately and waits for a definitive result — slower, but no dependency on a background worker."
                          : "Default: queues the message for background delivery. Fast response, but delivery depends on a worker picking it up."}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={sending}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                    style={{ background: sending ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}>
                    {sending ? "Sending..." : "Send SMS"}
                  </button>
                  <button type="button" onClick={closeDialog}
                    className="min-h-[44px] rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
