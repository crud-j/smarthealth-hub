"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppointment, useUpdateAppointment, useCancelAppointment } from "@/hooks/useAppointments";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import type { AppointmentStatus } from "@/types/appointment";
import { IntakeDetailsPanel } from "@/components/intake/IntakeDetailsPanel";

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending", confirmed: "Confirmed", completed: "Completed", missed: "Missed", cancelled: "Cancelled",
};

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  completed: "bg-stone-100 text-stone-600 border border-stone-200",
  missed: "bg-red-100 text-red-700 border border-red-200",
  cancelled: "bg-stone-50 text-stone-400 border border-stone-200",
};

const APPT_TYPE_LABELS: Record<string, string> = {
  checkup: "General Check-up", prenatal: "Prenatal Consultation", follow_up: "Follow-up Visit", vaccination: "Vaccination",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isUpcoming(isoDatetime: string): boolean {
  return new Date(isoDatetime) > new Date();
}

interface IntakeLinkApiResponse {
  token: string;
  intake_url: string;
  sms_sent: boolean;
}

// ---------------------------------------------------------------------------
// Presentational helpers (match patient detail panel language)
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3.5 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm font-semibold text-[#9b6e6e]">{label}</dt>
      <dd className="text-sm text-[#1a0808]">{children}</dd>
    </div>
  );
}

