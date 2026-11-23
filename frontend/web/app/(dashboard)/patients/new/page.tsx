"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Controller, useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarPlus,
  Camera,
  Check,
  CircleCheck,
  CreditCard,
  HeartPulse,
  IdCard,
  MapPinHouse,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCreatePatient } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import ProfilePhotoUploader from "@/app/(dashboard)/patients/_components/ProfilePhotoUploader";
import { toast } from "@/lib/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { IconBadge } from "@/components/dashboard/shared";
import { effectiveAddress, patientRegistrationSchema, PHILHEALTH_CATEGORIES } from "@/lib/schemas/patient";
import type { PatientCreatePayload } from "@/types/patient";
import { usePhilHealthMask, usePhMobileMask } from "@/hooks/useInputMasks";

type PhilhealthCategory = (typeof PHILHEALTH_CATEGORIES)[number];

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
  philhealthCategory: PhilhealthCategory | undefined;
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

const STEPS: Array<{ label: string; hint: string; icon: LucideIcon }> = [
  { label: "Identity", hint: "Name, birth, location", icon: IdCard },
  { label: "Contact", hint: "Phone, address, emergency", icon: MapPinHouse },
  { label: "PhilHealth & health", hint: "Coverage, programs, consent", icon: HeartPulse },
  { label: "Photo", hint: "Photo and next steps", icon: Camera },
];

const CATEGORY_LABELS: Record<PhilhealthCategory, string> = {
  indigent: "Indigent",
  sponsored: "Sponsored",
  formal_economy: "Formal Economy",
  informal_economy: "Informal Economy",
  lifetime_member: "Lifetime Member",
};

/** Names people read, for the "Please correct" list (never code names). */
const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name", middleName: "Middle Name", lastName: "Last Name", birthDate: "Birthday",
  sex: "Sex", civilStatus: "Civil Status", householdNumber: "Household / Family Number",
  sitioPurok: "Sitio / Purok", barangay: "Barangay", municipality: "Municipality", province: "Province",
  occupation: "Occupation", bloodType: "Blood Type", placeOfBirth: "Place of Birth",
  mothersMaidenName: "Mother's Maiden Name", mobileNumber: "Patient Contact No.",
  address: "Home Address / Landmark", guardianName: "Guardian Name", guardianContact: "Guardian Contact No.",
  emergencyContactName: "Emergency Contact Name", emergencyContactNumber: "Emergency Contact No.",
  philhealthNo: "PhilHealth No.", philhealthMemberType: "PhilHealth Member Type",
  philhealthCategory: "PhilHealth Category", is4psBeneficiary: "4Ps Beneficiary", householdId4ps: "4Ps Household ID",
  isIndigenous: "Indigenous Peoples", isPwd: "PWD", isPregnant: "Pregnant", seniorIdNumber: "Senior ID Number",
  pwdIdNumber: "PWD ID Number", lastMenstrualPeriod: "Last Menstrual Period", gravida: "Gravida", para: "Para",
  estimatedDueDate: "Estimated Due Date", heightCm: "Baseline Height", weightKg: "Baseline Weight",
  allergies: "Allergies", knownConditions: "Known Conditions", registrationSource: "Registration Source",
  dataPrivacyConsent: "Data Privacy Consent",
};

const FIELDS_BY_STEP: Record<number, (keyof PatientCreateFormValues)[]> = {
  1: ["firstName", "middleName", "lastName", "birthDate", "sex", "civilStatus", "householdNumber", "sitioPurok", "barangay", "municipality", "province", "occupation", "bloodType", "placeOfBirth", "mothersMaidenName"],
  2: ["mobileNumber", "address", "guardianName", "guardianContact", "emergencyContactName", "emergencyContactNumber"],
  3: ["philhealthNo", "philhealthMemberType", "philhealthCategory", "is4psBeneficiary", "householdId4ps", "isIndigenous", "isPwd", "isPregnant", "seniorIdNumber", "pwdIdNumber", "lastMenstrualPeriod", "gravida", "para", "estimatedDueDate", "heightCm", "weightKg", "allergies", "knownConditions", "registrationSource", "dataPrivacyConsent"],
  4: [],
};

