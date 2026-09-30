"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreatePatient } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import ProfilePhotoUploader from "@/app/(dashboard)/patients/_components/ProfilePhotoUploader";
import { toast } from "@/lib/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { patientCreateSchema } from "@/lib/schemas/patient";
import type { PatientCreatePayload } from "@/types/patient";
import { usePhilHealthMask, usePhMobileMask } from "@/hooks/useInputMasks";
import IdScanCard from "@/components/forms/IdScanCard";
import type { OcrAutofillFields } from "@/components/forms/IdScanCard";

type PatientCreateFormValues = Omit<PatientCreatePayload, "confirmDuplicate"> & {
  middleName: string | undefined;
  civilStatus: string | undefined;
  householdNumber: string | undefined;
  sitioPurok: string | undefined;
  barangay: string;
  municipality: string;
  province: string;
  occupation: string | undefined;
  mobileNumber: string | undefined;
  address: string;
  guardianName: string | undefined;
  guardianContact: string | undefined;
  emergencyContactName: string;
  emergencyContactNumber: string;
  philhealthNo: string | undefined;
  philhealthMemberType: "member" | "dependent" | undefined;
  philhealthCategory: "indigent" | "sponsored" | "formal_economy" | "informal_economy" | "lifetime_member" | undefined;
  is4psBeneficiary: boolean;
  householdId4ps: string | undefined;
  isIndigenous: boolean;
  placeOfBirth: string | undefined;
  mothersMaidenName: string | undefined;
  seniorIdNumber: string | undefined;
  pwdIdNumber: string | undefined;
  lastMenstrualPeriod: string | undefined;
  gravida: number | undefined;
  para: number | undefined;
  estimatedDueDate: string | undefined;
  heightCm: number | undefined;
  weightKg: number | undefined;
  allergies: string | undefined;
  knownConditions: string | undefined;
  registrationSource: "walk_in" | "referral" | "outreach" | "others";
  registrationDataSource: "manual" | "ocr" | "pre_visit";
  dataPrivacyConsent: boolean;
  confirmDuplicate: boolean;
};

const pilotDefaults = { barangay: "Patubig", municipality: "Marilao", province: "Bulacan" } as const;

function computeAge(birthDateStr: string): number {
  if (!birthDateStr) return 0;
  const bd = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const monthDelta = today.getMonth() - bd.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < bd.getDate())) age--;
  return Math.max(0, age);
}

function getStepLabel(step: number): string {
  switch (step) {
    case 1: return "Identity";
    case 2: return "Contact";
    case 3: return "Clinical";
    case 4: return "Photo";
    default: return "";
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#dc2626]">{message}</p>;
}

const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name", lastName: "Last Name", birthDate: "Birthday", sex: "Sex",
  barangay: "Barangay", municipality: "Municipality", province: "Province",
  address: "Complete Address", emergencyContactName: "Emergency Contact Name",
  emergencyContactNumber: "Emergency Contact No.", mobileNumber: "Contact No.",
  guardianContact: "Guardian Contact No.", dataPrivacyConsent: "Data Privacy Consent",
  registrationSource: "Registration Source",
};

function StepErrorSummary({ errors, attempted }: { errors: Record<string, { message?: string } | undefined>; attempted: boolean }) {
  if (!attempted) return null;
  const errorEntries = Object.entries(errors).filter(([, v]) => v?.message);
  if (errorEntries.length === 0) return null;
  return (
    <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] px-4 py-3 text-sm font-medium text-[#b91c1c]">
      <strong className="mb-2 block">Please correct the following before continuing:</strong>
      <ul className="ml-5 list-disc space-y-0.5">
        {errorEntries.map(([field, error]) => (
          <li key={field}>{FIELD_LABELS[field] ?? field}: {error?.message ?? "Required"}</li>
        ))}
      </ul>
    </div>
  );
}

function ocrBorderClass(fieldName: string, ocrFilledFields: Set<string>): string {
  return ocrFilledFields.has(fieldName) ? "border-l-[3px] border-l-amber-400" : "";
}

// Shared input class
const inputCls = "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wider text-[#3d2222]";

// Section panel
function SectionPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-4 overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
      style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
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

