"use client";

/**
 * New Appointment page — Phase 4.
 *
 * Form fields:
 *   - Patient search (async, debounced against GET /patients?q=)
 *   - Appointment type select
 *   - Date + time picker
 *   - Notes textarea
 *
 * On submit: useCreateAppointment mutation → success toast → redirect /appointments.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateAppointment } from "@/hooks/useAppointments";
import { usePatientList } from "@/hooks/usePatients";
import { swSuccess, swError } from "@/lib/swal";
import {
  appointmentCreateSchema,
  type AppointmentCreateFormValues,
} from "@/lib/schemas/appointment";
import type { AppointmentType } from "@/types/appointment";

const APPT_TYPES: { value: AppointmentType; label: string }[] = [
  { value: "checkup", label: "General Check-up" },
  { value: "prenatal", label: "Prenatal Consultation" },
  { value: "follow_up", label: "Follow-up Visit" },
  { value: "vaccination", label: "Vaccination" },
];

export default function NewAppointmentPage() {
  const router = useRouter();
  const { createAppointment, loading } = useCreateAppointment();

  // Patient search UI state — display only, not part of the form schema
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatientName, setSelectedPatientName] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AppointmentCreateFormValues>({
    resolver: zodResolver(appointmentCreateSchema),
    mode: "onBlur",
    defaultValues: {
      patientId: "",
      appointmentType: "checkup",
      scheduledDate: "",
      scheduledTime: "08:00",
      notes: "",
    },
  });

  const patientIdValue = watch("patientId");

  // Patient autocomplete — search patients list
  const { data: patientData, loading: patientLoading } = usePatientList({
    q: patientQuery.length >= 2 ? patientQuery : undefined,
    pageSize: 8,
  });

  const handleSelectPatient = useCallback(
    (id: string, name: string) => {
      setValue("patientId", id, { shouldValidate: true });
      setSelectedPatientName(name);
      setPatientQuery(name);
      setShowPatientDropdown(false);
    },
    [setValue]
  );

  const onSubmit = async (data: AppointmentCreateFormValues) => {
    const scheduledAt = `${data.scheduledDate}T${data.scheduledTime}:00`;

    const result = await createAppointment({
      patientId: data.patientId,
      appointmentType: data.appointmentType as AppointmentType,
      scheduledAt,
      notes: data.notes?.trim() || undefined,
    });

    if (result) {
      void swSuccess("Appointment booked successfully!");
      router.push("/appointments");
    } else {
      void swError("Failed to book appointment. Please try again.");
    }
  };

  return (
    <div className="mx-auto max-w-xl">
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

      <div className="rounded-xl bg-white p-6 shadow-sm" style={{ border: "1px solid #e5d4cc", boxShadow: "0 2px 10px rgba(160,80,80,0.06)" }}>
        <h1 className="mb-1 text-xl font-bold" style={{ fontFamily: "var(--font-dm-serif, Georgia, serif)", fontWeight: 400, color: "#1a0808" }}>Schedule Appointment</h1>
        <p className="mb-6 text-sm" style={{ color: "#7a5252" }}>
          Book a new appointment. An SMS reminder will be sent automatically.
        </p>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-5">
          {/* Patient search */}
          <div className="relative">
            <label htmlFor="patient-search" className="mb-1.5 block text-sm font-medium text-slate-700">
              Patient <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            {/*
              patientId is the RHF-controlled hidden field that holds the selected patient UUID.
              The visible text input drives the autocomplete search UI only — it updates patientId
              via setValue when the user clicks a result from the dropdown.
            */}
            <input type="hidden" {...register("patientId")} />
            <input
              id="patient-search"
              type="text"
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value);
                setValue("patientId", "", { shouldValidate: false });
                setSelectedPatientName("");
                setShowPatientDropdown(true);
              }}
              onFocus={() => patientQuery.length >= 2 && setShowPatientDropdown(true)}
              placeholder="Type patient name or code…"
              autoComplete="off"
              aria-required="true"
              aria-autocomplete="list"
              aria-controls="patient-results"
              className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                errors.patientId ? "border-red-300" : "border-slate-200"
              }`}
            />
            {errors.patientId && (
              <p className="mt-1 text-sm text-red-600" role="alert">{errors.patientId.message}</p>
            )}
            {showPatientDropdown &&
              patientQuery.length >= 2 &&
              (patientLoading || (patientData?.items ?? []).length > 0) && (
                <ul
                  id="patient-results"
                  role="listbox"
                  aria-label="Patient search results"
                  className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  {patientLoading && (
                    <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>
                  )}
                  {!patientLoading && patientData?.items.map((p) => (
                    <li
                      key={p.id}
                      role="option"
                      aria-selected={p.id === patientIdValue}
                      className="cursor-pointer px-3 py-2.5 text-sm hover:bg-teal-50"
                      onClick={() => handleSelectPatient(p.id, p.fullName)}
                    >
                      <span className="font-medium text-slate-900">{p.fullName}</span>
                      <span className="ml-2 font-mono text-xs text-slate-400">{p.patientCode}</span>
                    </li>
                  ))}
                  {!patientLoading && patientData?.items.length === 0 && (
                    <li className="px-3 py-2 text-sm text-slate-400">No patients found.</li>
                  )}
                </ul>
              )}
            {patientIdValue && (
              <p className="mt-1 text-xs text-teal-600">
                Selected: <span className="font-medium">{selectedPatientName}</span>
              </p>
            )}
          </div>

          {/* Appointment type */}
          <div>
            <label htmlFor="appt-type" className="mb-1.5 block text-sm font-medium text-slate-700">
              Appointment type <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <select
              id="appt-type"
              {...register("appointmentType")}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                errors.appointmentType ? "border-red-300" : "border-slate-200"
              }`}
            >
              {APPT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {errors.appointmentType && (
              <p className="mt-1 text-sm text-red-600" role="alert">{errors.appointmentType.message}</p>
            )}
          </div>

          {/* Date + time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="appt-date" className="mb-1.5 block text-sm font-medium text-slate-700">
                Date <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="appt-date"
                type="date"
                {...register("scheduledDate")}
                min={new Date().toISOString().split("T")[0]}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.scheduledDate ? "border-red-300" : "border-slate-200"
                }`}
              />
              {errors.scheduledDate && (
                <p className="mt-1 text-sm text-red-600" role="alert">{errors.scheduledDate.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="appt-time" className="mb-1.5 block text-sm font-medium text-slate-700">
                Time <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="appt-time"
                type="time"
                {...register("scheduledTime")}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.scheduledTime ? "border-red-300" : "border-slate-200"
                }`}
              />
              {errors.scheduledTime && (
                <p className="mt-1 text-sm text-red-600" role="alert">{errors.scheduledTime.message}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="appt-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
              Notes <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="appt-notes"
              {...register("notes")}
              rows={3}
              maxLength={500}
              placeholder="Any additional notes for this appointment…"
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
            >
              {loading ? "Booking…" : "Book Appointment"}
            </button>
            <Link
              href="/appointments"
              className="flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm font-medium"
              style={{ border: "1px solid #e5d4cc", color: "#3d2222" }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
