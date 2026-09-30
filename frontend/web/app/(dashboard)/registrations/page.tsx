"use client";
/**
 * Unified Pending Registrations Inbox
 * URL: /registrations
 *
 * Two queues in one place:
 *   Pre-visit Drafts    — intake tokens with draft_data submitted, awaiting staff finalization
 *   Online Applications — self-registration submissions awaiting admin approve/reject
 *
 * Roles:
 *   Pre-visit tab  — admin, bhw, admin_staff, physician
 *   Online tab     — admin only (tab hidden for other roles)
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, FileText, User, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  IntakeApplicationReviewModal,
  type IntakeApplicationSummary as OnlineApplication,
} from "@/components/intake/IntakeApplicationReviewModal";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface PendingIntakeSummary {
  token: string;
  created_at: string;
  expires_at: string;
  has_draft: boolean;
  patient_name: string | null;
}

interface DraftData {
  first_name?: string;
  last_name?: string;
  visit_purpose?: string;
  mobile_number?: string;
}

interface IntakeTokenDraft extends PendingIntakeSummary {
  draft?: DraftData;
}

interface PaginatedApplications {
  items: OnlineApplication[];
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
    const t = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-xl ${
        toast.kind === "success" ? "bg-green-700" : "bg-red-600"
      }`}
    >
      {toast.kind === "success" ? <CheckCircle2 size={16} /> : <X size={16} />}
      {toast.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function expiresIn(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "Expired";
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return "< 1 hr";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ---------------------------------------------------------------------------
// Finalize confirmation modal (pre-visit drafts)
// ---------------------------------------------------------------------------

function FinalizeModal({
  token,
  patientName,
  onClose,
  onFinalized,
}: {
  token: string;
  patientName: string;
  onClose: () => void;
  onFinalized: (patientCode: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function finalize() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch<{ patient_id: string; patient_code: string; registration_data_source: string }>(
        `/intake/${token}/finalize`,
        { method: "POST" }
      );
      onFinalized(r.patient_code);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Finalization failed. Check the draft data.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-base font-bold text-slate-900">Finalize Pre-visit Draft</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="mb-1 text-sm text-slate-700">
          This will create a permanent patient record for:
        </p>
        <p className="mb-4 text-base font-semibold text-slate-900">{patientName}</p>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Verify the patient's identity with a valid ID before finalizing. This action cannot be undone.
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void finalize()}
            disabled={loading}
            className="flex-1 rounded-lg bg-green-700 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-60"
          >
            {loading ? "Creating Record…" : "Finalize & Create Patient"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab — Pre-visit Drafts
// ---------------------------------------------------------------------------

function PrevisitDraftsTab({
  onFinalized,
}: {
  onFinalized: (patientCode: string) => void;
}) {
  const [drafts, setDrafts] = useState<IntakeTokenDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<IntakeTokenDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const raw = await apiFetch<PendingIntakeSummary[]>("/intake/pending");
      // Only show tokens where the patient has actually submitted (has_draft = true)
      setDrafts(raw.filter((t) => t.has_draft));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load drafts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleFinalized(patientCode: string) {
    setFinalizeTarget(null);
    onFinalized(patientCode);
    void load();
  }

  if (loading) return <TableSkeleton />;
  if (err) return <ErrorBanner message={err} />;
  if (drafts.length === 0) {
    return (
      <EmptyQueue
        icon={<CheckCircle2 size={32} className="text-green-500" />}
        message="No pending pre-visit drafts"
        sub="All submitted intake forms have been finalized."
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              {["Patient", "Visit Purpose", "Submitted", "Expires", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {drafts.map((d) => {
              const name = d.patient_name ?? "—";
              const purpose = (d.draft as DraftData | undefined)?.visit_purpose ?? null;
              const expired = new Date(d.expires_at) < new Date();
              return (
                <tr key={d.token} className={expired ? "opacity-50" : "hover:bg-slate-50"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-xs font-bold text-rose-600 ring-1 ring-inset ring-rose-100">
                        <User size={14} />
                      </div>
                      <span className="font-medium text-slate-900">{name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {purpose ? (
                      <span className="inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">{purpose}</span>
                    ) : (
                      <span className="text-xs text-slate-400">Not specified</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{timeAgo(d.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${expired ? "text-red-500" : "text-slate-500"}`}>
                      {expired ? "Expired" : expiresIn(d.expires_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!expired && (
                      <button
                        type="button"
                        onClick={() => setFinalizeTarget(d)}
                        className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100 transition-colors"
                      >
                        Finalize
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {finalizeTarget && (
        <FinalizeModal
          token={finalizeTarget.token}
          patientName={finalizeTarget.patient_name ?? "Unknown Patient"}
          onClose={() => setFinalizeTarget(null)}
          onFinalized={handleFinalized}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab — Online Applications
// ---------------------------------------------------------------------------

function OnlineApplicationsTab({
  onReviewed,
}: {
  onReviewed: () => void;
}) {
  const [apps, setApps] = useState<OnlineApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<PaginatedApplications>("/intake-applications?status=pending&page_size=50");
      setApps(data.items);
      setTotal(data.total);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleReviewed() {
    setSelectedId(null);
    onReviewed();
    void load();
  }

  if (loading) return <TableSkeleton />;
  if (err) return <ErrorBanner message={err} />;
  if (apps.length === 0) {
    return (
      <EmptyQueue
        icon={<CheckCircle2 size={32} className="text-green-500" />}
        message="No pending applications"
        sub="All online registration applications have been reviewed."
      />
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-slate-500">{total} application{total !== 1 ? "s" : ""} pending review</p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              {["Reference", "Applicant", "Location", "Submitted", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {apps.map((app) => (
              <tr
                key={app.id}
                className="cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setSelectedId(app.id)}
              >
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{app.reference_number}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{app.last_name}, {app.first_name}</p>
                  {app.mobile_number && <p className="text-xs text-slate-500">{app.mobile_number}</p>}
                </td>
                <td className="px-4 py-3 text-slate-500">{app.barangay}, {app.municipality}</td>
                <td className="px-4 py-3 text-slate-500">{timeAgo(app.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedId(app.id); }}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Showing first 50 — <Link href="/settings/intake-applications" className="font-semibold text-rose-600 hover:underline">view all in Applications page</Link>
        </p>
      )}

      {selectedId && (
        <IntakeApplicationReviewModal
          applicationId={selectedId}
          onClose={() => setSelectedId(null)}
          onApproved={(_patientId, _patientCode) => { handleReviewed(); }}
          onRejected={handleReviewed}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
  );
}

function EmptyQueue({ icon, message, sub }: { icon: React.ReactNode; message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-sm font-semibold text-slate-700">{message}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Count hook — used for tab badges
// ---------------------------------------------------------------------------

function usePendingCounts(isAdmin: boolean) {
  const [previsitCount, setPrevisitCount] = useState<number | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const [draftResult, appResult] = await Promise.allSettled([
        apiFetch<PendingIntakeSummary[]>("/intake/pending"),
        isAdmin ? apiFetch<PaginatedApplications>("/intake-applications?status=pending&page_size=1") : Promise.resolve(null),
      ]);
      if (draftResult.status === "fulfilled") {
        setPrevisitCount(draftResult.value.filter((t) => t.has_draft).length);
      }
      if (appResult.status === "fulfilled" && appResult.value) {
        setOnlineCount((appResult.value as PaginatedApplications).total);
      }
    })();
  }, [isAdmin]);

  return { previsitCount, onlineCount };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ActiveTab = "previsit" | "online";

export default function RegistrationsPage() {
  const { user } = useCurrentUser();
  const role = user?.role?.toLowerCase() ?? "";
  const isAdmin = role === "admin";
  const canSeeOnline = isAdmin;

  // mounted guard: auth state is unavailable during SSR. Role-derived conditionals
  // (canSeeOnline, isAdmin) must only affect the render tree after client hydration
  // to avoid server/client HTML mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [tab, setTab] = useState<ActiveTab>("previsit");
  const [toast, setToast] = useState<ToastState | null>(null);
  const { previsitCount, onlineCount } = usePendingCounts(isAdmin);

  const totalPending =
    (previsitCount ?? 0) + (mounted && canSeeOnline ? (onlineCount ?? 0) : 0);

  function showToast(message: string, kind: "success" | "error" = "success") {
    setToast({ message, kind });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Page header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Pending Registrations
            </h1>
            {totalPending > 0 && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-bold text-white">
                {totalPending}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Pre-visit intake forms awaiting finalization and online applications awaiting review.
          </p>
        </div>

        {mounted && canSeeOnline && (
          <Link
            href="/settings/intake-applications"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <FileText size={15} />
            Full Applications List
          </Link>
        )}
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        <TabButton
          active={tab === "previsit"}
          onClick={() => setTab("previsit")}
          count={previsitCount}
        >
          Pre-visit Drafts
        </TabButton>
        {mounted && canSeeOnline && (
          <TabButton
            active={tab === "online"}
            onClick={() => setTab("online")}
            count={onlineCount}
          >
            Online Applications
          </TabButton>
        )}
      </div>

      {/* Tab content */}
      {tab === "previsit" && (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
            <Clock size={15} className="shrink-0" />
            <span>
              These are intake forms submitted by patients who received an SMS link from a staff member.
              Verify the patient&apos;s ID before finalizing.
            </span>
          </div>
          <PrevisitDraftsTab
            onFinalized={(code) => showToast(`Patient ${code} created successfully.`)}
          />
        </>
      )}

      {tab === "online" && mounted && canSeeOnline && (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            <Clock size={15} className="shrink-0" />
            <span>
              These are self-registration submissions from the public <strong>/register</strong> page.
              Review each application before approving.
            </span>
          </div>
          <OnlineApplicationsTab
            onReviewed={() => showToast("Application reviewed.")}
          />
        </>
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// TabButton
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
      {count !== null && count > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
            active ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
