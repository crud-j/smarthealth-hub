"use client";

/**
 * Appointment Detail page — Phase 4.
 *
 * Shows full appointment details with action buttons:
 *   Confirm / Mark Completed / Mark Missed / Cancel
 *
 * Status transitions are gated: e.g. you can't complete a cancelled appointment.
 * All mutations via useUpdateAppointment / useCancelAppointment hooks.
 */

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useAppointment,
  useUpdateAppointment,
  useCancelAppointment,
} from "@/hooks/useAppointments";
import type { AppointmentStatus } from "@/types/appointment";

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
  checkup: "General Check-up",
  prenatal: "Prenatal Consultation",
  follow_up: "Follow-up Visit",
  vaccination: "Vaccination",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PageProps {
  params: Promise<{ appointmentId: string }>;
}

export default function AppointmentDetailPage({ params }: PageProps) {
  const { appointmentId } = use(params);
  const router = useRouter();

  const { data: appt, loading, error, refetch } = useAppointment(appointmentId);
  const { updateAppointment, loading: updating } = useUpdateAppointment(appointmentId);
  const { cancelAppointment, loading: cancelling } = useCancelAppointment();

  const isBusy = updating || cancelling;

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
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-700">
        <p className="font-semibold">Error loading appointment</p>
        <p className="mt-1 text-sm">{error.message}</p>
        <Link href="/appointments" className="mt-3 inline-block text-sm text-teal-600 underline">
          Back to Appointments
        </Link>
      </div>
    );
  }

  if (!appt) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back link */}
      <div className="mb-4">
        <Link
          href="/appointments"
          className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-800"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" />
          </svg>
          Back to Appointments
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Appointment Detail</h1>
            <p className="mt-0.5 font-mono text-xs text-slate-400">{appt.id}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[appt.status]}`}
          >
            {STATUS_LABELS[appt.status]}
          </span>
        </div>

        {/* Details grid */}
        <dl className="divide-y divide-slate-100 px-6">
          <div className="flex py-4">
            <dt className="w-44 shrink-0 text-sm font-medium text-slate-500">Patient</dt>
            <dd className="text-sm text-slate-900">
              {appt.patientName ?? "—"}
              {appt.patientId && (
                <Link
                  href={`/patients/${appt.patientId}`}
                  className="ml-2 text-xs text-teal-600 hover:underline"
                >
                  View profile
                </Link>
              )}
            </dd>
          </div>
          <div className="flex py-4">
            <dt className="w-44 shrink-0 text-sm font-medium text-slate-500">Patient Code</dt>
            <dd className="font-mono text-sm text-slate-700">{appt.patientCode ?? "—"}</dd>
          </div>
          <div className="flex py-4">
            <dt className="w-44 shrink-0 text-sm font-medium text-slate-500">Appointment Type</dt>
            <dd className="text-sm text-slate-700">
              {APPT_TYPE_LABELS[appt.appointmentType] ?? appt.appointmentType}
            </dd>
          </div>
          <div className="flex py-4">
            <dt className="w-44 shrink-0 text-sm font-medium text-slate-500">Scheduled At</dt>
            <dd className="text-sm text-slate-700">{formatDateTime(appt.scheduledAt)}</dd>
          </div>
          <div className="flex py-4">
            <dt className="w-44 shrink-0 text-sm font-medium text-slate-500">Notes</dt>
            <dd className="text-sm text-slate-700">{appt.notes ?? "None"}</dd>
          </div>
          <div className="flex py-4">
            <dt className="w-44 shrink-0 text-sm font-medium text-slate-500">Created At</dt>
            <dd className="text-sm text-slate-500">{formatDateTime(appt.createdAt)}</dd>
          </div>
        </dl>

        {/* Action buttons — role gating can be added via RoleGuard wrapping */}
        {appt.status !== "cancelled" && appt.status !== "completed" && (
          <div className="flex flex-wrap gap-3 border-t border-slate-200 p-6">
            {appt.status === "pending" && (
              <button
                type="button"
                onClick={() => void handleStatusChange("confirmed")}
                disabled={isBusy}
                className="min-h-[44px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {isBusy ? "Updating…" : "Confirm Appointment"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleStatusChange("completed")}
              disabled={isBusy}
              className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {isBusy ? "Updating…" : "Mark Completed"}
            </button>
            <button
              type="button"
              onClick={() => void handleStatusChange("missed")}
              disabled={isBusy}
              className="min-h-[44px] rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {isBusy ? "Updating…" : "Mark Missed"}
            </button>
            <button
              type="button"
              onClick={() => void handleStatusChange("cancelled")}
              disabled={isBusy}
              className="min-h-[44px] rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              {isBusy ? "Cancelling…" : "Cancel Appointment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
