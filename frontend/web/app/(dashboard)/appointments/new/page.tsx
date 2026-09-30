"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateAppointment } from "@/hooks/useAppointments";
import { usePatientList } from "@/hooks/usePatients";
import { toast } from "@/lib/toast";
import { appointmentCreateSchema, type AppointmentCreateFormValues } from "@/lib/schemas/appointment";
import type { AppointmentType } from "@/types/appointment";

const APPT_TYPES: { value: AppointmentType; label: string; hint: string }[] = [
  { value: "checkup", label: "General Check-up", hint: "Routine consultation" },
  { value: "prenatal", label: "Prenatal Consultation", hint: "Maternal care visit" },
  { value: "follow_up", label: "Follow-up Visit", hint: "Continuing care" },
  { value: "vaccination", label: "Vaccination", hint: "Immunization schedule" },
];

const APPT_TYPE_LABELS: Record<AppointmentType, string> = {
  checkup: "General Check-up",
  prenatal: "Prenatal Consultation",
  follow_up: "Follow-up Visit",
  vaccination: "Vaccination",
};

const inputCls = "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2.5 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";
const labelCls = "mb-1.5 block text-sm font-semibold text-[#3d2222]";

// ---------------------------------------------------------------------------
// Presentational helpers (match patient detail / new-patient panel language)
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

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
      <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-bold text-[#1a0808]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-[#9b6e6e]">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function NewAppointmentPage() {
  const router = useRouter();
  const { createAppointment, loading } = useCreateAppointment();

  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatientName, setSelectedPatientName] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AppointmentCreateFormValues>({
    resolver: zodResolver(appointmentCreateSchema),
    mode: "onBlur",
    defaultValues: { patientId: "", appointmentType: "checkup", scheduledDate: "", scheduledTime: "08:00", notes: "" },
  });

  const patientIdValue = watch("patientId");
  const appointmentTypeValue = watch("appointmentType");
  const scheduledDateValue = watch("scheduledDate");
  const scheduledTimeValue = watch("scheduledTime");

  const { data: patientData, loading: patientLoading } = usePatientList({
    q: patientQuery.length >= 2 ? patientQuery : undefined,
    pageSize: 8,
  });

  const handleSelectPatient = useCallback((id: string, name: string) => {
    setValue("patientId", id, { shouldValidate: true });
    setSelectedPatientName(name);
    setPatientQuery(name);
    setShowPatientDropdown(false);
  }, [setValue]);

  const onSubmit = async (data: AppointmentCreateFormValues) => {
    const scheduledAt = `${data.scheduledDate}T${data.scheduledTime}:00`;
    const result = await createAppointment({
      patientId: data.patientId,
      appointmentType: data.appointmentType as AppointmentType,
      scheduledAt,
      notes: data.notes?.trim() || undefined,
    });
    if (result) { toast.success("Appointment booked successfully!"); router.push("/appointments"); }
    else { toast.error("Failed to book appointment. Please try again."); }
  };

  // Human-readable summary of what's currently selected (presentation only)
  const schedulePreview = (() => {
    if (!scheduledDateValue || !scheduledTimeValue) return null;
    const dt = new Date(`${scheduledDateValue}T${scheduledTimeValue}:00`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleString("en-PH", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  })();

  return (
    <div className="mx-auto max-w-6xl pb-28">
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
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Schedule Appointment</h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">
            Book a patient visit. An SMS reminder is sent automatically to the registered mobile number.
          </p>
        </div>
      </header>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* ── Main column ── */}
          <div className="space-y-5 lg:col-span-2">
            {/* Patient & Scheduling */}
            <Panel>
              <PanelHeader title="Patient & Scheduling" subtitle="Choose the patient and when the visit will take place." />
              <div className="space-y-5 p-5">
                {/* Patient search */}
                <div className="relative">
                  <label htmlFor="patient-search" className={labelCls}>
                    Patient <span className="text-[#dc2626]" aria-hidden="true">*</span>
                  </label>
                  <input type="hidden" {...register("patientId")} />
                  <input
                    id="patient-search"
                    type="text"
                    value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setValue("patientId", "", { shouldValidate: false }); setSelectedPatientName(""); setShowPatientDropdown(true); }}
                    onFocus={() => patientQuery.length >= 2 && setShowPatientDropdown(true)}
                    placeholder="Type patient name or code..."
                    autoComplete="off"
                    aria-required="true"
                    aria-autocomplete="list"
                    aria-controls="patient-results"
                    className={`${inputCls} ${errors.patientId ? "border-[#fca5a5]" : ""}`}
                  />
                  {errors.patientId && <p className="mt-1 text-xs text-[#dc2626]" role="alert">{errors.patientId.message}</p>}

                  {showPatientDropdown && patientQuery.length >= 2 && (patientLoading || (patientData?.items ?? []).length > 0) && (
                    <ul id="patient-results" role="listbox" aria-label="Patient search results"
                      className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-[#e5d4cc] bg-white shadow-lg">
                      {patientLoading && <li className="px-4 py-2.5 text-sm text-[#9b6e6e]">Searching...</li>}
                      {!patientLoading && patientData?.items.map((p) => (
                        <li key={p.id} role="option" aria-selected={p.id === patientIdValue}
                          className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#fdf5f0] transition-colors"
                          onClick={() => handleSelectPatient(p.id, p.fullName)}>
                          <span className="font-semibold text-[#1a0808]">{p.fullName}</span>
                          <span className="font-mono text-xs text-[#9b6e6e]">{p.patientCode}</span>
                        </li>
                      ))}
                      {!patientLoading && patientData?.items.length === 0 && (
                        <li className="px-4 py-2.5 text-sm text-[#9b6e6e]">No patients found.</li>
                      )}
                    </ul>
                  )}
                  {patientIdValue && (
                    <p className="mt-1 text-xs font-medium text-[#b5343e]">Selected: <span className="font-bold">{selectedPatientName}</span></p>
                  )}
                </div>

                {/* Appointment type + date + time in a responsive grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="appt-type" className={labelCls}>
                      Appointment type <span className="text-[#dc2626]" aria-hidden="true">*</span>
                    </label>
                    <select id="appt-type" {...register("appointmentType")}
                      className={`${inputCls} ${errors.appointmentType ? "border-[#fca5a5]" : ""}`}>
                      {APPT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {errors.appointmentType && <p className="mt-1 text-xs text-[#dc2626]" role="alert">{errors.appointmentType.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="appt-date" className={labelCls}>
                      Date <span className="text-[#dc2626]" aria-hidden="true">*</span>
                    </label>
                    <input id="appt-date" type="date" {...register("scheduledDate")} min={new Date().toISOString().split("T")[0]}
                      className={`${inputCls} ${errors.scheduledDate ? "border-[#fca5a5]" : ""}`} />
                    {errors.scheduledDate && <p className="mt-1 text-xs text-[#dc2626]" role="alert">{errors.scheduledDate.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="appt-time" className={labelCls}>
                      Time <span className="text-[#dc2626]" aria-hidden="true">*</span>
                    </label>
                    <input id="appt-time" type="time" {...register("scheduledTime")}
                      className={`${inputCls} ${errors.scheduledTime ? "border-[#fca5a5]" : ""}`} />
                    {errors.scheduledTime && <p className="mt-1 text-xs text-[#dc2626]" role="alert">{errors.scheduledTime.message}</p>}
                  </div>
                </div>
              </div>
            </Panel>

            {/* Notes */}
            <Panel>
              <PanelHeader title="Notes" subtitle="Optional context for the attending staff." />
              <div className="p-5">
                <label htmlFor="appt-notes" className={labelCls}>
                  Notes <span className="text-xs font-normal text-[#9b6e6e]">(optional)</span>
                </label>
                <textarea id="appt-notes" {...register("notes")} rows={4} maxLength={500}
                  placeholder="Any additional notes for this appointment..."
                  className={`${inputCls} resize-y`} />
              </div>
            </Panel>
          </div>

          {/* ── Summary sidebar ── */}
          <div className="space-y-5">
            <Panel>
              <PanelHeader title="Summary" subtitle="Review before booking." />
              <dl className="divide-y divide-[#f0e4dd] px-5">
                <div className="py-3.5">
                  <dt className="text-[0.625rem] font-bold uppercase tracking-wider text-[#b09090]">Patient</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[#1a0808]">
                    {patientIdValue ? selectedPatientName : <span className="italic text-[#d4b0b0]">Not selected</span>}
                  </dd>
                </div>
                <div className="py-3.5">
                  <dt className="text-[0.625rem] font-bold uppercase tracking-wider text-[#b09090]">Type</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[#1a0808]">
                    {APPT_TYPE_LABELS[appointmentTypeValue as AppointmentType] ?? "—"}
                  </dd>
                </div>
                <div className="py-3.5">
                  <dt className="text-[0.625rem] font-bold uppercase tracking-wider text-[#b09090]">When</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[#1a0808]">
                    {schedulePreview ?? <span className="italic text-[#d4b0b0]">Pick a date &amp; time</span>}
                  </dd>
                </div>
              </dl>
            </Panel>

            <div className="rounded-xl border border-[#edd9d0] bg-gradient-to-br from-[#fdf0eb] to-white px-5 py-4">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-[#b5343e]" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <p className="text-xs leading-relaxed text-[#7a5252]">
                  An SMS reminder will be sent automatically to the patient&apos;s registered mobile number.
                  You can also resend it later from the appointment&apos;s detail page.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e5d4cc] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Link href="/appointments"
              className="flex min-h-[44px] items-center rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
              Cancel
            </Link>
            <button type="submit" disabled={loading}
              className="flex min-h-[44px] items-center justify-center rounded-lg px-6 py-2 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
              style={{ background: loading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}>
              {loading ? "Booking..." : "Book Appointment"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