export default function NewPatientPage() {
  const router = useRouter();
  const { createPatient, loading, error: apiError } = useCreatePatient();
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [currentStep, setCurrentStep] = useState(1);
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);
  const [clinicalNotesOpen, setClinicalNotesOpen] = useState(false);
  const [stepSubmitAttempted, setStepSubmitAttempted] = useState(false);

  // Duplicate patient confirmation dialog state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicatePayload, setDuplicatePayload] = useState<PatientCreatePayload | null>(null);
  const [duplicateConfirming, setDuplicateConfirming] = useState(false);

  const { register, handleSubmit, control, watch, trigger, setValue, formState: { errors } } = useForm<PatientCreateFormValues>({
    resolver: zodResolver(patientCreateSchema),
    mode: "onBlur",
    defaultValues: {
      firstName: "", middleName: undefined, lastName: "", birthDate: "", sex: undefined,
      civilStatus: undefined, householdNumber: undefined, sitioPurok: undefined,
      barangay: pilotDefaults.barangay, municipality: pilotDefaults.municipality, province: pilotDefaults.province,
      occupation: undefined, mobileNumber: undefined, address: "", guardianName: undefined, guardianContact: undefined,
      emergencyContactName: "", emergencyContactNumber: "", philhealthNo: undefined,
      philhealthMemberType: undefined, philhealthCategory: undefined, is4psBeneficiary: false,
      householdId4ps: undefined, isIndigenous: false, placeOfBirth: undefined, mothersMaidenName: undefined,
      isPwd: false, isPregnant: false, seniorIdNumber: undefined, pwdIdNumber: undefined,
      lastMenstrualPeriod: undefined, gravida: undefined, para: undefined, estimatedDueDate: undefined,
      heightCm: undefined, weightKg: undefined, allergies: undefined, knownConditions: undefined,
      registrationSource: "walk_in", registrationDataSource: "manual", dataPrivacyConsent: false,
      bloodType: undefined, confirmDuplicate: false,
    },
  });

  const maskedPhilhealthNo = usePhilHealthMask(register("philhealthNo"));
  const maskedMobileNumber = usePhMobileMask(register("mobileNumber"));
  const maskedEmergencyContactNumber = usePhMobileMask(register("emergencyContactNumber"));
  const maskedGuardianContact = usePhMobileMask(register("guardianContact"));

  const [ocrSource, setOcrSource] = useState(false);
  const [ocrFilledFields, setOcrFilledFields] = useState<Set<string>>(new Set());
  const [ocrLowConfidenceFields, setOcrLowConfidenceFields] = useState<Set<string>>(new Set());
  const [ocrFilledFieldNames, setOcrFilledFieldNames] = useState<Array<keyof PatientCreateFormValues>>([]);

  useEffect(() => { if (apiError) { toast.error(apiError.message); } }, [apiError]);
  useEffect(() => { setStepSubmitAttempted(false); }, [currentStep]);

  const birthDateValue = watch("birthDate") ?? "";
  const isPwdValue = watch("isPwd");
  const isPregnantValue = watch("isPregnant");
  const barangayValue = watch("barangay") ?? pilotDefaults.barangay;
  const municipalityValue = watch("municipality") ?? pilotDefaults.municipality;
  const provinceValue = watch("province") ?? pilotDefaults.province;
  const addressValue = watch("address") ?? "";
  const dataPrivacyConsent = watch("dataPrivacyConsent");
  const currentAge = useMemo(() => computeAge(birthDateValue), [birthDateValue]);
  const showGuardian = currentAge > 0 && (currentAge < 18 || currentAge >= 60 || isPwdValue);
  const showSeniorId = currentAge >= 60;
  const showPwdId = isPwdValue;
  const showPregnancyFields = isPregnantValue;

  const composedAddress = useMemo(() => {
    const parts = [addressValue, barangayValue, municipalityValue, provinceValue].map((p) => p.trim()).filter(Boolean);
    return parts.join(", ");
  }, [addressValue, barangayValue, municipalityValue, provinceValue]);

  function handleOcrAutofill(fields: OcrAutofillFields, lowConfidence: Set<string>) {
    const filledNames: Array<keyof PatientCreateFormValues> = [];
    const mappings: Array<[keyof OcrAutofillFields, keyof PatientCreateFormValues]> = [
      ["firstName", "firstName"], ["middleName", "middleName"], ["lastName", "lastName"],
      ["birthDate", "birthDate"], ["sex", "sex"], ["address", "address"],
      ["philhealthNo", "philhealthNo"], ["bloodType", "bloodType"],
    ];
    for (const [ocrField, formField] of mappings) {
      const value = fields[ocrField];
      if (value !== undefined && value !== null && value !== "") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setValue(formField, value as any, { shouldValidate: true, shouldDirty: true });
        filledNames.push(formField);
      }
    }
    setValue("registrationDataSource", "ocr", { shouldValidate: false });
    setOcrFilledFieldNames(filledNames);
    setOcrFilledFields(new Set(filledNames.map(String)));
    setOcrLowConfidenceFields(lowConfidence);
    setOcrSource(true);
  }

  function handleOcrClear() {
    for (const fieldName of ocrFilledFieldNames) {
      const stringFields = ["firstName", "middleName", "lastName", "birthDate", "address", "philhealthNo", "bloodType"];
      if (stringFields.includes(fieldName as string)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setValue(fieldName, "" as any, { shouldValidate: false });
      }
    }
    if (ocrFilledFieldNames.includes("sex")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue("sex", undefined as any, { shouldValidate: false });
    }
    setValue("registrationDataSource", "manual", { shouldValidate: false });
    setOcrSource(false);
    setOcrFilledFields(new Set());
    setOcrLowConfidenceFields(new Set());
    setOcrFilledFieldNames([]);
  }

  const canSubmitStep = async (step: number) => {
    const fieldsByStep: Record<number, (keyof PatientCreateFormValues)[]> = {
      1: ["firstName", "middleName", "lastName", "birthDate", "sex", "civilStatus", "householdNumber", "sitioPurok", "barangay", "municipality", "province", "occupation", "bloodType", "placeOfBirth", "mothersMaidenName"],
      2: ["mobileNumber", "address", "guardianName", "guardianContact", "emergencyContactName", "emergencyContactNumber"],
      3: ["philhealthNo", "philhealthMemberType", "philhealthCategory", "is4psBeneficiary", "householdId4ps", "isIndigenous", "isPwd", "isPregnant", "seniorIdNumber", "pwdIdNumber", "lastMenstrualPeriod", "gravida", "para", "estimatedDueDate", "heightCm", "weightKg", "allergies", "knownConditions", "registrationSource", "dataPrivacyConsent"],
      4: [],
    };
    return trigger(fieldsByStep[step]);
  };

  const onSubmit: SubmitHandler<PatientCreateFormValues> = async (data) => {
    const payload = {
      ...data,
      firstName: data.firstName.trim(), middleName: data.middleName?.trim() || undefined,
      lastName: data.lastName.trim(), civilStatus: data.civilStatus?.trim() || undefined,
      householdNumber: data.householdNumber?.trim() || undefined, sitioPurok: data.sitioPurok?.trim() || undefined,
      barangay: data.barangay?.trim() || undefined, municipality: data.municipality?.trim() || undefined,
      province: data.province?.trim() || undefined, occupation: data.occupation?.trim() || undefined,
      mobileNumber: data.mobileNumber?.trim() || undefined, address: composedAddress.trim(),
      guardianName: data.guardianName?.trim() || undefined, guardianContact: data.guardianContact?.trim() || undefined,
      emergencyContactName: data.emergencyContactName?.trim() || "",
      emergencyContactNumber: data.emergencyContactNumber?.trim() || "",
      philhealthNo: data.philhealthNo?.trim() || undefined,
      philhealthMemberType: data.philhealthMemberType ?? undefined, philhealthCategory: data.philhealthCategory ?? undefined,
      householdId4ps: data.householdId4ps?.trim() || undefined, placeOfBirth: data.placeOfBirth?.trim() || undefined,
      mothersMaidenName: data.mothersMaidenName?.trim() || undefined, seniorIdNumber: data.seniorIdNumber?.trim() || undefined,
      pwdIdNumber: data.pwdIdNumber?.trim() || undefined, allergies: data.allergies?.trim() || undefined,
      knownConditions: data.knownConditions?.trim() || undefined, registrationSource: data.registrationSource,
      registrationDataSource: data.registrationDataSource ?? "manual", dataPrivacyConsent: data.dataPrivacyConsent,
      bloodType: data.bloodType === "" ? null : (data.bloodType ?? null), confirmDuplicate: false,
    };

    const result = await createPatient(payload);
    if (!result) return;

    if (result.duplicateWarning) {
      if (!isAdmin) {
        toast.error(
          "A patient with a similar name and date of birth already exists. Ask an administrator to review.",
          "Possible duplicate detected",
        );
        return;
      }
      // Store payload and open confirmation dialog — the imperative swConfirm
      // is replaced with a state-driven AlertDialog rendered below.
      setDuplicatePayload({ ...payload, confirmDuplicate: false });
      setShowDuplicateDialog(true);
      return;
    }

    if (result.patient) {
      toast.success("Patient registered successfully.");
      setCreatedPatientId(result.patient.id);
      setShowPhotoPrompt(true);
      setCurrentStep(4);
    }
  };

  async function handleDuplicateConfirm() {
    if (!duplicatePayload) return;
    setDuplicateConfirming(true);
    try {
      const forced = await createPatient({ ...duplicatePayload, confirmDuplicate: true });
      if (forced?.patient) {
        toast.success("Patient registered successfully.");
        setCreatedPatientId(forced.patient.id);
        setShowPhotoPrompt(true);
        setCurrentStep(4);
      }
    } finally {
      setShowDuplicateDialog(false);
      setDuplicatePayload(null);
      setDuplicateConfirming(false);
    }
  }

  if (!mounted) {
    return (
      <div className="mx-auto max-w-[980px] py-8">
        <div className="mb-2 h-10 w-64 animate-pulse rounded-lg bg-[#f4e8e3]" />
        <div className="mb-8 h-5 w-80 animate-pulse rounded bg-[#f4e8e3]" />
        <div className="h-[420px] animate-pulse rounded-xl border border-[#f0e4dd] bg-[#fdf5f0]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[980px]">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Register New Patient</h1>
        <p className="mt-1 text-sm font-medium text-[#7a5252]">
          RHU Patient Record — Sta. Rosa 1 BHS, Patubig, Marilao, Bulacan
        </p>
      </div>

      {/* Step indicator */}
      <SectionPanel>
        <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-4">
          <p className="text-sm font-bold text-[#3d2222]">
            Step {currentStep} of 4: {getStepLabel(currentStep)}
          </p>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step <= currentStep ? "bg-[#b5343e] text-white" : "bg-[#f4e8e3] text-[#7a5252]"}`}
              >
                {step}
              </span>
            ))}
          </div>
        </div>
      </SectionPanel>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>

        {/* ─ Step 1 ─ */}
        {currentStep === 1 && (
          <SectionPanel>
            <SectionHeader title="Identity & Demographics" subtitle="Capture the patient's core identity, location, and demographic context." />
            <div className="p-5">
              <StepErrorSummary errors={errors as Record<string, { message?: string } | undefined>} attempted={stepSubmitAttempted} />

              {ocrSource && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>Fields pre-filled from scanned ID. Review highlighted fields before continuing.</span>
                  <button
                    type="button"
                    onClick={handleOcrClear}
                    className="rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                  >
                    Clear autofill
                  </button>
                </div>
              )}

              <IdScanCard onAutofill={handleOcrAutofill} onClear={handleOcrClear} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="firstName">First Name *</label>
                  <input id="firstName" type="text" {...register("firstName")}
                    className={`${inputCls} ${errors.firstName ? "border-[#fca5a5]" : ""} ${ocrBorderClass("firstName", ocrFilledFields)}`} />
                  {ocrLowConfidenceFields.has("firstName") && <p className="mt-0.5 text-xs text-amber-600">Review this field</p>}
                  <FieldError message={errors.firstName?.message} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="middleName">Middle Name</label>
                  <input id="middleName" type="text" {...register("middleName")}
                    className={`${inputCls} ${ocrBorderClass("middleName", ocrFilledFields)}`} />
                  {ocrLowConfidenceFields.has("middleName") && <p className="mt-0.5 text-xs text-amber-600">Review this field</p>}
                </div>
                <div>
                  <label className={labelCls} htmlFor="lastName">Last Name *</label>
                  <input id="lastName" type="text" {...register("lastName")}
                    className={`${inputCls} ${errors.lastName ? "border-[#fca5a5]" : ""} ${ocrBorderClass("lastName", ocrFilledFields)}`} />
                  {ocrLowConfidenceFields.has("lastName") && <p className="mt-0.5 text-xs text-amber-600">Review this field</p>}
                  <FieldError message={errors.lastName?.message} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="birthDate">Birthday *</label>
                  <input id="birthDate" type="date" max={new Date().toISOString().split("T")[0]} {...register("birthDate")}
                    className={`${inputCls} ${errors.birthDate ? "border-[#fca5a5]" : ""} ${ocrBorderClass("birthDate", ocrFilledFields)}`} />
                  {ocrLowConfidenceFields.has("birthDate") && <p className="mt-0.5 text-xs text-amber-600">Review this field</p>}
                  <FieldError message={errors.birthDate?.message} />
                </div>
                <div>
                  <label className={labelCls}>Age</label>
                  <div className={`${inputCls} flex min-h-[40px] items-center gap-2 bg-[#fdf5f0] text-[#7a5252]`}>
                    {birthDateValue ? `${currentAge} years old` : "—"}
                    {currentAge >= 60 && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[0.625rem] font-bold text-white">SENIOR</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Sex *</label>
                  <Controller
                    name="sex"
                    control={control}
                    render={({ field }) => (
                      <div className="flex gap-4 pt-2">
                        {["male", "female"].map((value) => (
                          <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-[#3d2222]">
                            <input type="radio" checked={field.value === value} onChange={() => field.onChange(value)} className="accent-[#b5343e]" />
                            {value.charAt(0).toUpperCase() + value.slice(1)}
                          </label>
                        ))}
                      </div>
                    )}
                  />
                  <FieldError message={errors.sex?.message} />
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
                <div>
                  <label className={labelCls} htmlFor="householdNumber">Household / Family Number</label>
                  <input id="householdNumber" type="text" {...register("householdNumber")} className={inputCls} placeholder="HH-001" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="occupation">Occupation</label>
                  <input id="occupation" type="text" {...register("occupation")} className={inputCls} placeholder="Farmer, driver, etc." />
                </div>
                <div>
                  <label className={labelCls} htmlFor="placeOfBirth">Place of Birth</label>
                  <input id="placeOfBirth" type="text" {...register("placeOfBirth")} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="mothersMaidenName">Mother's Maiden Name</label>
                  <input id="mothersMaidenName" type="text" {...register("mothersMaidenName")} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="bloodType">Blood Type</label>
                  <select id="bloodType" {...register("bloodType")}
                    className={`${inputCls} ${ocrBorderClass("bloodType", ocrFilledFields)}`}>
                    <option value="">— Unknown —</option>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="sitioPurok">Sitio / Purok</label>
                  <input id="sitioPurok" type="text" {...register("sitioPurok")} className={inputCls} placeholder="Optional" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="barangay">Barangay *</label>
                  <input id="barangay" type="text" {...register("barangay")} className={`${inputCls} ${errors.barangay ? "border-[#fca5a5]" : ""}`} />
                  <FieldError message={errors.barangay?.message} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="municipality">Municipality *</label>
                  <input id="municipality" type="text" {...register("municipality")} className={`${inputCls} ${errors.municipality ? "border-[#fca5a5]" : ""}`} />
                  <FieldError message={errors.municipality?.message} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="province">Province *</label>
                  <input id="province" type="text" {...register("province")} className={`${inputCls} ${errors.province ? "border-[#fca5a5]" : ""}`} />
                  <FieldError message={errors.province?.message} />
                </div>
              </div>
            </div>
          </SectionPanel>
        )}

        {/* ─ Step 2 ─ */}
        {currentStep === 2 && (
          <SectionPanel>
            <SectionHeader title="Contact, Address & Emergency Contact" subtitle="Keep the emergency contact separate from guardian details." />
            <div className="p-5">
              <StepErrorSummary errors={errors as Record<string, { message?: string } | undefined>} attempted={stepSubmitAttempted} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="mobileNumber">Patient Contact No.</label>
                  <input id="mobileNumber" type="tel" {...maskedMobileNumber}
                    className={`${inputCls} ${errors.mobileNumber ? "border-[#fca5a5]" : ""}`} placeholder="09171234567" />
                  <p className="mt-1 text-xs text-[#9b6e6e]">Format: 09XXXXXXXXX or +639XXXXXXXXX</p>
                  <FieldError message={errors.mobileNumber?.message} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="emergencyContactName">Emergency Contact Name *</label>
                  <input id="emergencyContactName" type="text" {...register("emergencyContactName")}
                    className={`${inputCls} ${errors.emergencyContactName ? "border-[#fca5a5]" : ""}`} />
                  <FieldError message={errors.emergencyContactName?.message} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="emergencyContactNumber">Emergency Contact No. *</label>
                  <input id="emergencyContactNumber" type="tel" {...maskedEmergencyContactNumber}
                    className={`${inputCls} ${errors.emergencyContactNumber ? "border-[#fca5a5]" : ""}`} placeholder="09171234567" />
                  <p className="mt-1 text-xs text-[#9b6e6e]">Format: 09XXXXXXXXX or +639XXXXXXXXX</p>
                  <FieldError message={errors.emergencyContactNumber?.message} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="address">Home Address / Landmark *</label>
                  <textarea id="address" rows={4} {...register("address")}
                    className={`${inputCls} resize-y ${errors.address ? "border-[#fca5a5]" : ""}`}
                    placeholder="House no., street, landmark or nearby reference" />
                  <FieldError message={errors.address?.message} />
                  <p className="mt-1 text-xs text-[#9b6e6e]">Combined address: {composedAddress || "—"}</p>
                </div>
              </div>
              {showGuardian ? (
                <div className="mt-4">
                  <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    Guardian details are required for patients under 18, senior citizens (60+), or PWD registrations.
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="guardianName">Guardian Name</label>
                      <input id="guardianName" type="text" {...register("guardianName")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="guardianContact">Guardian Contact No.</label>
                      <input id="guardianContact" type="tel" {...maskedGuardianContact}
                        className={`${inputCls} ${errors.guardianContact ? "border-[#fca5a5]" : ""}`} placeholder="09171234567" />
                      <p className="mt-1 text-xs text-[#9b6e6e]">Format: 09XXXXXXXXX or +639XXXXXXXXX</p>
                      <FieldError message={errors.guardianContact?.message} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm italic text-[#9b6e6e]">
                  Guardian fields appear for patients under 18, senior citizens (60+), or PWD registrations.
                </p>
              )}
            </div>
          </SectionPanel>
        )}

        {/* ─ Step 3 ─ */}
        {currentStep === 3 && (
          <SectionPanel>
            <SectionHeader title="PhilHealth, IDs, Clinical Notes & Consent" subtitle="Capture fields needed for enrollment, referrals, and risk tracking." />
            <div className="p-5">
              <StepErrorSummary errors={errors as Record<string, { message?: string } | undefined>} attempted={stepSubmitAttempted} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>PhilHealth Member Type</label>
                  <Controller
                    name="philhealthMemberType"
                    control={control}
                    render={({ field }) => (
                      <div className="flex gap-4 pt-2">
                        {[{ value: null, label: "None" }, { value: "member", label: "Member" }, { value: "dependent", label: "Dependent" }].map((item) => (
                          <label key={item.label} className="flex cursor-pointer items-center gap-2 text-sm text-[#3d2222]">
                            <input type="radio" checked={field.value === item.value} onChange={() => field.onChange(item.value)} className="accent-[#b5343e]" />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    )}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="philhealthCategory">PhilHealth Category</label>
                  <select id="philhealthCategory" {...register("philhealthCategory")} className={inputCls}>
                    <option value="">— Select —</option>
                    <option value="indigent">Indigent</option>
                    <option value="sponsored">Sponsored</option>
                    <option value="formal_economy">Formal Economy</option>
                    <option value="informal_economy">Informal Economy</option>
                    <option value="lifetime_member">Lifetime Member</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="philhealthNo">PhilHealth No.</label>
                  <input id="philhealthNo" type="text" {...maskedPhilhealthNo}
                    className={`${inputCls} ${ocrBorderClass("philhealthNo", ocrFilledFields)}`} placeholder="12-345678901-2" />
                  {ocrLowConfidenceFields.has("philhealthNo") && <p className="mt-0.5 text-xs text-amber-600">Review this field</p>}
                  <p className="mt-1 text-xs text-[#9b6e6e]">Format: 12-345678901-2 (12 digits)</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="householdId4ps">4Ps Household ID</label>
                  <input id="householdId4ps" type="text" {...register("householdId4ps")} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="registrationSource">Registration Source</label>
                  <select id="registrationSource" {...register("registrationSource")} className={inputCls}>
                    <option value="walk_in">Walk-in</option>
                    <option value="referral">Referral</option>
                    <option value="outreach">Outreach</option>
                    <option value="others">Others</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="heightCm">Baseline Height (cm)</label>
                  <input id="heightCm" type="number" step="0.1" {...register("heightCm", { valueAsNumber: true })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="weightKg">Baseline Weight (kg)</label>
                  <input id="weightKg" type="number" step="0.01" {...register("weightKg", { valueAsNumber: true })} className={inputCls} />
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {[
                  { field: "is4psBeneficiary" as const, label: "4Ps Beneficiary" },
                  { field: "isIndigenous" as const, label: "Indigenous Peoples / IP" },
                  { field: "isPwd" as const, label: "Person with Disability (PWD)" },
                  { field: "isPregnant" as const, label: "Currently Pregnant" },
                ].map(({ field, label }) => (
                  <label key={field} className="flex cursor-pointer items-center gap-3 text-sm font-medium text-[#3d2222]">
                    <input type="checkbox" {...register(field)} className="h-4 w-4 accent-[#b5343e]" />
                    {label}
                  </label>
                ))}
              </div>

              {(showSeniorId || showPwdId || showPregnancyFields) && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {showSeniorId && (
                    <div>
                      <label className={labelCls} htmlFor="seniorIdNumber">Senior ID Number</label>
                      <input id="seniorIdNumber" type="text" {...register("seniorIdNumber")} className={inputCls} />
                    </div>
                  )}
                  {showPwdId && (
                    <div>
                      <label className={labelCls} htmlFor="pwdIdNumber">PWD ID Number</label>
                      <input id="pwdIdNumber" type="text" {...register("pwdIdNumber")} className={inputCls} />
                    </div>
                  )}
                  {showPregnancyFields && (
                    <>
                      <div>
                        <label className={labelCls} htmlFor="lastMenstrualPeriod">Last Menstrual Period</label>
                        <input id="lastMenstrualPeriod" type="date" {...register("lastMenstrualPeriod")} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="estimatedDueDate">Estimated Due Date</label>
                        <input id="estimatedDueDate" type="date" {...register("estimatedDueDate")} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="gravida">Gravida</label>
                        <input id="gravida" type="number" min="0" {...register("gravida", { valueAsNumber: true })} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="para">Para</label>
                        <input id="para" type="number" min="0" {...register("para", { valueAsNumber: true })} className={inputCls} />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="mt-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm text-[#3d2222] leading-relaxed">
                  <input type="checkbox" {...register("dataPrivacyConsent")} className="mt-0.5 h-4 w-4 accent-[#b5343e]" />
                  I confirm that the patient or guardian has consented to the collection and processing of the information above for health center registration and care.
                </label>
                <FieldError message={errors.dataPrivacyConsent?.message} />
              </div>

              <details
                className="mt-4"
                open={clinicalNotesOpen}
                onToggle={(e) => setClinicalNotesOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary className="flex cursor-pointer select-none items-center gap-2 py-2 text-sm font-semibold text-[#3d2222] list-none">
                  <span aria-hidden="true">{clinicalNotesOpen ? "▾" : "▸"}</span>
                  Add clinical notes (optional)
                </summary>
                <div className="mt-3 grid gap-4">
                  <div>
                    <label className={labelCls} htmlFor="allergies">Allergies</label>
                    <textarea id="allergies" rows={3} {...register("allergies")} className={`${inputCls} resize-y`} placeholder="Drug, food, or environmental allergies" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="knownConditions">Known Conditions</label>
                    <textarea id="knownConditions" rows={3} {...register("knownConditions")} className={`${inputCls} resize-y`} placeholder="Chronic conditions, special notes, or relevant history" />
                  </div>
                </div>
              </details>
            </div>
          </SectionPanel>
        )}

        {/* ─ Step 4 ─ */}
        {currentStep === 4 && (
          <SectionPanel>
            <SectionHeader title="Photo & Next Actions" subtitle="Capture or upload the patient's photo, then choose next steps." />
            <div className="p-5">
              {createdPatientId ? (
                <ProfilePhotoUploader patientId={createdPatientId} />
              ) : (
                <p className="text-sm text-[#7a5252]">Complete registration first to enable photo upload.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => router.push("/patients")}
                  className="rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
                  Back to Patients
                </button>
                {createdPatientId && (
                  <>
                    <button type="button" onClick={() => router.push(`/patients/${createdPatientId}`)}
                      className="rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                      style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
                      Open Patient Profile
                    </button>
                    <button type="button" onClick={() => router.push(`/health-cards/${createdPatientId}/print`)}
                      className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] hover:bg-[#fee2e2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b91c1c]">
                      Generate Health Card
                    </button>
                    <button type="button" onClick={() => router.push(`/appointments/new?patientId=${createdPatientId}`)}
                      className="rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
                      Book First Appointment
                    </button>
                  </>
                )}
              </div>

              {createdPatientId && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 leading-relaxed"
                >
                  <strong className="mb-2 block">Background tasks started</strong>
                  <ul className="ml-5 list-disc space-y-1">
                    <li>Welcome SMS will be sent if a mobile number was provided.</li>
                    <li>Health card is queued for generation.</li>
                    <li>Photo reminder is set for 24 hours if no photo is uploaded.</li>
                  </ul>
                </div>
              )}
            </div>
          </SectionPanel>
        )}

        {/* Navigation controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={currentStep === 1 || loading}
            onClick={() => setCurrentStep((v) => Math.max(1, v - 1))}
            className="rounded-lg border border-[#e5d4cc] bg-white px-5 py-2.5 text-sm font-semibold text-[#3d2222] disabled:opacity-40 hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          >
            Back
          </button>
          <div className="flex flex-wrap gap-3">
            <a
              href="/patients"
              className="inline-flex items-center rounded-lg border border-[#e5d4cc] bg-white px-5 py-2.5 text-sm font-medium text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            >
              Cancel
            </a>
            {currentStep < 3 && (
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setStepSubmitAttempted(true);
                  const ok = await canSubmitStep(currentStep);
                  if (ok) { setStepSubmitAttempted(false); setCurrentStep((v) => Math.min(4, v + 1)); }
                }}
                className="rounded-lg px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                style={{ background: loading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}
              >
                Next
              </button>
            )}
            {currentStep === 3 && (
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setStepSubmitAttempted(true);
                  const ok = await canSubmitStep(3);
                  if (ok) { setStepSubmitAttempted(false); await handleSubmit(onSubmit)(); }
                }}
                className="rounded-lg px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                style={{ background: loading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}
              >
                {loading ? "Registering..." : "Register Patient"}
              </button>
            )}
          </div>
        </div>

        {showPhotoPrompt && createdPatientId && (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            Photo upload is available above. You can also return to the patient profile after saving to capture the photo later.
          </div>
        )}
      </form>

      <AlertDialog
        open={showDuplicateDialog}
        title="Possible duplicate detected"
        description="A patient with a similar name and birth date already exists. Register anyway?"
        confirmLabel="Register anyway"
        isDangerous={false}
        loading={duplicateConfirming}
        onConfirm={() => void handleDuplicateConfirm()}
        onCancel={() => { setShowDuplicateDialog(false); setDuplicatePayload(null); }}
      />
    </div>
  );
}