export default function AppointmentDetailPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = use(params);
  const router = useRouter();
  const { data: appt, loading, error, refetch } = useAppointment(appointmentId);
  const { updateAppointment, loading: updating } = useUpdateAppointment(appointmentId);
  const { cancelAppointment, loading: cancelling } = useCancelAppointment();
  const isBusy = updating || cancelling;

  const [sendingIntakeLink, setSendingIntakeLink] = useState(false);
  const [intakeLinkError, setIntakeLinkError] = useState<string | null>(null);
  const [intakeLinkSuccess, setIntakeLinkSuccess] = useState<string | null>(null);

  const [sendingReminder, setSendingReminder] = useState(false);

  async function handleSendIntakeLink() {
    setSendingIntakeLink(true);
    setIntakeLinkError(null);
    setIntakeLinkSuccess(null);
    try {
      const res = await apiFetch<IntakeLinkApiResponse>(
        `/intake/send-link/${appointmentId}`,
        { method: "POST" },
      );
      const msg = res.sms_sent
        ? `Intake link sent via SMS. Token: ${res.token}`
        : `Intake link created (SMS not sent — patient has no mobile number). URL: ${res.intake_url}`;
      setIntakeLinkSuccess(msg);
      refetch();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to send intake link.";
      setIntakeLinkError(message);
    } finally {
      setSendingIntakeLink(false);
    }
  }

  async function handleSendReminder() {
    setSendingReminder(true);
    try {
      const res = await apiFetch<{ sent: boolean; error?: string }>(
        `/appointments/${appointmentId}/send-reminder`,
        { method: "POST" },
      );
      if (res.sent) {
        toast.success("Reminder SMS has been sent to the patient.");
      } else {
        toast.error(res.error ?? "SMS could not be delivered. Check server logs.");
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to send reminder. Please try again.";
      toast.error(message);
    } finally {
      setSendingReminder(false);
    }
  }

  async function handleStatusChange(newStatus: AppointmentStatus) {
    if (newStatus === "cancelled") {
      if (!confirm("Cancel this appointment?")) return;
      await cancelAppointment(appointmentId);
      router.push("/appointments");
      return;
    }
    await updateAppointment({ status: newStatus });
    refetch();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 h-7 w-40 animate-pulse rounded bg-[#e8d5cc]" />
        <div className="mb-6 h-10 w-72 animate-pulse rounded-lg bg-[#e8d5cc]" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div
              className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
              style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
            >
              <div className="p-5 space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-[#e8d5cc]" />
                ))}
              </div>
            </div>
          </div>
          <div className="h-52 animate-pulse rounded-xl bg-[#e8d5cc]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-2xl rounded-xl border border-[#fcc] bg-[#fef2f2] p-6">
        <p className="font-bold text-[#b91c1c]">Error loading appointment</p>
        <p className="mt-1 text-sm text-[#7a5252]">{error.message}</p>
        <Link href="/appointments" className="mt-3 inline-block text-sm font-medium text-[#b5343e] hover:underline">Back to Appointments</Link>
      </div>
    );
  }

  if (!appt) return null;

  const showStatusActions = appt.status !== "cancelled" && appt.status !== "completed";
  const showReminder = appt.status === "pending" || appt.status === "confirmed";
  const showIntake = !appt.intakeCompleted && isUpcoming(appt.scheduledAt);
  const hasSidebarActions = showStatusActions || showReminder || showIntake;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Back link */}
      <div className="mb-4">
        <Link href="/appointments"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#9b6e6e] hover:text-[#b5343e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" />
          </svg>
          Back to Appointments
        </Link>
      </div>

      {/* Page header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_BADGE[appt.status]}`}>
              {STATUS_LABELS[appt.status]}
            </span>
            {appt.intakeCompleted && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Intake Submitted
              </span>
            )}
          </div>
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">
            {appt.patientName ?? "Appointment"}
          </h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">
            {APPT_TYPE_LABELS[appt.appointmentType] ?? appt.appointmentType} · {formatDateTime(appt.scheduledAt)}
          </p>
          <p className="mt-0.5 font-mono text-xs text-[#b09090]">{appt.id}</p>
        </div>

        {appt.patientId && (
          <Link
            href={`/patients/${appt.patientId}`}
            className="rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          >
            View Patient Profile
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Main column: details + intake ── */}
        <div className="space-y-5 lg:col-span-2">
          <Panel>
            <PanelHeader title="Appointment Details" />
            <dl className="divide-y divide-[#f0e4dd] px-5">
              <DetailRow label="Patient">
                {appt.patientName ?? "—"}
                {appt.patientId && (
                  <Link href={`/patients/${appt.patientId}`} className="ml-2 text-xs font-medium text-[#b5343e] hover:underline">
                    View profile
                  </Link>
                )}
              </DetailRow>
              <DetailRow label="Patient Code">
                <span className="font-mono text-[#7a5252]">{appt.patientCode ?? "—"}</span>
              </DetailRow>
              <DetailRow label="Appointment Type">
                <span className="text-[#7a5252]">{APPT_TYPE_LABELS[appt.appointmentType] ?? appt.appointmentType}</span>
              </DetailRow>
              <DetailRow label="Scheduled At">
                <span className="text-[#7a5252]">{formatDateTime(appt.scheduledAt)}</span>
              </DetailRow>
              <DetailRow label="Notes">
                <span className="text-[#7a5252]">{appt.notes ?? "None"}</span>
              </DetailRow>
              <DetailRow label="Created At">
                <span className="text-[#9b6e6e]">{formatDateTime(appt.createdAt)}</span>
              </DetailRow>
              <DetailRow label="Intake Status">
                <span className="text-[#7a5252]">
                  {appt.intakeCompleted
                    ? `Submitted${appt.intakeSubmittedAt ? ` on ${formatDateTime(appt.intakeSubmittedAt)}` : ""}`
                    : "Not yet submitted"}
                </span>
              </DetailRow>
            </dl>
          </Panel>

          {appt.intakeCompleted && appt.intakeSummary && (
            <Panel>
              <PanelHeader title="Pre-Visit Intake" />
              <div className="p-5">
                <IntakeDetailsPanel
                  visitPurpose={appt.intakeSummary.visitPurpose}
                  purposeDetails={appt.intakeSummary.purposeDetails}
                  draftSubmittedAt={appt.intakeSummary.draftSubmittedAt}
                  patientNameFromDraft={appt.intakeSummary.patientNameFromDraft}
                />
              </div>
            </Panel>
          )}
        </div>

        {/* ── Sidebar: actions ── */}
        <div className="space-y-5">
          {hasSidebarActions ? (
            <Panel>
              <PanelHeader title="Actions" />
              <div className="space-y-5 p-5">
                {/* Status actions */}
                {showStatusActions && (
                  <div className="flex flex-col gap-3">
                    {appt.status === "pending" && (
                      <button type="button" onClick={() => void handleStatusChange("confirmed")} disabled={isBusy}
                        className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                        style={{ background: isBusy ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}>
                        {isBusy ? "Updating..." : "Confirm Appointment"}
                      </button>
                    )}
                    <button type="button" onClick={() => void handleStatusChange("completed")} disabled={isBusy}
                      className="min-h-[44px] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                      {isBusy ? "Updating..." : "Mark Completed"}
                    </button>
                    <button type="button" onClick={() => void handleStatusChange("missed")} disabled={isBusy}
                      className="min-h-[44px] rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
                      {isBusy ? "Updating..." : "Mark Missed"}
                    </button>
                    <button type="button" onClick={() => void handleStatusChange("cancelled")} disabled={isBusy}
                      className="min-h-[44px] rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#dc2626] hover:bg-[#fee2e2] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dc2626]">
                      {isBusy ? "Cancelling..." : "Cancel Appointment"}
                    </button>
                  </div>
                )}

                {/* Resend reminder SMS */}
                {showReminder && (
                  <div className={showStatusActions ? "border-t border-[#f0e4dd] pt-5" : ""}>
                    <button
                      type="button"
                      onClick={() => void handleSendReminder()}
                      disabled={sendingReminder}
                      aria-busy={sendingReminder}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                    >
                      {sendingReminder ? (
                        <>
                          <svg
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        "Resend Reminder SMS"
                      )}
                    </button>
                    <p className="mt-2 text-xs text-[#9b6e6e]">
                      Sends an SMS reminder to the patient&apos;s registered mobile number.
                    </p>
                  </div>
                )}

                {/* Intake link section */}
                {showIntake && (
                  <div className={showStatusActions || showReminder ? "border-t border-[#f0e4dd] pt-5" : ""}>
                    <button
                      type="button"
                      onClick={() => void handleSendIntakeLink()}
                      disabled={sendingIntakeLink}
                      className="min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      {sendingIntakeLink ? "Sending..." : "Send Intake Link"}
                    </button>
                    <p className="mt-2 text-xs text-[#9b6e6e]">
                      Sends a pre-visit registration form link to the patient via SMS.
                    </p>
                    {intakeLinkSuccess && (
                      <p role="status" className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                        {intakeLinkSuccess}
                      </p>
                    )}
                    {intakeLinkError && (
                      <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                        {intakeLinkError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          ) : (
            <Panel>
              <PanelHeader title="Actions" />
              <div className="p-5">
                <p className="text-sm text-[#9b6e6e]">
                  No actions available for a {STATUS_LABELS[appt.status].toLowerCase()} appointment.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
