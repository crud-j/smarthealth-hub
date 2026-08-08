"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreatePatient } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import ProfilePhotoUploader from "@/app/(dashboard)/patients/_components/ProfilePhotoUploader";
import { swConfirm, swError, swSuccess } from "@/lib/swal";
import {
  patientCreateSchema,
} from "@/lib/schemas/patient";
import type { PatientCreatePayload } from "@/types/patient";
import { usePhilHealthMask, usePhMobileMask } from "@/hooks/useInputMasks";
import IdScanCard from "@/components/forms/IdScanCard";
import type { OcrAutofillFields } from "@/components/forms/IdScanCard";

type PatientCreateFormValues = Omit<
  PatientCreatePayload,
  "confirmDuplicate"
> & {
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
  philhealthCategory:
    | "indigent"
    | "sponsored"
    | "formal_economy"
    | "informal_economy"
    | "lifetime_member"
    | undefined;
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

const pilotDefaults = {
  barangay: "Patubig",
  municipality: "Marilao",
  province: "Bulacan",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "#e5d4cc",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  color: "#1a0808",
  background: "white",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#3d2222",
  marginBottom: "0.25rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const errorStyle: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "0.75rem",
  marginTop: "0.25rem",
};

const sectionStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5d4cc",
  borderRadius: "1rem",
  padding: "1.5rem",
  marginBottom: "1.25rem",
  boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: "#1a0808",
  marginBottom: "1rem",
  paddingBottom: "0.5rem",
  borderBottom: "1px solid #f0e4dd",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderLeft: "3px solid #b5343e",
  paddingLeft: "0.75rem",
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

function getStepLabel(step: number): string {
  switch (step) {
    case 1:
      return "Identity";
    case 2:
      return "Contact";
    case 3:
      return "Clinical";
    case 4:
      return "Photo";
    default:
      return "";
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p style={errorStyle}>{message}</p>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={sectionHeadingStyle}>{title}</div>
      {subtitle ? (
        <p style={{ margin: 0, color: "#8a6464", fontSize: "0.8rem" }}>{subtitle}</p>
      ) : null}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  birthDate: "Birthday",
  sex: "Sex",
  barangay: "Barangay",
  municipality: "Municipality",
  province: "Province",
  address: "Complete Address",
  emergencyContactName: "Emergency Contact Name",
  emergencyContactNumber: "Emergency Contact No.",
  mobileNumber: "Contact No.",
  guardianContact: "Guardian Contact No.",
  dataPrivacyConsent: "Data Privacy Consent",
  registrationSource: "Registration Source",
};

function StepErrorSummary({
  errors,
  attempted,
}: {
  errors: Record<string, { message?: string } | undefined>;
  attempted: boolean;
}) {
  if (!attempted) return null;
  const errorEntries = Object.entries(errors).filter(([, v]) => v?.message);
  if (errorEntries.length === 0) return null;

  return (
    <div
      role="alert"
      style={{
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        borderRadius: "0.5rem",
        padding: "0.75rem 1rem",
        marginBottom: "1rem",
        fontSize: "0.8125rem",
        color: "#991b1b",
      }}
    >
      <strong style={{ display: "block", marginBottom: "0.375rem" }}>
        Please correct the following before continuing:
      </strong>
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {errorEntries.map(([field, error]) => (
          <li key={field}>
            {FIELD_LABELS[field] ?? field}: {error?.message ?? "Required"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Returns amber left-border style when a field was autofilled by OCR. */
function ocrHighlightStyle(
  fieldName: string,
  ocrFilledFields: Set<string>,
  ocrLowConfidenceFields: Set<string>,
  baseStyle: React.CSSProperties = {}
): React.CSSProperties {
  if (ocrFilledFields.has(fieldName)) {
    return {
      ...baseStyle,
      borderLeftWidth: "3px",
      borderLeftStyle: "solid",
      borderLeftColor: "#f59e0b",
    };
  }
  return baseStyle;
}

export default function NewPatientPage() {
  const router = useRouter();
  const { createPatient, loading, error: apiError } = useCreatePatient();
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  // Defer render until after hydration so browser form-autofill extensions cannot
  // inject attributes (e.g. fdprocessedid) that cause server/client HTML mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [currentStep, setCurrentStep] = useState(1);
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);
  // Controls the clinical notes <details> section in Step 3.
  // Persists expanded state when user navigates back from Step 3.
  const [clinicalNotesOpen, setClinicalNotesOpen] = useState(false);
  // Tracks whether the "Next" / "Register Patient" button has been clicked
  // (used to show the per-step error summary).
  const [stepSubmitAttempted, setStepSubmitAttempted] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<PatientCreateFormValues>({
    resolver: zodResolver(patientCreateSchema),
    mode: "onBlur",
    defaultValues: {
      firstName: "",
      middleName: undefined,
      lastName: "",
      birthDate: "",
      sex: undefined,
      civilStatus: undefined,
      householdNumber: undefined,
      sitioPurok: undefined,
      barangay: pilotDefaults.barangay,
      municipality: pilotDefaults.municipality,
      province: pilotDefaults.province,
      occupation: undefined,
      mobileNumber: undefined,
      address: "",
      guardianName: undefined,
      guardianContact: undefined,
      emergencyContactName: "",
      emergencyContactNumber: "",
      philhealthNo: undefined,
      philhealthMemberType: undefined,
      philhealthCategory: undefined,
      is4psBeneficiary: false,
      householdId4ps: undefined,
      isIndigenous: false,
      placeOfBirth: undefined,
      mothersMaidenName: undefined,
      isPwd: false,
      isPregnant: false,
      seniorIdNumber: undefined,
      pwdIdNumber: undefined,
      lastMenstrualPeriod: undefined,
      gravida: undefined,
      para: undefined,
      estimatedDueDate: undefined,
      heightCm: undefined,
      weightKg: undefined,
      allergies: undefined,
      knownConditions: undefined,
      registrationSource: "walk_in",
      registrationDataSource: "manual",
      dataPrivacyConsent: false,
      bloodType: undefined,
      confirmDuplicate: false,
    },
  });

  // Input mask instances — wrap register() for specific fields
  const maskedPhilhealthNo = usePhilHealthMask(register("philhealthNo"));
  const maskedMobileNumber = usePhMobileMask(register("mobileNumber"));
  const maskedEmergencyContactNumber = usePhMobileMask(register("emergencyContactNumber"));
  const maskedGuardianContact = usePhMobileMask(register("guardianContact"));

  // OCR autofill state
  const [ocrSource, setOcrSource] = useState(false);
  const [ocrFilledFields, setOcrFilledFields] = useState<Set<string>>(new Set());
  const [ocrLowConfidenceFields, setOcrLowConfidenceFields] = useState<Set<string>>(new Set());
  // Tracks which form fields were set by OCR autofill (for clearing)
  const [ocrFilledFieldNames, setOcrFilledFieldNames] = useState<Array<keyof PatientCreateFormValues>>([]);

  useEffect(() => {
    if (apiError) {
      void swError(apiError.message);
    }
  }, [apiError]);

  // Reset the "submit attempted" flag whenever the user moves to a different step,
  // so the error summary does not show stale errors from the previous step.
  useEffect(() => {
    setStepSubmitAttempted(false);
  }, [currentStep]);

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
    const parts = [addressValue, barangayValue, municipalityValue, provinceValue]
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.join(", ");
  }, [addressValue, barangayValue, municipalityValue, provinceValue]);

  // ---------------------------------------------------------------------------
  // OCR autofill handlers
  // ---------------------------------------------------------------------------

  function handleOcrAutofill(fields: OcrAutofillFields, lowConfidence: Set<string>) {
    const filledNames: Array<keyof PatientCreateFormValues> = [];

    // Map OcrAutofillFields to form field names and call setValue
    const mappings: Array<[keyof OcrAutofillFields, keyof PatientCreateFormValues]> = [
      ["firstName", "firstName"],
      ["middleName", "middleName"],
      ["lastName", "lastName"],
      ["birthDate", "birthDate"],
      ["sex", "sex"],
      ["address", "address"],
      ["philhealthNo", "philhealthNo"],
      ["bloodType", "bloodType"],
    ];

    for (const [ocrField, formField] of mappings) {
      const value = fields[ocrField];
      if (value !== undefined && value !== null && value !== "") {
        // Use type assertion because the field types differ (string vs enum)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setValue(formField, value as any, { shouldValidate: true, shouldDirty: true });
        filledNames.push(formField);
      }
    }

    // Set registration_data_source to "ocr"
    setValue("registrationDataSource", "ocr", { shouldValidate: false });

    setOcrFilledFieldNames(filledNames);
    setOcrFilledFields(new Set(filledNames.map(String)));
    setOcrLowConfidenceFields(lowConfidence);
    setOcrSource(true);
  }

  function handleOcrClear() {
    // Reset each field that was set by OCR
    for (const fieldName of ocrFilledFieldNames) {
      // Use empty string or undefined based on the field type
      const stringFields = ["firstName", "middleName", "lastName", "birthDate", "address", "philhealthNo", "bloodType"];
      if (stringFields.includes(fieldName as string)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setValue(fieldName, "" as any, { shouldValidate: false });
      }
    }
    // Reset sex separately (typed field)
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
      1: [
        "firstName",
        "middleName",
        "lastName",
        "birthDate",
        "sex",
        "civilStatus",
        "householdNumber",
        "sitioPurok",
        "barangay",
        "municipality",
        "province",
        "occupation",
        "bloodType",
        "placeOfBirth",
        "mothersMaidenName",
      ],
      2: [
        "mobileNumber",
        "address",
        "guardianName",
        "guardianContact",
        "emergencyContactName",
        "emergencyContactNumber",
      ],
      3: [
        "philhealthNo",
        "philhealthMemberType",
        "philhealthCategory",
        "is4psBeneficiary",
        "householdId4ps",
        "isIndigenous",
        "isPwd",
        "isPregnant",
        "seniorIdNumber",
        "pwdIdNumber",
        "lastMenstrualPeriod",
        "gravida",
        "para",
        "estimatedDueDate",
        "heightCm",
        "weightKg",
        "allergies",
        "knownConditions",
        "registrationSource",
        "dataPrivacyConsent",
      ],
      4: [],
    };

    return trigger(fieldsByStep[step]);
  };

  const onSubmit: SubmitHandler<PatientCreateFormValues> = async (data) => {
    const payload = {
      ...data,
      firstName: data.firstName.trim(),
      middleName: data.middleName?.trim() || undefined,
      lastName: data.lastName.trim(),
      civilStatus: data.civilStatus?.trim() || undefined,
      householdNumber: data.householdNumber?.trim() || undefined,
      sitioPurok: data.sitioPurok?.trim() || undefined,
      barangay: data.barangay?.trim() || undefined,
      municipality: data.municipality?.trim() || undefined,
      province: data.province?.trim() || undefined,
      occupation: data.occupation?.trim() || undefined,
      mobileNumber: data.mobileNumber?.trim() || undefined,
      address: composedAddress.trim(),
      guardianName: data.guardianName?.trim() || undefined,
      guardianContact: data.guardianContact?.trim() || undefined,
      emergencyContactName: data.emergencyContactName?.trim() || "",
      emergencyContactNumber: data.emergencyContactNumber?.trim() || "",
      philhealthNo: data.philhealthNo?.trim() || undefined,
      philhealthMemberType: data.philhealthMemberType ?? undefined,
      philhealthCategory: data.philhealthCategory ?? undefined,
      householdId4ps: data.householdId4ps?.trim() || undefined,
      placeOfBirth: data.placeOfBirth?.trim() || undefined,
      mothersMaidenName: data.mothersMaidenName?.trim() || undefined,
      seniorIdNumber: data.seniorIdNumber?.trim() || undefined,
      pwdIdNumber: data.pwdIdNumber?.trim() || undefined,
      allergies: data.allergies?.trim() || undefined,
      knownConditions: data.knownConditions?.trim() || undefined,
      registrationSource: data.registrationSource,
      registrationDataSource: data.registrationDataSource ?? "manual",
      dataPrivacyConsent: data.dataPrivacyConsent,
      bloodType: data.bloodType ?? null,
      confirmDuplicate: false,
    };

    const result = await createPatient(payload);
    if (!result) return;

    if (result.duplicateWarning) {
      if (!isAdmin) {
        void swError(
          "A patient with a similar name and date of birth already exists. Ask an administrator to review and register if this is a different person.",
          "Possible duplicate detected"
        );
        return;
      }

      const confirm = await swConfirm({
        title: "Possible duplicate detected",
        text: "A patient with a similar name and birth date already exists. Register anyway?",
        confirmLabel: "Register anyway",
        isDangerous: false,
      });
      if (!confirm.isConfirmed) return;

      const forced = await createPatient({ ...payload, confirmDuplicate: true });
      if (forced?.patient) {
        void swSuccess("Patient registered successfully.");
        setCreatedPatientId(forced.patient.id);
        setShowPhotoPrompt(true);
        setCurrentStep(4);
        return;
      }
      return;
    }

    if (result.patient) {
      void swSuccess("Patient registered successfully.");
      setCreatedPatientId(result.patient.id);
      setShowPhotoPrompt(true);
      setCurrentStep(4);
    }
  };

  if (!mounted) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "2rem 0" }}>
        <div style={{ height: 40, width: 260, background: "#f4e8e3", borderRadius: "0.5rem", marginBottom: "0.5rem" }} />
        <div style={{ height: 20, width: 320, background: "#f4e8e3", borderRadius: "0.375rem", marginBottom: "2rem" }} />
        <div style={{ height: 420, background: "#fdf5f0", borderRadius: "1rem", border: "1px solid #f0e4dd" }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontFamily: "var(--font-dm-serif, Georgia, serif)", fontWeight: 400, color: "#1a0808", marginBottom: "0.25rem" }}>
          Register New Patient
        </h1>
        <p style={{ color: "#7a5252", fontSize: "0.875rem" }}>
          RHU Patient Record — Sta. Rosa 1 BHS, Patubig, Marilao, Bulacan
        </p>
      </div>

      <div style={{ ...sectionStyle, marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ fontSize: "0.875rem", color: "#3d2222", fontWeight: 700 }}>
            Step {currentStep} of 4: {getStepLabel(currentStep)}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                style={{
                  padding: "0.35rem 0.65rem",
                  borderRadius: "9999px",
                  background: step <= currentStep ? "#b5343e" : "#f4e8e3",
                  color: step <= currentStep ? "white" : "#7a5252",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {step}
              </span>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        {currentStep === 1 && (
          <div style={sectionStyle}>
            <SectionTitle title="Identity & Demographics" subtitle="Capture the patient's core identity, location, and demographic context." />
            <StepErrorSummary errors={errors as Record<string, { message?: string } | undefined>} attempted={stepSubmitAttempted} />

            {/* OCR info banner — shown when autofill has been applied */}
            {ocrSource && (
              <div
                style={{
                  background: "#fefce8",
                  border: "1px solid #fde047",
                  borderRadius: "0.5rem",
                  padding: "0.625rem 1rem",
                  marginBottom: "0.75rem",
                  fontSize: "0.8125rem",
                  color: "#713f12",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  Fields pre-filled from scanned ID. Review highlighted fields before continuing.
                </span>
                <button
                  type="button"
                  onClick={handleOcrClear}
                  style={{
                    background: "none",
                    border: "1px solid #ca8a04",
                    borderRadius: "0.375rem",
                    color: "#713f12",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.625rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  Clear autofill
                </button>
              </div>
            )}

            {/* ID scan card — shown at the top of Step 1 */}
            <IdScanCard onAutofill={handleOcrAutofill} onClear={handleOcrClear} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="firstName">First Name *</label>
                <input id="firstName" type="text" {...register("firstName")} style={{ ...inputStyle, borderColor: errors.firstName ? "#fca5a5" : "#e5d4cc", ...ocrHighlightStyle("firstName", ocrFilledFields, ocrLowConfidenceFields) }} />
                {ocrLowConfidenceFields.has("firstName") && (
                  <small style={{ color: "#b45309", fontSize: "0.7rem" }}>Review this field</small>
                )}
                <FieldError message={errors.firstName?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="middleName">Middle Name</label>
                <input id="middleName" type="text" {...register("middleName")} style={{ ...inputStyle, ...ocrHighlightStyle("middleName", ocrFilledFields, ocrLowConfidenceFields) }} />
                {ocrLowConfidenceFields.has("middleName") && (
                  <small style={{ color: "#b45309", fontSize: "0.7rem" }}>Review this field</small>
                )}
              </div>
              <div>
                <label style={labelStyle} htmlFor="lastName">Last Name *</label>
                <input id="lastName" type="text" {...register("lastName")} style={{ ...inputStyle, borderColor: errors.lastName ? "#fca5a5" : "#e5d4cc", ...ocrHighlightStyle("lastName", ocrFilledFields, ocrLowConfidenceFields) }} />
                {ocrLowConfidenceFields.has("lastName") && (
                  <small style={{ color: "#b45309", fontSize: "0.7rem" }}>Review this field</small>
                )}
                <FieldError message={errors.lastName?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="birthDate">Birthday *</label>
                <input id="birthDate" type="date" max={new Date().toISOString().split("T")[0]} {...register("birthDate")} style={{ ...inputStyle, borderColor: errors.birthDate ? "#fca5a5" : "#e5d4cc", ...ocrHighlightStyle("birthDate", ocrFilledFields, ocrLowConfidenceFields) }} />
                {ocrLowConfidenceFields.has("birthDate") && (
                  <small style={{ color: "#b45309", fontSize: "0.7rem" }}>Review this field</small>
                )}
                <FieldError message={errors.birthDate?.message} />
              </div>
              <div>
                <label style={labelStyle}>Age</label>
                <div style={{ ...inputStyle, background: "#fdf5f0", color: "#7a5252", display: "flex", alignItems: "center", minHeight: 40 }}>
                  {birthDateValue ? `${currentAge} years old` : "—"}
                  {currentAge >= 60 ? (
                    <span style={{ marginLeft: "0.5rem", padding: "0.125rem 0.375rem", background: "#8b5cf6", color: "white", borderRadius: "9999px", fontSize: "0.625rem", fontWeight: 700 }}>SENIOR</span>
                  ) : null}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Sex *</label>
                <Controller
                  name="sex"
                  control={control}
                  render={({ field }) => (
                    <div style={{ display: "flex", gap: "1rem", paddingTop: "0.5rem", flexWrap: "wrap" }}>
                      {["male", "female"].map((value) => (
                        <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}>
                          <input type="radio" checked={field.value === value} onChange={() => field.onChange(value)} />
                          {value.charAt(0).toUpperCase() + value.slice(1)}
                        </label>
                      ))}
                    </div>
                  )}
                />
                <FieldError message={errors.sex?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="civilStatus">Civil Status</label>
                <select id="civilStatus" {...register("civilStatus")} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="householdNumber">Household / Family Number</label>
                <input id="householdNumber" type="text" {...register("householdNumber")} style={inputStyle} placeholder="HH-001" />
              </div>
              <div>
                <label style={labelStyle} htmlFor="occupation">Occupation</label>
                <input id="occupation" type="text" {...register("occupation")} style={inputStyle} placeholder="Farmer, driver, etc." />
              </div>
              <div>
                <label style={labelStyle} htmlFor="placeOfBirth">Place of Birth</label>
                <input id="placeOfBirth" type="text" {...register("placeOfBirth")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="mothersMaidenName">Mother's Maiden Name</label>
                <input id="mothersMaidenName" type="text" {...register("mothersMaidenName")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="bloodType">Blood Type</label>
                <select id="bloodType" {...register("bloodType")} style={{ ...inputStyle, ...ocrHighlightStyle("bloodType", ocrFilledFields, ocrLowConfidenceFields) }}>
                  <option value="">— Unknown —</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="sitioPurok">Sitio / Purok</label>
                <input id="sitioPurok" type="text" {...register("sitioPurok")} style={inputStyle} placeholder="Optional" />
              </div>
              <div>
                <label style={labelStyle} htmlFor="barangay">Barangay *</label>
                <input id="barangay" type="text" {...register("barangay")} style={{ ...inputStyle, borderColor: errors.barangay ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.barangay?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="municipality">Municipality *</label>
                <input id="municipality" type="text" {...register("municipality")} style={{ ...inputStyle, borderColor: errors.municipality ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.municipality?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="province">Province *</label>
                <input id="province" type="text" {...register("province")} style={{ ...inputStyle, borderColor: errors.province ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.province?.message} />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div style={sectionStyle}>
            <SectionTitle title="Contact, Address & Emergency Contact" subtitle="Keep the emergency contact separate from guardian details." />
            <StepErrorSummary errors={errors as Record<string, { message?: string } | undefined>} attempted={stepSubmitAttempted} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="mobileNumber">Patient Contact No.</label>
                <input id="mobileNumber" type="tel" {...maskedMobileNumber} style={{ ...inputStyle, borderColor: errors.mobileNumber ? "#fca5a5" : "#e5d4cc" }} placeholder="09171234567" />
                <small style={{ color: "#9b6e6e", fontSize: "0.7rem" }}>Format: 09XXXXXXXXX or +639XXXXXXXXX</small>
                <FieldError message={errors.mobileNumber?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="emergencyContactName">Emergency Contact Name *</label>
                <input id="emergencyContactName" type="text" {...register("emergencyContactName")} style={{ ...inputStyle, borderColor: errors.emergencyContactName ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.emergencyContactName?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="emergencyContactNumber">Emergency Contact No. *</label>
                <input id="emergencyContactNumber" type="tel" {...maskedEmergencyContactNumber} style={{ ...inputStyle, borderColor: errors.emergencyContactNumber ? "#fca5a5" : "#e5d4cc" }} placeholder="09171234567" />
                <small style={{ color: "#9b6e6e", fontSize: "0.7rem" }}>Format: 09XXXXXXXXX or +639XXXXXXXXX</small>
                <FieldError message={errors.emergencyContactNumber?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="address">Home Address / Landmark *</label>
                <textarea id="address" rows={4} {...register("address")} style={{ ...inputStyle, resize: "vertical", borderColor: errors.address ? "#fca5a5" : "#e5d4cc" }} placeholder="House no., street, landmark or nearby reference" />
                <FieldError message={errors.address?.message} />
                <p style={{ fontSize: "0.75rem", color: "#9b6e6e", marginTop: "0.25rem" }}>
                  Combined address preview: {composedAddress || "—"}
                </p>
              </div>
            </div>
            {showGuardian ? (
              <div style={{ marginTop: "1rem" }}>
                <p style={{ color: "#92400e", fontSize: "0.8rem", margin: "0 0 0.75rem", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "0.375rem", padding: "0.5rem 0.75rem" }}>
                  Guardian details are required for patients under 18, senior citizens (60+), or PWD registrations.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
                  <div>
                    <label style={labelStyle} htmlFor="guardianName">Guardian Name</label>
                    <input id="guardianName" type="text" {...register("guardianName")} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="guardianContact">Guardian Contact No.</label>
                    <input id="guardianContact" type="tel" {...maskedGuardianContact} style={{ ...inputStyle, borderColor: errors.guardianContact ? "#fca5a5" : "#e5d4cc" }} placeholder="09171234567" />
                    <small style={{ color: "#9b6e6e", fontSize: "0.7rem" }}>Format: 09XXXXXXXXX or +639XXXXXXXXX</small>
                    <FieldError message={errors.guardianContact?.message} />
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ marginTop: "1rem", color: "#9b6e6e", fontSize: "0.8rem", fontStyle: "italic" }}>
                Guardian fields appear for patients under 18, senior citizens (60+), or PWD registrations. Enter the patient&apos;s birth date and check PWD status in Step 1 to unlock these fields.
              </p>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div style={sectionStyle}>
            <SectionTitle title="PhilHealth, IDs, Clinical Notes & Consent" subtitle="Capture the fields needed for enrollment, referrals, and risk tracking." />
            <StepErrorSummary errors={errors as Record<string, { message?: string } | undefined>} attempted={stepSubmitAttempted} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="philhealthMemberType">PhilHealth Member Type</label>
                <Controller
                  name="philhealthMemberType"
                  control={control}
                  render={({ field }) => (
                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", paddingTop: "0.5rem" }}>
                      {[
                        { value: null, label: "None" },
                        { value: "member", label: "Member" },
                        { value: "dependent", label: "Dependent" },
                      ].map((item) => (
                        <label key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}>
                          <input type="radio" checked={field.value === item.value} onChange={() => field.onChange(item.value)} />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  )}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="philhealthCategory">PhilHealth Category</label>
                <select id="philhealthCategory" {...register("philhealthCategory")} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="indigent">Indigent</option>
                  <option value="sponsored">Sponsored</option>
                  <option value="formal_economy">Formal Economy</option>
                  <option value="informal_economy">Informal Economy</option>
                  <option value="lifetime_member">Lifetime Member</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="philhealthNo">PhilHealth No.</label>
                <input id="philhealthNo" type="text" {...maskedPhilhealthNo} style={{ ...inputStyle, ...ocrHighlightStyle("philhealthNo", ocrFilledFields, ocrLowConfidenceFields) }} placeholder="12-345678901-2" />
                {ocrLowConfidenceFields.has("philhealthNo") && (
                  <small style={{ color: "#b45309", fontSize: "0.7rem" }}>Review this field</small>
                )}
                <small style={{ color: "#9b6e6e", fontSize: "0.7rem" }}>Format: 12-345678901-2 (12 digits)</small>
              </div>
              <div>
                <label style={labelStyle} htmlFor="householdId4ps">4Ps Household ID</label>
                <input id="householdId4ps" type="text" {...register("householdId4ps")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="registrationSource">Registration Source</label>
                <select id="registrationSource" {...register("registrationSource")} style={inputStyle}>
                  <option value="walk_in">Walk-in</option>
                  <option value="referral">Referral</option>
                  <option value="outreach">Outreach</option>
                  <option value="others">Others</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="heightCm">Baseline Height (cm)</label>
                <input id="heightCm" type="number" step="0.1" {...register("heightCm", { valueAsNumber: true })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="weightKg">Baseline Weight (kg)</label>
                <input id="weightKg" type="number" step="0.01" {...register("weightKg", { valueAsNumber: true })} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginTop: "1rem", display: "grid", gap: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "#3d2222" }}>
                <input type="checkbox" {...register("is4psBeneficiary")} style={{ width: 18, height: 18 }} />
                <span><strong>4Ps Beneficiary</strong></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "#3d2222" }}>
                <input type="checkbox" {...register("isIndigenous")} style={{ width: 18, height: 18 }} />
                <span><strong>Indigenous Peoples / IP</strong></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "#3d2222" }}>
                <input type="checkbox" {...register("isPwd")} style={{ width: 18, height: 18 }} />
                <span><strong>Person with Disability (PWD)</strong></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "#3d2222" }}>
                <input type="checkbox" {...register("isPregnant")} style={{ width: 18, height: 18 }} />
                <span><strong>Currently Pregnant</strong></span>
              </label>
            </div>

            <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
              {showSeniorId ? (
                <div>
                  <label style={labelStyle} htmlFor="seniorIdNumber">Senior ID Number</label>
                  <input id="seniorIdNumber" type="text" {...register("seniorIdNumber")} style={inputStyle} />
                </div>
              ) : null}
              {showPwdId ? (
                <div>
                  <label style={labelStyle} htmlFor="pwdIdNumber">PWD ID Number</label>
                  <input id="pwdIdNumber" type="text" {...register("pwdIdNumber")} style={inputStyle} />
                </div>
              ) : null}
              {showPregnancyFields ? (
                <>
                  <div>
                    <label style={labelStyle} htmlFor="lastMenstrualPeriod">Last Menstrual Period</label>
                    <input id="lastMenstrualPeriod" type="date" {...register("lastMenstrualPeriod")} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="estimatedDueDate">Estimated Due Date</label>
                    <input id="estimatedDueDate" type="date" {...register("estimatedDueDate")} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="gravida">Gravida</label>
                    <input id="gravida" type="number" min="0" {...register("gravida", { valueAsNumber: true })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="para">Para</label>
                    <input id="para" type="number" min="0" {...register("para", { valueAsNumber: true })} style={inputStyle} />
                  </div>
                </>
              ) : null}
            </div>

            <div style={{ marginTop: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.875rem", color: "#3d2222", lineHeight: 1.45 }}>
                <input type="checkbox" {...register("dataPrivacyConsent")} style={{ width: 18, height: 18, marginRight: 10, verticalAlign: "middle" }} />
                I confirm that the patient or guardian has consented to the collection and processing of the information above for health center registration and care.
              </label>
              <FieldError message={errors.dataPrivacyConsent?.message} />
            </div>

            <details
              style={{ marginTop: "1rem" }}
              open={clinicalNotesOpen}
              onToggle={(e) => setClinicalNotesOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  color: "#3d2222",
                  fontSize: "0.875rem",
                  userSelect: "none",
                  padding: "0.5rem 0",
                  listStyleType: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{clinicalNotesOpen ? "▾" : "▸"}</span>
                Add clinical notes (optional)
              </summary>
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "1rem" }}>
                <div>
                  <label style={labelStyle} htmlFor="allergies">Allergies</label>
                  <textarea id="allergies" rows={3} {...register("allergies")} style={{ ...inputStyle, resize: "vertical" }} placeholder="Drug, food, or environmental allergies" />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="knownConditions">Known Conditions</label>
                  <textarea id="knownConditions" rows={3} {...register("knownConditions")} style={{ ...inputStyle, resize: "vertical" }} placeholder="Chronic conditions, special notes, or relevant history" />
                </div>
              </div>
            </details>
          </div>
        )}

        {currentStep === 4 && (
          <div style={sectionStyle}>
            <SectionTitle title="Photo & Next Actions" subtitle="After saving, capture or upload the patient's photo using the existing photo endpoint." />
            {createdPatientId ? (
              <ProfilePhotoUploader patientId={createdPatientId} />
            ) : (
              <p style={{ margin: 0, color: "#7a5252" }}>Complete registration first to enable photo upload.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
              <button type="button" onClick={() => router.push("/patients")} style={{ padding: "0.625rem 1.25rem", border: "1px solid #e5d4cc", borderRadius: "0.375rem", background: "white", color: "#3d2222", fontWeight: 600 }}>
                Back to Patients
              </button>
              {createdPatientId ? (
                <>
                  <button type="button" onClick={() => router.push(`/patients/${createdPatientId}`)} style={{ padding: "0.625rem 1.25rem", border: "none", borderRadius: "0.375rem", background: "linear-gradient(135deg, #b5343e, #c94060)", color: "white", fontWeight: 700 }}>
                    Open Patient Profile
                  </button>
                  <button type="button" onClick={() => router.push(`/health-cards/${createdPatientId}/print`)} style={{ padding: "0.625rem 1.25rem", border: "none", borderRadius: "0.375rem", background: "#fdf2f2", color: "#b91c1c", fontWeight: 700 }}>
                    Generate Health Card
                  </button>
                  <button type="button" onClick={() => router.push(`/appointments/new?patientId=${createdPatientId}`)} style={{ padding: "0.625rem 1.25rem", border: "1px solid #e5d4cc", borderRadius: "0.375rem", background: "white", color: "#3d2222", fontWeight: 600 }}>
                    Book First Appointment
                  </button>
                </>
              ) : null}
            </div>

            {/* Background tasks banner — shown only after successful registration */}
            {createdPatientId && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "0.875rem 1rem",
                  borderRadius: "0.75rem",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  color: "#166534",
                  fontSize: "0.8125rem",
                  lineHeight: 1.6,
                }}
                role="status"
                aria-live="polite"
              >
                <strong style={{ display: "block", marginBottom: "0.375rem" }}>
                  Background tasks started
                </strong>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  <li>Welcome SMS will be sent if a mobile number was provided.</li>
                  <li>Health card is queued for generation.</li>
                  <li>Photo reminder is set for 24 hours if no photo is uploaded.</li>
                </ul>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", paddingTop: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" disabled={currentStep === 1 || loading} onClick={async () => setCurrentStep((value) => Math.max(1, value - 1))} style={{ padding: "0.625rem 1.25rem", border: "1px solid #e5d4cc", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: 600, color: "#3d2222", background: "white" }}>
            Back
          </button>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a href="/patients" style={{ padding: "0.625rem 1.25rem", border: "1px solid #e5d4cc", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: 500, color: "#3d2222", textDecoration: "none", background: "white" }}>
              Cancel
            </a>
            {currentStep < 3 ? (
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setStepSubmitAttempted(true);
                  const ok = await canSubmitStep(currentStep);
                  if (ok) {
                    setStepSubmitAttempted(false);
                    setCurrentStep((value) => Math.min(4, value + 1));
                  }
                }}
                style={{ padding: "0.625rem 1.5rem", background: loading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)", color: "white", border: "none", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}
              >
                Next
              </button>
            ) : currentStep === 3 ? (
              <button type="button" disabled={loading} onClick={async () => {
                setStepSubmitAttempted(true);
                const ok = await canSubmitStep(3);
                if (ok) {
                  setStepSubmitAttempted(false);
                  await handleSubmit(onSubmit)();
                }
              }} style={{ padding: "0.625rem 1.5rem", background: loading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)", color: "white", border: "none", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Registering..." : "Register Patient"}
              </button>
            ) : null}
          </div>
        </div>

        {showPhotoPrompt && createdPatientId ? (
          <div style={{ marginTop: "1rem", padding: "0.9rem 1rem", borderRadius: "0.75rem", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", fontSize: "0.875rem" }}>
            Photo upload is available above. You can also return to the patient profile after saving to capture the photo later.
          </div>
        ) : null}
      </form>
    </div>
  );
}