function computeAge(birthDateStr: string): number {
  if (!birthDateStr) return 0;
  const bd = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const monthDelta = today.getMonth() - bd.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < bd.getDate())) age--;
  return Math.max(0, age);
}

// Shared classes
const inputCls =
  "w-full rounded-xl border border-[#e5d4cc] bg-white px-3 py-2.5 text-sm text-[#1a0808] transition placeholder:text-[#c4a8a0] focus-visible:border-[#b5343e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]/30 disabled:cursor-not-allowed disabled:bg-[#f7f0ed] disabled:text-[#a89490]";
const errorInput = "border-[#f0a0a0] bg-[#fffafa]";
const labelCls = "mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5a3a3a]";
const hintCls = "mt-1 text-xs text-[#9b7e7e]";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#b5343e] to-[#c94060] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5343e]";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e5d4cc] bg-white px-5 py-2.5 text-sm font-semibold text-[#3d2222] transition hover:bg-[#fdf5f0] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5343e]";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-start gap-1 text-xs font-medium text-[#c0262d]">
      <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

function Req() {
  return <span className="text-[#b5343e]" aria-hidden="true"> *</span>;
}

function StepErrorSummary({
  errors,
  attempted,
}: {
  errors: Record<string, { message?: string } | undefined>;
  attempted: boolean;
}) {
  if (!attempted) return null;
  const entries = Object.entries(errors).filter(([, v]) => v?.message);
  if (entries.length === 0) return null;
  return (
    <div role="alert" className="mb-5 rounded-2xl border border-[#f5c2c2] bg-[#fef4f4] px-4 py-3.5 text-sm text-[#9f1f26]">
      <p className="mb-1.5 flex items-center gap-2 font-bold">
        <TriangleAlert size={16} aria-hidden="true" />
        Please correct the following before continuing:
      </p>
      <ul className="ml-6 list-disc space-y-0.5">
        {entries.map(([name, error]) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => document.getElementById(name)?.focus()}
              className="text-left underline-offset-2 hover:underline"
            >
              {FIELD_LABELS[name] ?? "This field"}: {error?.message ?? "Required"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[#eadbd3] bg-white shadow-[0_1px_2px_rgba(60,20,20,0.04),0_8px_24px_-12px_rgba(120,40,40,0.12)]">
      {children}
    </div>
  );
}

function CardHeader({ icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#f0e4dd] bg-gradient-to-br from-[#fdf0eb] to-white px-5 py-4">
      <IconBadge icon={icon} tone="rose" size="sm" />
      <div>
        <h2 className="text-sm font-bold text-[#1a0808]">{title}</h2>
        {subtitle && <p className="text-xs text-[#8a6a6a]">{subtitle}</p>}
      </div>
    </div>
  );
}

/** A labelled group inside a step card. */
function Group({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <fieldset className="mb-6 last:mb-0">
      <legend className="mb-3 flex w-full items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#b5343e]">{title}</span>
        <span className="h-px flex-1 bg-[#f0e4dd]" aria-hidden="true" />
        {aside}
      </legend>
      {children}
    </fieldset>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Registration steps" className="mb-5">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map(({ label, hint, icon: Icon }, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li key={label} aria-current={active ? "step" : undefined} className="min-w-0">
              <div
                className={`h-1.5 rounded-full transition-colors ${done || active ? "bg-gradient-to-r from-[#b5343e] to-[#d9606a]" : "bg-[#f0e4dd]"}`}
                aria-hidden="true"
              />
              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset ${
                    done
                      ? "bg-[#b5343e] text-white ring-[#b5343e]"
                      : active
                        ? "bg-white text-[#b5343e] ring-[#b5343e]"
                        : "bg-[#faf4f1] text-[#a88a84] ring-[#eadbd3]"
                  }`}
                >
                  {done ? <Check size={15} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
                </span>
                <div className="hidden min-w-0 sm:block">
                  <p className={`truncate text-sm font-bold ${active ? "text-[#1a0808]" : "text-[#7a5a5a]"}`}>
                    <span className="sr-only">Step {step}: </span>
                    {label}
                  </p>
                  <p className="truncate text-xs text-[#a88a84]">{hint}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm font-semibold text-[#3d2222] sm:hidden">
        Step {current} of 4: {STEPS[current - 1]?.label}
      </p>
    </nav>
  );
}

/** Checkbox drawn as a chip (programs and flags). */
function ToggleChip({ id, label, inputProps }: { id: string; label: string; inputProps: React.InputHTMLAttributes<HTMLInputElement> }) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-[#e5d4cc] bg-white px-3.5 py-2 text-sm font-medium text-[#3d2222] transition hover:border-[#d9a9a0] has-[:checked]:border-[#b5343e] has-[:checked]:bg-[#fdf0eb] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#b5343e]"
    >
      <input id={id} type="checkbox" className="h-4 w-4 accent-[#b5343e]" {...inputProps} />
      {label}
    </label>
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
  const [created, setCreated] = useState<{ id: string; name: string; code?: string } | null>(null);
  const [clinicalNotesOpen, setClinicalNotesOpen] = useState(false);
  const [stepSubmitAttempted, setStepSubmitAttempted] = useState(false);

  // Duplicate patient confirmation dialog state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicatePayload, setDuplicatePayload] = useState<PatientCreatePayload | null>(null);
  const [duplicateConfirming, setDuplicateConfirming] = useState(false);

  const { register, handleSubmit, control, watch, trigger, setValue, clearErrors, formState: { errors } } = useForm<PatientCreateFormValues>({
    // The schema turns empty <select> / number values into undefined (z.preprocess),
    // so zod types its input as unknown; the form values are PatientCreateFormValues.
    resolver: zodResolver(patientRegistrationSchema) as Resolver<PatientCreateFormValues>,
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

  useEffect(() => { if (apiError) { toast.error(apiError.message); } }, [apiError]);
  useEffect(() => { setStepSubmitAttempted(false); }, [currentStep]);

  const birthDateValue = watch("birthDate") ?? "";
  const isPwdValue = watch("isPwd");
  const isPregnantValue = watch("isPregnant");
  const is4psValue = watch("is4psBeneficiary");
  const memberType = watch("philhealthMemberType");
  const hasPhilhealth = memberType === "member" || memberType === "dependent";
  const barangayValue = watch("barangay") ?? pilotDefaults.barangay;
  const municipalityValue = watch("municipality") ?? pilotDefaults.municipality;
  const provinceValue = watch("province") ?? pilotDefaults.province;
  const sitioPurokValue = watch("sitioPurok") ?? "";
  // The "Home Address / Landmark" textarea keeps the form field name `address`
  // (shared schema), but its text is the house no. / street / landmark: it is
  // sent as houseStreet and stored in patients.house_street.
  const addressValue = watch("address") ?? "";
  const currentAge = useMemo(() => computeAge(birthDateValue), [birthDateValue]);
  const showGuardian = currentAge > 0 && (currentAge < 18 || currentAge >= 60 || isPwdValue);
  const showSeniorId = currentAge >= 60;

  // Exactly what the backend will store (same rule as patient_service.compose_address).
  const composedAddress = useMemo(
    () =>
      effectiveAddress({
        houseStreet: addressValue,
        sitioPurok: sitioPurokValue,
        barangay: barangayValue,
        municipality: municipalityValue,
        province: provinceValue,
      }),
    [addressValue, sitioPurokValue, barangayValue, municipalityValue, provinceValue],
  );

  function chooseMemberType(value: "member" | "dependent" | undefined) {
    setValue("philhealthMemberType", value, { shouldDirty: true });
    if (value === undefined) {
      // No PhilHealth: nothing else to fill in, and nothing left over to save.
      setValue("philhealthNo", undefined, { shouldDirty: true });
      setValue("philhealthCategory", undefined, { shouldDirty: true });
      clearErrors(["philhealthNo", "philhealthCategory"]);
    }
    if (stepSubmitAttempted) void trigger(["philhealthNo", "philhealthCategory"]);
  }

  const canSubmitStep = async (step: number) => trigger(FIELDS_BY_STEP[step]);

  function registered(patient: { id: string; firstName?: string; lastName?: string; patientCode?: string }) {
    toast.success("Patient registered successfully.");
    setCreated({
      id: patient.id,
      name: `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() || "The patient",
      code: patient.patientCode,
    });
    setCurrentStep(4);
  }

  const onSubmit: SubmitHandler<PatientCreateFormValues> = async (data) => {
    const payload = {
      ...data,
      firstName: data.firstName.trim(), middleName: data.middleName?.trim() || undefined,
      lastName: data.lastName.trim(), civilStatus: data.civilStatus?.trim() || undefined,
      householdNumber: data.householdNumber?.trim() || undefined, sitioPurok: data.sitioPurok?.trim() || undefined,
      barangay: data.barangay?.trim() || undefined, municipality: data.municipality?.trim() || undefined,
      province: data.province?.trim() || undefined, occupation: data.occupation?.trim() || undefined,
      mobileNumber: data.mobileNumber?.trim() || undefined,
      houseStreet: data.address?.trim() || undefined, address: composedAddress,
      guardianName: data.guardianName?.trim() || undefined, guardianContact: data.guardianContact?.trim() || undefined,
      emergencyContactName: data.emergencyContactName?.trim() || "",
      emergencyContactNumber: data.emergencyContactNumber?.trim() || "",
      philhealthMemberType: data.philhealthMemberType ?? undefined,
      // Without a member type there is no PhilHealth number or category to keep.
      philhealthNo: data.philhealthMemberType ? data.philhealthNo?.trim() || undefined : undefined,
      philhealthCategory: data.philhealthMemberType ? data.philhealthCategory ?? undefined : undefined,
      householdId4ps: data.is4psBeneficiary ? data.householdId4ps?.trim() || undefined : undefined,
      placeOfBirth: data.placeOfBirth?.trim() || undefined,
      mothersMaidenName: data.mothersMaidenName?.trim() || undefined, seniorIdNumber: data.seniorIdNumber?.trim() || undefined,
      pwdIdNumber: data.pwdIdNumber?.trim() || undefined, allergies: data.allergies?.trim() || undefined,
      knownConditions: data.knownConditions?.trim() || undefined, registrationSource: data.registrationSource,
      registrationDataSource: "manual" as const, dataPrivacyConsent: data.dataPrivacyConsent,
      bloodType: data.bloodType ?? null, confirmDuplicate: false,
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
      setDuplicatePayload({ ...payload, confirmDuplicate: false });
      setShowDuplicateDialog(true);
      return;
    }

    if (result.patient) registered(result.patient);
  };

  async function handleDuplicateConfirm() {
    if (!duplicatePayload) return;
    setDuplicateConfirming(true);
    try {
      const forced = await createPatient({ ...duplicatePayload, confirmDuplicate: true });
      if (forced?.patient) registered(forced.patient);
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
        <div className="h-[420px] animate-pulse rounded-2xl border border-[#f0e4dd] bg-[#fdf5f0]" />
      </div>
    );
  }

  const errorMap = errors as Record<string, { message?: string } | undefined>;

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl leading-tight text-[#1a0808]">Register New Patient</h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">
            RHU Patient Record — Sta. Rosa 1 BHS, Patubig, Marilao, Bulacan
          </p>
        </div>
        {currentStep < 4 && (
          <p className="text-xs text-[#9b7e7e]">
            Fields marked <span className="font-bold text-[#b5343e]">*</span> are required.
          </p>
        )}
      </div>

      <Stepper current={currentStep} />

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        {/* ─ Step 1: Identity ─ */}
        {currentStep === 1 && (
          <Card>
            <CardHeader icon={IdCard} title="Identity & Demographics" subtitle="Who the patient is and where they live." />
            <div className="p-5">
              <StepErrorSummary errors={errorMap} attempted={stepSubmitAttempted} />

              <Group title="Name & birth">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className={labelCls} htmlFor="firstName">First Name<Req /></label>
                    <input id="firstName" type="text" autoComplete="off" {...register("firstName")} aria-invalid={!!errors.firstName}
                      className={`${inputCls} ${errors.firstName ? errorInput : ""}`} />
                    <FieldError message={errors.firstName?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="middleName">Middle Name</label>
                    <input id="middleName" type="text" autoComplete="off" {...register("middleName")} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="lastName">Last Name<Req /></label>
                    <input id="lastName" type="text" autoComplete="off" {...register("lastName")} aria-invalid={!!errors.lastName}
                      className={`${inputCls} ${errors.lastName ? errorInput : ""}`} />
                    <FieldError message={errors.lastName?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="birthDate">Birthday<Req /></label>
                    <input id="birthDate" type="date" max={new Date().toISOString().split("T")[0]} {...register("birthDate")}
                      aria-invalid={!!errors.birthDate} className={`${inputCls} ${errors.birthDate ? errorInput : ""}`} />
                    <FieldError message={errors.birthDate?.message} />
                  </div>
                  <div>
                    <span className={labelCls}>Age</span>
                    <div className={`${inputCls} flex min-h-[42px] items-center gap-2 bg-[#fdf7f4] text-[#7a5252]`} aria-live="polite">
                      {birthDateValue ? `${currentAge} years old` : "—"}
                      {currentAge >= 60 && (
                        <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[0.625rem] font-bold text-white">SENIOR</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={labelCls} id="sex-label">Sex<Req /></span>
                    <Controller
                      name="sex"
                      control={control}
                      render={({ field }) => (
                        <div role="radiogroup" aria-labelledby="sex-label" className="grid grid-cols-2 gap-2">
                          {(["male", "female"] as const).map((value) => (
                            <label key={value}
                              className="flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#e5d4cc] bg-white text-sm font-medium text-[#3d2222] transition has-[:checked]:border-[#b5343e] has-[:checked]:bg-[#fdf0eb] has-[:checked]:text-[#b5343e] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#b5343e]">
                              <input id={value === "male" ? "sex" : undefined} type="radio" name="sex" checked={field.value === value}
                                onChange={() => field.onChange(value)} className="sr-only" />
                              {value === "male" ? "Male" : "Female"}
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
                    <label className={labelCls} htmlFor="placeOfBirth">Place of Birth</label>
                    <input id="placeOfBirth" type="text" {...register("placeOfBirth")} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="mothersMaidenName">Mother&apos;s Maiden Name</label>
                    <input id="mothersMaidenName" type="text" {...register("mothersMaidenName")} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="bloodType">Blood Type</label>
                    <select id="bloodType" {...register("bloodType")} className={inputCls}>
                      <option value="">— Not known —</option>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="occupation">Occupation</label>
                    <input id="occupation" type="text" {...register("occupation")} className={inputCls} placeholder="Farmer, driver, etc." />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="householdNumber">Household / Family No.</label>
                    <input id="householdNumber" type="text" {...register("householdNumber")} className={inputCls} placeholder="HH-001" />
                  </div>
                </div>
              </Group>

              <Group title="Location">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={labelCls} htmlFor="sitioPurok">Sitio / Purok</label>
                    <input id="sitioPurok" type="text" {...register("sitioPurok")} className={inputCls} placeholder="Optional" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="barangay">Barangay<Req /></label>
                    <input id="barangay" type="text" {...register("barangay")} aria-invalid={!!errors.barangay} className={`${inputCls} ${errors.barangay ? errorInput : ""}`} />
                    <FieldError message={errors.barangay?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="municipality">Municipality<Req /></label>
                    <input id="municipality" type="text" {...register("municipality")} aria-invalid={!!errors.municipality} className={`${inputCls} ${errors.municipality ? errorInput : ""}`} />
                    <FieldError message={errors.municipality?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="province">Province<Req /></label>
                    <input id="province" type="text" {...register("province")} aria-invalid={!!errors.province} className={`${inputCls} ${errors.province ? errorInput : ""}`} />
                    <FieldError message={errors.province?.message} />
                  </div>
                </div>
              </Group>
            </div>
          </Card>
        )}

        {/* ─ Step 2: Contact ─ */}
        {currentStep === 2 && (
          <Card>
            <CardHeader icon={MapPinHouse} title="Contact, Address & Emergency Contact" subtitle="Keep the emergency contact separate from guardian details." />
            <div className="p-5">
              <StepErrorSummary errors={errorMap} attempted={stepSubmitAttempted} />

              <Group title="Patient">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="mobileNumber">Patient Contact No.</label>
                    <input id="mobileNumber" type="tel" inputMode="tel" {...maskedMobileNumber} aria-invalid={!!errors.mobileNumber}
                      className={`${inputCls} ${errors.mobileNumber ? errorInput : ""}`} placeholder="09171234567" />
                    <p className={hintCls}>For SMS reminders. 09XXXXXXXXX or +639XXXXXXXXX</p>
                    <FieldError message={errors.mobileNumber?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="address">Home Address / Landmark<Req /></label>
                    <textarea id="address" rows={3} maxLength={255} {...register("address")} aria-invalid={!!errors.address}
                      className={`${inputCls} resize-y ${errors.address ? errorInput : ""}`}
                      placeholder="House no., street, landmark or nearby reference" />
                    <FieldError message={errors.address?.message} />
                  </div>
                </div>
                <p className="mt-3 rounded-xl bg-[#fdf7f4] px-3 py-2 text-xs text-[#7a5a5a]">
                  <span className="font-semibold text-[#5a3a3a]">Saved and printed on the health card:</span> {composedAddress || "—"}
                </p>
              </Group>

              <Group title="Emergency contact">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="emergencyContactName">Emergency Contact Name<Req /></label>
                    <input id="emergencyContactName" type="text" {...register("emergencyContactName")} aria-invalid={!!errors.emergencyContactName}
                      className={`${inputCls} ${errors.emergencyContactName ? errorInput : ""}`} />
                    <FieldError message={errors.emergencyContactName?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="emergencyContactNumber">Emergency Contact No.<Req /></label>
                    <input id="emergencyContactNumber" type="tel" inputMode="tel" {...maskedEmergencyContactNumber} aria-invalid={!!errors.emergencyContactNumber}
                      className={`${inputCls} ${errors.emergencyContactNumber ? errorInput : ""}`} placeholder="09171234567" />
                    <FieldError message={errors.emergencyContactNumber?.message} />
                  </div>
                </div>
              </Group>

              {showGuardian ? (
                <Group title="Guardian">
                  <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Add a guardian for patients under 18, senior citizens (60+) and PWD registrations.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="guardianName">Guardian Name</label>
                      <input id="guardianName" type="text" {...register("guardianName")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="guardianContact">Guardian Contact No.</label>
                      <input id="guardianContact" type="tel" inputMode="tel" {...maskedGuardianContact} aria-invalid={!!errors.guardianContact}
                        className={`${inputCls} ${errors.guardianContact ? errorInput : ""}`} placeholder="09171234567" />
                      <FieldError message={errors.guardianContact?.message} />
                    </div>
                  </div>
                </Group>
              ) : (
                <p className="text-xs italic text-[#9b7e7e]">
                  Guardian fields appear for patients under 18, senior citizens (60+), or PWD registrations.
                </p>
              )}
            </div>
          </Card>
        )}

        {/* ─ Step 3: PhilHealth & health ─ */}
        {currentStep === 3 && (
          <Card>
            <CardHeader icon={HeartPulse} title="PhilHealth, Programs & Consent" subtitle="Coverage, benefit programs, baseline measurements and consent." />
            <div className="p-5">
              <StepErrorSummary errors={errorMap} attempted={stepSubmitAttempted} />

              <Group title="PhilHealth">
                <div className="rounded-2xl border border-[#f0e4dd] bg-[#fffaf7] p-4">
                  <span className={labelCls} id="memberType-label">Is the patient covered by PhilHealth?</span>
                  <div role="radiogroup" aria-labelledby="memberType-label" className="grid grid-cols-3 gap-2 sm:max-w-md">
                    {([
                      { value: undefined, label: "None" },
                      { value: "member", label: "Member" },
                      { value: "dependent", label: "Dependent" },
                    ] as const).map((item) => (
                      <label key={item.label}
                        className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[#e5d4cc] bg-white text-sm font-semibold text-[#5a3a3a] transition has-[:checked]:border-[#b5343e] has-[:checked]:bg-[#b5343e] has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#b5343e]">
                        <input type="radio" name="philhealthMemberType" className="sr-only"
                          checked={memberType === item.value} onChange={() => chooseMemberType(item.value)} />
                        {item.label}
                      </label>
                    ))}
                  </div>
                  <p className={hintCls}>
                    {memberType === "member"
                      ? "The patient pays or is sponsored under their own PhilHealth membership."
                      : memberType === "dependent"
                        ? "Covered under a family member's PhilHealth membership."
                        : "No PhilHealth number or category is saved."}
                  </p>

                  <div className={`mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 transition-opacity ${hasPhilhealth ? "" : "opacity-60"}`}>
                    <div>
                      <label className={labelCls} htmlFor="philhealthNo">PhilHealth No.{hasPhilhealth && <Req />}</label>
                      <input id="philhealthNo" type="text" inputMode="numeric" disabled={!hasPhilhealth} {...maskedPhilhealthNo}
                        aria-invalid={!!errors.philhealthNo}
                        className={`${inputCls} ${errors.philhealthNo ? errorInput : ""}`} placeholder="12-345678901-2" />
                      <p className={hintCls}>12 digits, as on the PhilHealth ID or MDR.</p>
                      <FieldError message={errors.philhealthNo?.message} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="philhealthCategory">
                        PhilHealth Category{memberType === "member" && <Req />}
                      </label>
                      <select id="philhealthCategory" disabled={!hasPhilhealth} {...register("philhealthCategory")}
                        aria-invalid={!!errors.philhealthCategory}
                        className={`${inputCls} ${errors.philhealthCategory ? errorInput : ""}`}>
                        <option value="">{memberType === "dependent" ? "— Same as the member (optional) —" : "— Select —"}</option>
                        {PHILHEALTH_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select>
                      <FieldError message={errors.philhealthCategory?.message} />
                    </div>
                  </div>
                </div>
              </Group>

              <Group title="Programs & special groups">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <ToggleChip id="is4psBeneficiary" label="4Ps Beneficiary" inputProps={register("is4psBeneficiary")} />
                  <ToggleChip id="isIndigenous" label="Indigenous Peoples (IP)" inputProps={register("isIndigenous")} />
                  <ToggleChip id="isPwd" label="Person with Disability" inputProps={register("isPwd")} />
                  <ToggleChip id="isPregnant" label="Currently Pregnant" inputProps={register("isPregnant")} />
                </div>

                {(is4psValue || showSeniorId || isPwdValue || isPregnantValue) && (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {is4psValue && (
                      <div>
                        <label className={labelCls} htmlFor="householdId4ps">4Ps Household ID</label>
                        <input id="householdId4ps" type="text" {...register("householdId4ps")} className={inputCls} />
                      </div>
                    )}
                    {showSeniorId && (
                      <div>
                        <label className={labelCls} htmlFor="seniorIdNumber">Senior ID Number</label>
                        <input id="seniorIdNumber" type="text" {...register("seniorIdNumber")} className={inputCls} />
                      </div>
                    )}
                    {isPwdValue && (
                      <div>
                        <label className={labelCls} htmlFor="pwdIdNumber">PWD ID Number</label>
                        <input id="pwdIdNumber" type="text" {...register("pwdIdNumber")} className={inputCls} />
                      </div>
                    )}
                    {isPregnantValue && (
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
              </Group>

              <Group title="Visit details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                    <input id="heightCm" type="number" step="0.1" inputMode="decimal" {...register("heightCm", { valueAsNumber: true })} className={inputCls} />
                    <FieldError message={errors.heightCm?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="weightKg">Baseline Weight (kg)</label>
                    <input id="weightKg" type="number" step="0.01" inputMode="decimal" {...register("weightKg", { valueAsNumber: true })} className={inputCls} />
                    <FieldError message={errors.weightKg?.message} />
                  </div>
                </div>

                <details
                  className="mt-4 rounded-xl border border-[#f0e4dd]"
                  open={clinicalNotesOpen}
                  onToggle={(e) => setClinicalNotesOpen((e.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary className="flex min-h-11 cursor-pointer select-none list-none items-center gap-2 px-4 text-sm font-semibold text-[#3d2222]">
                    <span aria-hidden="true" className="text-[#b5343e]">{clinicalNotesOpen ? "▾" : "▸"}</span>
                    Allergies and known conditions (optional)
                  </summary>
                  <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
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
              </Group>

              <div className={`rounded-2xl border p-4 ${errors.dataPrivacyConsent ? "border-[#f0a0a0] bg-[#fffafa]" : "border-teal-200 bg-teal-50/60"}`}>
                <label htmlFor="dataPrivacyConsent" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-[#2a3a38]">
                  <input id="dataPrivacyConsent" type="checkbox" {...register("dataPrivacyConsent")} className="mt-1 h-4 w-4 shrink-0 accent-[#b5343e]" />
                  <span>
                    <span className="mb-0.5 flex items-center gap-1.5 font-bold text-teal-900">
                      <ShieldCheck size={15} aria-hidden="true" /> Data privacy consent<Req />
                    </span>
                    I confirm that the patient or guardian has consented to the collection and processing of the information above for health center registration and care.
                  </span>
                </label>
                <FieldError message={errors.dataPrivacyConsent?.message} />
              </div>
            </div>
          </Card>
        )}

        {/* ─ Step 4: Photo & next ─ */}
        {currentStep === 4 && (
          <>
            {created ? (
              <div className="dash-rise mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-5 py-4" role="status">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <CircleCheck size={22} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl text-[#12312a]">{created.name} is registered</p>
                  <p className="text-sm text-emerald-900/80">
                    {created.code ? <>Patient code <strong>{created.code}</strong> · </> : null}
                    A welcome SMS goes out if a mobile number was given.
                  </p>
                </div>
              </div>
            ) : (
              <p className="mb-4 text-sm text-[#7a5252]">Complete registration first to add a photo.</p>
            )}

            {created && <ProfilePhotoUploader patientId={created.id} autoStartPhone />}

            {created && (
              <Card>
                <CardHeader icon={UserRound} title="What next?" subtitle="The photo can also be added later from the patient profile." />
                <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                  {([
                    { label: "Open patient profile", icon: UserRound, href: `/patients/${created.id}`, primary: true },
                    { label: "Health card", icon: CreditCard, href: `/health-cards/${created.id}/print` },
                    { label: "Book first appointment", icon: CalendarPlus, href: `/appointments/new?patientId=${created.id}` },
                    { label: "Register another", icon: UserPlus, href: "/patients/new", reload: true },
                  ] as const).map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => ("reload" in action ? window.location.assign(action.href) : router.push(action.href))}
                      className={`group flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5343e] ${
                        "primary" in action
                          ? "border-transparent bg-gradient-to-br from-[#b5343e] to-[#c94060] text-white shadow-sm hover:brightness-105"
                          : "border-[#e5d4cc] bg-white text-[#3d2222] hover:border-[#d9a9a0] hover:bg-[#fdf5f0]"
                      }`}
                    >
                      <action.icon size={18} aria-hidden="true" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* Navigation */}
        {currentStep < 4 && (
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e4dd] bg-[#fbf6f2]/95 px-1 py-3 backdrop-blur">
            <button
              type="button"
              disabled={currentStep === 1 || loading}
              onClick={() => setCurrentStep((v) => Math.max(1, v - 1))}
              className={secondaryBtn}
            >
              Back
            </button>
            <div className="flex flex-wrap gap-3">
              <Link href="/patients" className={secondaryBtn}>
                Cancel
              </Link>
              {currentStep < 3 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setStepSubmitAttempted(true);
                    const ok = await canSubmitStep(currentStep);
                    if (ok) { setStepSubmitAttempted(false); setCurrentStep((v) => Math.min(4, v + 1)); }
                  }}
                  className={primaryBtn}
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
                  className={primaryBtn}
                >
                  {loading ? "Registering..." : "Register Patient"}
                </button>
              )}
            </div>
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
