"use client";

/**
 * AppointmentForm — reusable form for creating and editing appointments.
 *
 * Used as a composite by:
 *  - app/(dashboard)/appointments/new/page.tsx (create mode)
 *
 * The form handles patient search autocomplete, appointment type selection,
 * date+time picker, and notes. All submission logic is handled by the parent page.
 * This component is a controlled component — the parent provides onSubmit.
 */

import type { AppointmentCreatePayload, AppointmentType } from "@/types/appointment";

const APPT_TYPES: { value: AppointmentType; label: string }[] = [
  { value: "checkup", label: "General Check-up" },
  { value: "prenatal", label: "Prenatal Consultation" },
  { value: "follow_up", label: "Follow-up Visit" },
  { value: "vaccination", label: "Vaccination" },
];

interface AppointmentFormProps {
  /** Initial values for pre-populating the form (edit mode). */
  initialValues?: Partial<AppointmentCreatePayload>;
  onSubmit: (data: AppointmentCreatePayload) => Promise<void>;
  loading?: boolean;
  submitLabel?: string;
}

/**
 * Minimal controlled form — see appointments/new/page.tsx for the full
 * patient-search+autocomplete implementation. This component is the
 * reusable shell for when no patient search is needed (e.g., from the
 * patient profile page, where the patient is already known).
 */
export default function AppointmentForm({
  initialValues,
  onSubmit,
  loading = false,
  submitLabel = "Book Appointment",
}: AppointmentFormProps) {
  // This is a placeholder shell; the full form logic lives in the page.
  // Remove this component if pages embed the form inline, or expand here
  // if reuse across multiple entry points is needed.
  void initialValues;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const scheduledDate = data.get("scheduled_date") as string;
    const scheduledTime = data.get("scheduled_time") as string;
    const patientId = data.get("patient_id") as string;
    const appointmentType = data.get("appointment_type") as AppointmentType;
    const notes = (data.get("notes") as string).trim();

    await onSubmit({
      patientId,
      appointmentType,
      scheduledAt: `${scheduledDate}T${scheduledTime}:00`,
      notes: notes || undefined,
    });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <input type="hidden" name="patient_id" defaultValue={initialValues?.patientId} />

      <div>
        <label htmlFor="af-type" className="mb-1.5 block text-sm font-medium text-slate-700">
          Appointment Type
        </label>
        <select
          id="af-type"
          name="appointment_type"
          defaultValue={initialValues?.appointmentType ?? "checkup"}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {APPT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="af-date" className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
          <input
            id="af-date"
            name="scheduled_date"
            type="date"
            defaultValue={initialValues?.scheduledAt?.split("T")[0]}
            required
            min={new Date().toISOString().split("T")[0]}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label htmlFor="af-time" className="mb-1.5 block text-sm font-medium text-slate-700">Time</label>
          <input
            id="af-time"
            name="scheduled_time"
            type="time"
            defaultValue="08:00"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="af-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
          Notes <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="af-notes"
          name="notes"
          rows={3}
          maxLength={500}
          defaultValue={initialValues?.notes}
          placeholder="Additional notes…"
          className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

