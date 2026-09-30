"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePatient, useUpdatePatient } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import { toast } from "@/lib/toast";
import { patientUpdateSchema, type PatientUpdateFormValues } from "@/lib/schemas/patient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeAge(birthDateStr: string): number {
  if (!birthDateStr) return 0;
  const bd = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return Math.max(0, age);
}

// Shared classes
const inputCls = "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wider text-[#3d2222]";
const errorCls = "mt-1 text-xs text-[#dc2626]";

// ---------------------------------------------------------------------------
// Section panel
// ---------------------------------------------------------------------------

function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mb-4 overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
      style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
    >
      <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
        <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
        <h2 className="text-sm font-bold text-[#1a0808]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only flag (non-admin roles)
// ---------------------------------------------------------------------------

function ReadOnlyFlag({ label, active, description }: { label: string; active: boolean; description: string }) {
  return (
    <div className={`flex items-start gap-3 text-sm text-[#3d2222] ${active ? "opacity-100" : "opacity-50"}`}>
      <span
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-[#d4b0b0]"
        style={{ background: active ? "linear-gradient(135deg, #b5343e, #c94060)" : "white" }}
      />
      <span>
        <strong>{label}</strong> {active ? "(set)" : "(not set)"}
        <br />
        <span className="text-xs text-[#9b6e6e]">{description}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PatientEditPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = use(params);
  const router = useRouter();
  const { data: patient, loading: patientLoading, error: patientError } = usePatient(patientId);
  const { updatePatient, loading: saving, error: saveError } = useUpdatePatient(patientId);
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm<PatientUpdateFormValues>({
    resolver: zodResolver(patientUpdateSchema),
    mode: "onBlur",
    defaultValues: { isPwd: false, isPregnant: false, confirmDuplicate: false, sex: undefined, philhealthMemberType: null, bloodType: null },
  });

  useEffect(() => {
    if (patient) {
      reset({
        firstName: patient.firstName, middleName: patient.middleName ?? null,
        lastName: patient.lastName, birthDate: patient.birthDate, sex: patient.sex,
        civilStatus: patient.civilStatus ?? null, mobileNumber: patient.mobileNumber ?? null,
        address: patient.address, guardianName: patient.guardianName ?? null,
        guardianContact: patient.guardianContact ?? null, philhealthNo: patient.philhealthNo ?? null,
        philhealthMemberType: patient.philhealthMemberType ?? null, isPwd: patient.isPwd,
        isPregnant: patient.isPregnant, bloodType: (patient.bloodType as PatientUpdateFormValues["bloodType"]) ?? null,
        confirmDuplicate: false,
      });
    }
  }, [patient, reset]);

  const birthDateValue = watch("birthDate") ?? "";
  const philhealthMemberTypeValue = watch("philhealthMemberType");
  const age = computeAge(birthDateValue);

  const onSubmit = async (data: PatientUpdateFormValues) => {
    const payload = {
      firstName: data.firstName.trim(), middleName: data.middleName?.trim() || undefined,
      lastName: data.lastName.trim(), birthDate: data.birthDate, sex: data.sex,
      civilStatus: data.civilStatus?.trim() || undefined, mobileNumber: data.mobileNumber?.trim() || undefined,
      address: data.address.trim(), guardianName: data.guardianName?.trim() || undefined,
      guardianContact: data.guardianContact?.trim() || undefined,
      philhealthNo: data.philhealthNo?.trim() || undefined,
      philhealthMemberType: data.philhealthMemberType ?? undefined,
      isPwd: isAdmin ? (data.isPwd ?? false) : (patient?.isPwd ?? false),
      isPregnant: isAdmin ? (data.isPregnant ?? false) : (patient?.isPregnant ?? false),
      bloodType: data.bloodType === "" ? null : (data.bloodType ?? null),
    };
    const updated = await updatePatient(payload);
    if (!updated) { toast.error(saveError?.message ?? "Failed to save patient record."); return; }
    toast.success("Patient record updated successfully.");
    router.push(`/patients/${patientId}`);
  };

  if (patientLoading) {
    return (
      <div className="mx-auto max-w-[860px]">
        <div className="mb-6 space-y-3">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-[#e8d5cc]" />
          <div className="h-5 w-40 animate-pulse rounded bg-[#e8d5cc]" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-4 h-48 animate-pulse rounded-xl bg-[#e8d5cc]" />
        ))}
      </div>
    );
  }

  if (patientError || !patient) {
    return (
      <div role="alert" className="rounded-xl border border-[#fcc] bg-[#fef2f2] p-6 text-sm font-medium text-[#b91c1c]">
        {patientError?.message ?? "Patient not found."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[860px]">
      {/* Page header */}
      <div className="mb-6">
        <Link
          href={`/patients/${patientId}`}
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-[#9b6e6e] hover:text-[#b5343e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
        >
          &#8592; Back to Patient Profile
        </Link>
        <h1 className="mt-1 text-3xl leading-tight text-[#1a0808] font-display">Edit Patient: {patient.fullName}</h1>
        <p className="mt-1 font-mono text-sm text-[#9b6e6e]">{patient.patientCode}</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>

        {/* Name */}
        <SectionPanel title="Patient's Full Name">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="firstName">First Name <span className="text-[#dc2626]">*</span></label>
              <input id="firstName" type="text" {...register("firstName")}
                className={`${inputCls} ${errors.firstName ? "border-[#fca5a5]" : ""}`} placeholder="e.g. Maria" />
              {errors.firstName && <p className={errorCls}>{errors.firstName.message}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="middleName">Middle Name</label>
              <input id="middleName" type="text" {...register("middleName")} className={inputCls} placeholder="e.g. Santos" />
            </div>
            <div>
              <label className={labelCls} htmlFor="lastName">Last Name <span className="text-[#dc2626]">*</span></label>
              <input id="lastName" type="text" {...register("lastName")}
                className={`${inputCls} ${errors.lastName ? "border-[#fca5a5]" : ""}`} placeholder="e.g. Dela Cruz" />
              {errors.lastName && <p className={errorCls}>{errors.lastName.message}</p>}
            </div>
          </div>
        </SectionPanel>

        {/* Demographics */}
        <SectionPanel title="Demographics">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="birthDate">Birthday <span className="text-[#dc2626]">*</span></label>
              <input id="birthDate" type="date" max={new Date().toISOString().split("T")[0]} {...register("birthDate")}
                className={`${inputCls} ${errors.birthDate ? "border-[#fca5a5]" : ""}`} />
              {errors.birthDate && <p className={errorCls}>{errors.birthDate.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Age</label>
              <div className={`${inputCls} flex min-h-[40px] items-center gap-2 bg-[#fdf5f0] text-[#7a5252]`}>
                {birthDateValue ? `${age} years old` : "—"}
                {age >= 60 && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[0.625rem] font-bold text-white">SENIOR</span>}
              </div>
            </div>
            <div>
              <label className={labelCls}>Sex <span className="text-[#dc2626]">*</span></label>
              <Controller
                name="sex"
                control={control}
                render={({ field }) => (
                  <div className="flex gap-4 pt-2">
                    {(["male", "female"] as const).map((s) => (
                      <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-[#3d2222]">
                        <input type="radio" name="sex" value={s} checked={field.value === s} onChange={() => field.onChange(s)} onBlur={field.onBlur} className="accent-[#b5343e]" />
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </label>
                    ))}
                  </div>
                )}
              />
              {errors.sex && <p className={errorCls}>{errors.sex.message}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="civilStatus">Civil Status</label>
              <select id="civilStatus" {...register("civilStatus")} className={inputCls}>
                <option value="">— Select —</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="widowed">Widowed</option>
                <option value="separated">Separated</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="bloodType">Blood Type</label>
              <select id="bloodType" {...register("bloodType")} className={inputCls}>
                <option value="">— Unknown —</option>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
              </select>
            </div>
          </div>
        </SectionPanel>

        {/* PhilHealth */}
        <SectionPanel title="PhilHealth">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>PhilHealth Member / Dependent</label>
              <Controller
                name="philhealthMemberType"
                control={control}
                render={({ field }) => (
                  <div className="flex gap-4 pt-2">
                    {[{ value: null, label: "No" }, { value: "member", label: "Member" }, { value: "dependent", label: "Dependent" }].map((item) => (
                      <label key={item.label} className="flex cursor-pointer items-center gap-2 text-sm text-[#3d2222]">
                        <input type="radio" name="philhealthType" value={item.value ?? ""} checked={field.value === item.value}
                          onChange={() => field.onChange(item.value)} onBlur={field.onBlur} className="accent-[#b5343e]" />
                        {item.label}
                      </label>
                    ))}
                  </div>
                )}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="philhealthNo">PhilHealth No.</label>
              <input id="philhealthNo" type="text" {...register("philhealthNo")} className={inputCls}
                placeholder="e.g. 12-345678901-2" disabled={!philhealthMemberTypeValue} />
            </div>
          </div>
        </SectionPanel>

        {/* Contact */}
        <SectionPanel title="Contact Information">
          <div className="mb-4">
            <label className={labelCls} htmlFor="mobileNumber">Contact No.</label>
            <input id="mobileNumber" type="tel" {...register("mobileNumber")}
              className={`${inputCls} ${errors.mobileNumber ? "border-[#fca5a5]" : ""}`} placeholder="e.g. 09171234567 or +639171234567" />
            {errors.mobileNumber && <p className={errorCls}>{errors.mobileNumber.message}</p>}
            <p className="mt-1 text-xs text-[#9b6e6e]">Used for appointment reminders and SMS notifications</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="address">Complete Address <span className="text-[#dc2626]">*</span></label>
            <textarea id="address" rows={3} {...register("address")}
              className={`${inputCls} resize-y ${errors.address ? "border-[#fca5a5]" : ""}`}
              placeholder="House No., Street, Barangay, Municipality, Province" />
            {errors.address && <p className={errorCls}>{errors.address.message}</p>}
          </div>
        </SectionPanel>

        {/* Emergency Contact */}
        <SectionPanel title="Emergency Contact">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="guardianName">Contact Name</label>
              <input id="guardianName" type="text" {...register("guardianName")} className={inputCls} placeholder="Full name of emergency contact" />
            </div>
            <div>
              <label className={labelCls} htmlFor="guardianContact">Contact No.</label>
              <input id="guardianContact" type="tel" {...register("guardianContact")}
                className={`${inputCls} ${errors.guardianContact ? "border-[#fca5a5]" : ""}`} placeholder="e.g. 09171234567" />
              {errors.guardianContact && <p className={errorCls}>{errors.guardianContact.message}</p>}
            </div>
          </div>
        </SectionPanel>

        {/* Special Status */}
        <SectionPanel title="Special Status">
          {isAdmin ? (
            <div className="flex flex-wrap gap-6">
              {[
                { field: "isPwd" as const, label: "Person with Disability (PWD)", desc: "Priority queuing and accessibility accommodations" },
                { field: "isPregnant" as const, label: "Currently Pregnant", desc: "Enables prenatal tracking and related reminders" },
              ].map(({ field, label, desc }) => (
                <label key={field} className="flex cursor-pointer items-start gap-3 text-sm text-[#3d2222]">
                  <input type="checkbox" {...register(field)} className="mt-0.5 h-4 w-4 accent-[#b5343e]" />
                  <span>
                    <strong>{label}</strong>
                    <br />
                    <span className="text-xs text-[#9b6e6e]">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div>
              <p className="mb-4 text-xs text-[#b09090]">Special status flags can only be changed by an Administrator.</p>
              <div className="flex flex-wrap gap-6">
                <ReadOnlyFlag label="Person with Disability (PWD)" active={patient.isPwd} description="Priority queuing and accessibility accommodations" />
                <ReadOnlyFlag label="Currently Pregnant" active={patient.isPregnant} description="Enables prenatal tracking and related reminders" />
              </div>
            </div>
          )}
        </SectionPanel>

        {/* Submit controls */}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            href={`/patients/${patientId}`}
            className="rounded-lg border border-[#e5d4cc] bg-white px-5 py-2.5 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            style={{ background: saving ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
