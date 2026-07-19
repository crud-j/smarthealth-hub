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
import { useCreateAppointment } from "@/hooks/useAppointments";
import { usePatientList } from "@/hooks/usePatients";
import type { AppointmentType } from "@/types/appointment";

const APPT_TYPES: { value: AppointmentType; label: string }[] = [
  { value: "checkup", label: "General Check-up" },
  { value: "prenatal", label: "Prenatal Consultation" },
  { value: "follow_up", label: "Follow-up Visit" },
  { value: "vaccination", label: "Vaccination" },
];

export default function NewAppointmentPage() {
  const router = useRouter();
  const { createAppointment, loading, error } = useCreateAppointment();

  // Patient search state
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedPatientName, setSelectedPatientName] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  // Form state
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("checkup");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [notes, setNotes] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [validationError, setValidationError] = useState("");

  // Patient autocomplete — search patients list
  const { data: patientData, loading: patientLoading } = usePatientList({
    q: patientQuery.length >= 2 ? patientQuery : undefined,
    pageSize: 8,
  });

  const handleSelectPatient = useCallback(
    (id: string, name: string) => {
      setSelectedPatientId(id);
      setSelectedPatientName(name);
      setPatientQuery(name);
      setShowPatientDropdown(false);
    },
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError("");
    setSuccessMsg("");

    // Client-side validation
    if (!selectedPatientId) {
      setValidationError("Please select a patient from the search results.");
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      setValidationError("Please pick a date and time for the appointment.");
      return;
    }

    const scheduledAt = `${scheduledDate}T${scheduledTime}:00`;

    const result = await createAppointment({
      patientId: selectedPatientId,
      appointmentType,
      scheduledAt,
      notes: notes.trim() || undefined,
    });

    if (result) {
      setSuccessMsg("Appointment booked successfully!");
      setTimeout(() => router.push("/appointments"), 1200);
    }
  }

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

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Schedule Appointment</h1>
        <p className="mb-6 text-sm text-slate-500">
          Book a new appointment. An SMS reminder will be sent automatically.
        </p>

        {/* Success message */}
        {successMsg && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700" role="status">
            {successMsg}
          </div>
        )}

        {/* API error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error.message}
          </div>
        )}

        {/* Validation error */}
        {validationError && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700" role="alert">
            {validationError}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
          {/* Patient search */}
          <div className="relative">
            <label htmlFor="patient-search" className="mb-1.5 block text-sm font-medium text-slate-700">
              Patient <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="patient-search"
              type="text"
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value);
                setSelectedPatientId("");
                setSelectedPatientName("");
                setShowPatientDropdown(true);
              }}
              onFocus={() => patientQuery.length >= 2 && setShowPatientDropdown(true)}
              placeholder="Type patient name or code…"
              autoComplete="off"
              aria-required="true"
              aria-autocomplete="list"
              aria-controls="patient-results"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
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
                      aria-selected={p.id === selectedPatientId}
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
            {selectedPatientId && (
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
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {APPT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
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
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="appt-time" className="mb-1.5 block text-sm font-medium text-slate-700">
                Time <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="appt-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="appt-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
              Notes <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-60"
            >
              {loading ? "Booking…" : "Book Appointment"}
            </button>
            <Link
              href="/appointments"
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
