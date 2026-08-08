"use client";

/**
 * VisitEditModal — Physician/Admin modal for editing an existing visit record.
 *
 * PHI fields (diagnosis, treatment_notes) are shown only when the current
 * user's role is "physician" or "admin".  The modal pre-fills all form fields
 * from the supplied visit prop.
 *
 * Props:
 *   visit   — the Visit record to edit (pre-populates all fields)
 *   onClose — called when the modal should be dismissed without saving
 *   onSaved — called after a successful PUT; parent should refetch data
 */

import { useState, useEffect, useRef } from "react";
import { useUpdateVisit } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import { swError } from "@/lib/swal";
import type { Visit } from "@/types/patient";
import type { VisitUpdatePayload } from "@/types/patient";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VisitEditModalProps {
  visit: Visit;
  onClose: () => void;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO datetime string to "YYYY-MM-DDTHH:MM" for <input type="datetime-local"> */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  // Slice to "YYYY-MM-DDTHH:MM" — browser datetime-local inputs require exactly this form.
  return iso.replace("Z", "").replace(/(\.\d+)$/, "").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VisitEditModal({ visit, onClose, onSaved }: VisitEditModalProps) {
  const { user: currentUser } = useCurrentUser();
  const { updateVisit, loading } = useUpdateVisit();

  // Determine whether PHI fields are visible for this user
  const canSeePhi = currentUser?.role === "physician" || currentUser?.role === "admin";

  // ---------------------------------------------------------------------------
  // Form state — scalars
  // ---------------------------------------------------------------------------
  const [visitType, setVisitType] = useState(visit.visitType);
  const [visitDate, setVisitDate] = useState(toDatetimeLocal(visit.visitDate));

  // Vital signs
  const [bloodPressure, setBloodPressure] = useState(visit.bloodPressure ?? "");
  const [temperature, setTemperature] = useState(
    visit.temperature != null ? String(visit.temperature) : ""
  );
  const [pulseRate, setPulseRate] = useState(
    visit.pulseRate != null ? String(visit.pulseRate) : ""
  );
  const [respiratoryRate, setRespiratoryRate] = useState(
    visit.respiratoryRate != null ? String(visit.respiratoryRate) : ""
  );
  const [oxygenSaturation, setOxygenSaturation] = useState(
    visit.oxygenSaturation != null ? String(visit.oxygenSaturation) : ""
  );
  const [weightKg, setWeightKg] = useState(
    visit.weightKg != null ? String(visit.weightKg) : ""
  );
  const [heightCm, setHeightCm] = useState(
    visit.heightCm != null ? String(visit.heightCm) : ""
  );

  // History fields
  const [chiefComplaint, setChiefComplaint] = useState(visit.chiefComplaint ?? "");
  const [pastMedicalHistory, setPastMedicalHistory] = useState(
    visit.pastMedicalHistory ?? ""
  );
  const [presentMedicalHistory, setPresentMedicalHistory] = useState(
    visit.presentMedicalHistory ?? ""
  );

  // PHI fields — only populated / sent when user has clinical role
  const [diagnosis, setDiagnosis] = useState(
    canSeePhi ? (visit.diagnosis ?? "") : ""
  );
  const [treatmentNotes, setTreatmentNotes] = useState(
    canSeePhi ? (visit.treatmentNotes ?? "") : ""
  );

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first field on mount
  useEffect(() => {
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, onClose]);

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: VisitUpdatePayload = {
      visit_type: visitType.trim() || null,
      visit_date: visitDate ? new Date(visitDate).toISOString() : null,
      vital_signs: {
        blood_pressure: bloodPressure.trim() || null,
        temperature: temperature.trim() !== "" ? Number(temperature) : null,
        pulse_rate: pulseRate.trim() !== "" ? Number(pulseRate) : null,
        respiratory_rate: respiratoryRate.trim() !== "" ? Number(respiratoryRate) : null,
        oxygen_saturation: oxygenSaturation.trim() !== "" ? Number(oxygenSaturation) : null,
        weight_kg: weightKg.trim() !== "" ? Number(weightKg) : null,
        height_cm: heightCm.trim() !== "" ? Number(heightCm) : null,
      },
      chief_complaint: chiefComplaint.trim() || null,
      past_medical_history: pastMedicalHistory.trim() || null,
      present_medical_history: presentMedicalHistory.trim() || null,
    };

    // Only include PHI fields when the user's role permits it
    if (canSeePhi) {
      payload.diagnosis = diagnosis.trim() || null;
      payload.treatment_notes = treatmentNotes.trim() || null;
    }

    const result = await updateVisit(visit.id, payload);
    if (result !== null) {
      onSaved();
      onClose();
    } else {
      void swError("Failed to save visit. Please try again.");
    }
  }

  // ---------------------------------------------------------------------------
  // Styles — matching the pattern from CreateUserModal (inline Tailwind classes)
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl my-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-edit-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2
              id="visit-edit-title"
              className="text-base font-semibold text-slate-900"
            >
              Edit Visit
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Case No. {visit.caseNo ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="space-y-5 px-6 py-5">
            {/* Visit type + date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="ve-visit-type"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Visit type
                </label>
                <input
                  id="ve-visit-type"
                  ref={firstInputRef}
                  type="text"
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value)}
                  placeholder="consultation"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  suppressHydrationWarning
                />
              </div>
              <div>
                <label
                  htmlFor="ve-visit-date"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Visit date &amp; time
                </label>
                <input
                  id="ve-visit-date"
                  type="datetime-local"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  suppressHydrationWarning
                />
              </div>
            </div>

            {/* Vital signs section */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Vital signs
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <label
                    htmlFor="ve-bp"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Blood pressure
                  </label>
                  <input
                    id="ve-bp"
                    type="text"
                    value={bloodPressure}
                    onChange={(e) => setBloodPressure(e.target.value)}
                    placeholder="120/80 mmHg"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label
                    htmlFor="ve-temp"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Temperature (°C)
                  </label>
                  <input
                    id="ve-temp"
                    type="number"
                    step="0.1"
                    min="30"
                    max="45"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="36.8"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label
                    htmlFor="ve-pulse"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Pulse (bpm)
                  </label>
                  <input
                    id="ve-pulse"
                    type="number"
                    min="20"
                    max="300"
                    value={pulseRate}
                    onChange={(e) => setPulseRate(e.target.value)}
                    placeholder="72"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label
                    htmlFor="ve-rr"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Resp. rate (/min)
                  </label>
                  <input
                    id="ve-rr"
                    type="number"
                    min="5"
                    max="80"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    placeholder="18"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label
                    htmlFor="ve-spo2"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    SpO2 (%)
                  </label>
                  <input
                    id="ve-spo2"
                    type="number"
                    min="0"
                    max="100"
                    value={oxygenSaturation}
                    onChange={(e) => setOxygenSaturation(e.target.value)}
                    placeholder="98"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label
                    htmlFor="ve-weight"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Weight (kg)
                  </label>
                  <input
                    id="ve-weight"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="500"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="60"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    suppressHydrationWarning
                  />
                </div>
                <div>
                  <label
                    htmlFor="ve-height"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Height (cm)
                  </label>
                  <input
                    id="ve-height"
                    type="number"
                    step="0.1"
                    min="30"
                    max="250"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="160"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    suppressHydrationWarning
                  />
                </div>
              </div>
            </div>

            {/* Chief complaint */}
            <div>
              <label
                htmlFor="ve-complaint"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Chief complaint
              </label>
              <textarea
                id="ve-complaint"
                rows={2}
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="Primary reason for the visit as reported by the patient"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>

            {/* History fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="ve-past-hx"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Past medical history
                </label>
                <textarea
                  id="ve-past-hx"
                  rows={3}
                  value={pastMedicalHistory}
                  onChange={(e) => setPastMedicalHistory(e.target.value)}
                  placeholder="Prior conditions relevant to this visit"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
              <div>
                <label
                  htmlFor="ve-present-hx"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Present medical history
                </label>
                <textarea
                  id="ve-present-hx"
                  rows={3}
                  value={presentMedicalHistory}
                  onChange={(e) => setPresentMedicalHistory(e.target.value)}
                  placeholder="History of presenting illness"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            </div>

            {/* PHI fields — physician / admin only */}
            {canSeePhi && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Clinical findings (PHI)
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                    Physician / Admin only
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="ve-diagnosis"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Diagnosis
                    </label>
                    <textarea
                      id="ve-diagnosis"
                      rows={4}
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="Clinical diagnosis (stored encrypted)"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ve-treatment"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Treatment notes
                    </label>
                    <textarea
                      id="ve-treatment"
                      rows={4}
                      value={treatmentNotes}
                      onChange={(e) => setTreatmentNotes(e.target.value)}
                      placeholder="Treatment plan and notes (stored encrypted)"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-w-[110px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
