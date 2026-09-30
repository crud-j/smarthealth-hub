"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCreateVisit, usePatient } from "@/hooks/usePatients";
import { toast } from "@/lib/toast";
import type { VisitCreatePayload } from "@/types/patient";

const inputClass =
  "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2.5 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";
const labelClass = "mb-1.5 block text-sm font-semibold text-[#3d2222]";

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function NewVisitPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  const router = useRouter();
  const { data: patient, loading: patientLoading, error: patientError } = usePatient(patientId);
  const { createVisit, loading: saving, error: saveError } = useCreateVisit(patientId);
  const [visitType, setVisitType] = useState("consultation");
  const [visitDate, setVisitDate] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [pastMedicalHistory, setPastMedicalHistory] = useState("");
  const [presentMedicalHistory, setPresentMedicalHistory] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [temperature, setTemperature] = useState("");
  const [pulseRate, setPulseRate] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [oxygenSaturation, setOxygenSaturation] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");

  useEffect(() => {
    if (patientError) toast.error(`Failed to load patient: ${patientError.message}`);
    if (saveError) toast.error(`Failed to save visit: ${saveError.message}`);
  }, [patientError, saveError]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visitType.trim()) {
      toast.error("Select a visit type before saving.");
      return;
    }

    const payload: VisitCreatePayload = {
      visitType: visitType.trim(),
      visitDate: visitDate ? new Date(visitDate).toISOString() : undefined,
      chiefComplaint: chiefComplaint.trim() || undefined,
      pastMedicalHistory: pastMedicalHistory.trim() || undefined,
      presentMedicalHistory: presentMedicalHistory.trim() || undefined,
      diagnosis: diagnosis.trim() || undefined,
      treatmentNotes: treatmentNotes.trim() || undefined,
      vitalSigns: {
        bloodPressure: bloodPressure.trim() || undefined,
        temperature: toNumber(temperature),
        pulseRate: toNumber(pulseRate),
        respiratoryRate: toNumber(respiratoryRate),
        oxygenSaturation: toNumber(oxygenSaturation),
        weightKg: toNumber(weightKg),
        heightCm: toNumber(heightCm),
      },
    };

    const result = await createVisit(payload);
    if (result) {
      toast.success("Visit recorded successfully.");
      router.push(`/patients/${patientId}/history`);
    }
  }

  if (patientLoading) {
    return <div className="mx-auto max-w-3xl p-8 text-sm text-[#7a5252]">Loading patient...</div>;
  }

  if (!patient) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-[#fcc] bg-[#fef2f2] p-6">
        <p className="font-bold text-[#b91c1c]">Patient not found</p>
        <Link href="/patients" className="mt-3 inline-block text-sm font-medium text-[#b5343e] hover:underline">
          Back to patients
        </Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-5">
        <Link href={`/patients/${patientId}/history`} className="text-sm font-medium text-[#9b6e6e] hover:text-[#b5343e]">
          &larr; Back to visit history
        </Link>
        <h1 className="mt-2 text-3xl leading-tight text-[#1a0808] font-display">Add Visit</h1>
        <p className="mt-1 text-sm text-[#7a5252]">
          Record a visit for <strong>{patient.fullName}</strong> ({patient.patientCode}).
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
        <section className="rounded-xl border border-[#e5d4cc] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-[#1a0808]">Visit details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="visit-type" className={labelClass}>Visit type <span className="text-[#dc2626]">*</span></label>
              <select id="visit-type" value={visitType} onChange={(event) => setVisitType(event.target.value)} className={inputClass} required>
                <option value="consultation">Consultation</option>
                <option value="prenatal_checkup">Prenatal check-up</option>
                <option value="immunization_admin">Immunization</option>
                <option value="follow_up">Follow-up</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label htmlFor="visit-date" className={labelClass}>Visit date and time</label>
              <input id="visit-date" type="datetime-local" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="chief-complaint" className={labelClass}>Chief complaint</label>
            <textarea id="chief-complaint" value={chiefComplaint} onChange={(event) => setChiefComplaint(event.target.value)} rows={3} className={`${inputClass} resize-y`} />
          </div>
        </section>

        <section className="rounded-xl border border-[#e5d4cc] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-[#1a0808]">Vital signs</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["blood-pressure", "Blood pressure", bloodPressure, setBloodPressure, "e.g. 120/80", "text"],
              ["temperature", "Temperature (C)", temperature, setTemperature, "e.g. 36.5", "number"],
              ["pulse-rate", "Pulse rate", pulseRate, setPulseRate, "bpm", "number"],
              ["respiratory-rate", "Respiratory rate", respiratoryRate, setRespiratoryRate, "breaths/min", "number"],
              ["oxygen-saturation", "Oxygen saturation (%)", oxygenSaturation, setOxygenSaturation, "e.g. 98", "number"],
              ["weight-kg", "Weight (kg)", weightKg, setWeightKg, "", "number"],
              ["height-cm", "Height (cm)", heightCm, setHeightCm, "", "number"],
            ].map(([id, label, value, setter, placeholder, type]) => (
              <div key={id as string}>
                <label htmlFor={id as string} className={labelClass}>{label as string}</label>
                <input id={id as string} type={type as string} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} placeholder={placeholder as string} className={inputClass} step="any" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#e5d4cc] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-[#1a0808]">Clinical notes</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="past-history" className={labelClass}>Past medical history</label>
              <textarea id="past-history" value={pastMedicalHistory} onChange={(event) => setPastMedicalHistory(event.target.value)} rows={3} className={`${inputClass} resize-y`} />
            </div>
            <div>
              <label htmlFor="present-history" className={labelClass}>Present medical history</label>
              <textarea id="present-history" value={presentMedicalHistory} onChange={(event) => setPresentMedicalHistory(event.target.value)} rows={3} className={`${inputClass} resize-y`} />
            </div>
            <div>
              <label htmlFor="diagnosis" className={labelClass}>Diagnosis</label>
              <textarea id="diagnosis" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} rows={3} className={`${inputClass} resize-y`} />
            </div>
            <div>
              <label htmlFor="treatment-notes" className={labelClass}>Treatment notes</label>
              <textarea id="treatment-notes" value={treatmentNotes} onChange={(event) => setTreatmentNotes(event.target.value)} rows={3} className={`${inputClass} resize-y`} />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3 pb-8">
          <Link href={`/patients/${patientId}/history`} className="rounded-lg border border-[#e5d4cc] bg-white px-4 py-2.5 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0]">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="rounded-lg bg-[#b5343e] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#922b35] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Saving..." : "Save Visit"}
          </button>
        </div>
      </form>
    </main>
  );
}
