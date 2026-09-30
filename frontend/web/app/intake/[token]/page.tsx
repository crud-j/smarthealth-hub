"use client";
/**
 * Public pre-visit intake form — 6-step form.
 * URL: /intake/{token}
 * Auth: None (public — no JWT required)
 *
 * Step 1 — Visit Purpose
 * Step 2 — Identity & Demographics
 * Step 3 — Contact & Address
 * Step 4 — Health Profile & PhilHealth
 * Step 5 — Visit Details (purpose-specific fields)
 * Step 6 — Consent
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Swal from "sweetalert2";
import {
  Activity,
  Apple,
  Baby,
  Bandage,
  CheckCircle2,
  ClipboardList,
  Droplets,
  FlaskConical,
  HeartPulse,
  PenLine,
  Pill,
  SmilePlus,
  Stethoscope,
  Syringe,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { patientIntakeSchema } from "@/lib/schemas/patient";
import type { PatientIntakeFormValues } from "@/lib/schemas/patient";
import { useDraftIntake, useSaveDraft } from "@/hooks/useIntake";
import { PurposeDetailsForm } from "@/components/intake/PurposeDetailsForm";
import type { PurposeDetails, VisitPurposeValue } from "@/types/intake";
import { getPurposeSchema } from "@/lib/schemas/intake-purpose";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  primary: "#b5343e",
  primaryDark: "#921f28",
  primaryBg: "#fdf2f3",
  primaryBorder: "#e8b4b8",
  text: "#1a0808",
  textMuted: "#6b4f4f",
  textSubtle: "#9c8080",
  border: "#e8ddd9",
  borderFocus: "#b5343e",
  surface: "#ffffff",
  surfaceAlt: "#faf7f7",
  success: "#166534",
  successBg: "#f0fdf4",
  successBorder: "#bbf7d0",
  error: "#991b1b",
  errorBg: "#fff1f2",
  errorBorder: "#fca5a5",
};

// ---------------------------------------------------------------------------
// Shared style objects
// ---------------------------------------------------------------------------

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.5625rem 0.75rem",
  border: `1px solid ${C.border}`,
  borderRadius: "0.5rem",
  fontSize: "0.9375rem",
  color: C.text,
  background: C.surface,
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  fontFamily: "inherit",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: C.textMuted,
  marginBottom: "0.3125rem",
  letterSpacing: "0.01em",
};

const errMsg: React.CSSProperties = {
  color: C.error,
  fontSize: "0.75rem",
  marginTop: "0.25rem",
};

const card: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: "1rem",
  padding: "1.5rem",
  marginBottom: "1rem",
  boxShadow: "0 1px 4px rgba(90,30,30,0.06), 0 4px 16px rgba(90,30,30,0.04)",
};

const sectionDivider: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: C.textSubtle,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  marginTop: "1.5rem",
  marginBottom: "0.75rem",
  paddingBottom: "0.5rem",
  borderBottom: `1px solid ${C.border}`,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: "0.875rem",
};

// ---------------------------------------------------------------------------
// Visit purpose definitions
// ---------------------------------------------------------------------------

interface VisitPurposeOption {
  value: string;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

const VISIT_PURPOSES: VisitPurposeOption[] = [
  {
    value: "General Consultation",
    label: "General Consultation",
    hint: "Check-up, illness, or general concern",
    Icon: Stethoscope,
  },
  {
    value: "Immunization / Vaccination",
    label: "Immunization",
    hint: "Vaccines for children and adults",
    Icon: Syringe,
  },
  {
    value: "Prenatal / Maternal Care",
    label: "Prenatal / Maternal",
    hint: "Prenatal check-up and maternal health",
    Icon: Baby,
  },
  {
    value: "Family Planning",
    label: "Family Planning",
    hint: "Contraception counseling and services",
    Icon: Users,
  },
  {
    value: "Dental Services",
    label: "Dental Services",
    hint: "Tooth extraction, oral exam",
    Icon: SmilePlus,
  },
  {
    value: "TB-DOTS Program",
    label: "TB-DOTS Program",
    hint: "Tuberculosis treatment follow-up",
    Icon: Pill,
  },
  {
    value: "Child Health / Growth Monitoring",
    label: "Child Health",
    hint: "Growth monitoring and child wellness",
    Icon: TrendingUp,
  },
  {
    value: "Hypertension / BP Monitoring",
    label: "Hypertension / BP",
    hint: "Blood pressure check and management",
    Icon: HeartPulse,
  },
  {
    value: "Diabetes Management",
    label: "Diabetes",
    hint: "Blood sugar monitoring and care",
    Icon: Droplets,
  },
  {
    value: "Wound Care / Dressing",
    label: "Wound Care",
    hint: "Wound dressing and minor procedures",
    Icon: Bandage,
  },
  {
    value: "Nutrition Counseling",
    label: "Nutrition",
    hint: "Dietary guidance and nutrition program",
    Icon: Apple,
  },
  {
    value: "Senior Citizens Health Check",
    label: "Senior Health Check",
    hint: "Health assessment for senior citizens",
    Icon: UserCheck,
  },
  {
    value: "Medical Certificate",
    label: "Medical Certificate",
    hint: "Certificate for work, school, or legal use",
    Icon: ClipboardList,
  },
  {
    value: "Others",
    label: "Others",
    hint: "Any other health service or concern",
    Icon: PenLine,
  },
];

const STEP_TITLES: Record<number, string> = {
  1: "Visit Purpose",
  2: "Personal Info",
  3: "Contact & Address",
  4: "Health Profile",
  5: "Visit Details",
  6: "Consent",
};

const TOTAL_STEPS = 6;

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p style={errMsg}>{message}</p>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p style={sectionDivider}>{children}</p>;
}

function computeAge(s: string): number {
  if (!s) return 0;
  const bd = new Date(s);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return Math.max(0, age);
}

// ---------------------------------------------------------------------------
// PurposeChip — shown at top of steps 2–5
// ---------------------------------------------------------------------------

function PurposeChip({ value }: { value: string }) {
  const opt = VISIT_PURPOSES.find((o) => o.value === value);
  if (!opt) return null;
  const { Icon } = opt;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4375rem",
        background: C.primaryBg,
        border: `1px solid ${C.primaryBorder}`,
        borderRadius: "2rem",
        padding: "0.3125rem 0.875rem 0.3125rem 0.625rem",
        fontSize: "0.8125rem",
        fontWeight: 600,
        color: C.primary,
        marginBottom: "1rem",
      }}
    >
      <Icon size={15} strokeWidth={2} color={C.primary} />
      <span>{opt.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "0.875rem",
        padding: "1rem 1.25rem",
        marginBottom: "1rem",
        boxShadow: "0 1px 4px rgba(90,30,30,0.05)",
      }}
    >
      {/* Step label row */}
      <div style={{ marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: C.text }}>
          Step {current} of {total}
        </span>
        <span style={{ fontSize: "0.8125rem", color: C.textMuted, marginLeft: "0.375rem" }}>
          — {STEP_TITLES[current]}
        </span>
      </div>

      {/* Numbered step dots with labels underneath */}
      <div
        style={{
          display: "flex",
          gap: "0",
          alignItems: "flex-start",
          overflowX: "auto",
          paddingBottom: "0.25rem",
        }}
      >
        {Array.from({ length: total }, (_, i) => i + 1).map((s, idx) => {
          const done = s < current;
          const active = s === current;
          const isLast = idx === total - 1;
          return (
            <div
              key={s}
              style={{
                display: "flex",
                flexDirection: "column" as const,
                alignItems: "center",
                flex: isLast ? "0 0 auto" : "1 1 0",
                minWidth: 0,
              }}
            >
              {/* Connector + dot row */}
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                {/* Left connector line */}
                {idx > 0 && (
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      background: done || active ? C.primary : C.border,
                      transition: "background 0.2s",
                    }}
                  />
                )}
                <div
                  title={STEP_TITLES[s]}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: done ? C.success : active ? C.primary : C.surfaceAlt,
                    border: `1.5px solid ${done ? C.success : active ? C.primary : C.border}`,
                    color: done || active ? "#fff" : C.textSubtle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    transition: "background 0.2s, border-color 0.2s",
                    flexShrink: 0,
                  }}
                >
                  {done ? <CheckCircle2 size={14} strokeWidth={2.5} /> : s}
                </div>
                {/* Right connector line */}
                {!isLast && (
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      background: s < current ? C.primary : C.border,
                      transition: "background 0.2s",
                    }}
                  />
                )}
              </div>
              {/* Step title label */}
              <span
                style={{
                  fontSize: "0.625rem",
                  fontWeight: active ? 700 : 500,
                  color: active ? C.primary : done ? C.success : C.textSubtle,
                  marginTop: "0.25rem",
                  textAlign: "center" as const,
                  lineHeight: 1.2,
                  maxWidth: 60,
                  whiteSpace: "normal" as const,
                  wordBreak: "break-word" as const,
                }}
              >
                {STEP_TITLES[s]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 3,
          background: C.surfaceAlt,
          borderRadius: 2,
          overflow: "hidden",
          marginTop: "0.625rem",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${((current - 1) / (total - 1)) * 100}%`,
            background: C.primary,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purpose selection card
// ---------------------------------------------------------------------------

function PurposeCard({
  opt,
  selected,
  onSelect,
}: {
  opt: VisitPurposeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const { Icon } = opt;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="purpose-card"
      data-selected={selected ? "true" : undefined}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "0.875rem 1rem",
        border: `1.5px solid ${selected ? C.primary : C.border}`,
        borderRadius: "0.75rem",
        background: selected ? C.primaryBg : C.surface,
        color: selected ? C.primary : C.text,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        boxShadow: selected
          ? `0 0 0 3px rgba(181,52,62,0.1), 0 1px 4px rgba(90,30,30,0.06)`
          : "0 1px 3px rgba(90,30,30,0.04)",
        transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s, transform 0.1s",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          marginTop: "0.0625rem",
          color: selected ? C.primary : C.textMuted,
          transition: "color 0.15s",
        }}
      >
        <Icon size={20} strokeWidth={selected ? 2 : 1.5} />
      </span>
      <span>
        <span
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: selected ? 700 : 500,
            lineHeight: 1.3,
            marginBottom: "0.125rem",
            transition: "font-weight 0.15s",
          }}
        >
          {opt.label}
        </span>
        <span
          style={{
            display: "block",
            fontSize: "0.75rem",
            color: selected ? C.primary : C.textSubtle,
            lineHeight: 1.4,
            transition: "color 0.15s",
          }}
        >
          {opt.hint}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Nav buttons
// ---------------------------------------------------------------------------

function NavButtons({
  step,
  total,
  onBack,
  onNext,
  submitting,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => void | Promise<void>;
  submitting?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: step === 1 ? "flex-end" : "space-between",
        gap: "0.75rem",
        paddingTop: "0.75rem",
      }}
    >
      {step > 1 && (
        <button
          type="button"
          onClick={onBack}
          className="nav-btn-back"
          style={{
            padding: "0.625rem 1.25rem",
            border: `1.5px solid ${C.border}`,
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: C.textMuted,
            background: C.surface,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "border-color 0.15s, color 0.15s, transform 0.1s",
          }}
        >
          Back
        </button>
      )}
      {step < total ? (
        <button
          type="button"
          onClick={() => void onNext()}
          className="nav-btn-primary"
          style={{
            padding: "0.625rem 1.625rem",
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s, transform 0.1s",
          }}
        >
          Continue
        </button>
      ) : (
        <button
          type="submit"
          disabled={submitting}
          className="nav-btn-primary"
          style={{
            padding: "0.625rem 1.625rem",
            background: submitting ? "#b97" : C.primary,
            color: "#fff",
            border: "none",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s, transform 0.1s",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            opacity: submitting ? 0.75 : 1,
          }}
        >
          {submitting && (
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                border: "2px solid rgba(255,255,255,0.35)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
                flexShrink: 0,
              }}
            />
          )}
          {submitting ? "Submitting…" : "Submit My Information"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dev-only test data constant
// ---------------------------------------------------------------------------

const TEST_INTAKE_DATA: PatientIntakeFormValues = {
  firstName: "Juan",
  middleName: "Santos",
  lastName: "dela Cruz",
  birthDate: "1990-05-15",
  sex: "male",
  civilStatus: "Single",
  bloodType: "O+",
  householdNumber: "123",
  sitioPurok: "Purok 1",
  barangay: "Patubig",
  municipality: "Marilao",
  province: "Bulacan",
  placeOfBirth: "Meycauayan, Bulacan",
  mothersMaidenName: "Rosa Santos dela Cruz",
  occupation: "Farmer",
  philhealthNo: "12-345678901-2",
  philhealthMemberType: "member",
  philhealthCategory: "informal_economy",
  mobileNumber: "09171234567",
  address: "123 Purok 1, Patubig, Marilao, Bulacan 3013",
  emergencyContactName: "Maria dela Cruz",
  emergencyContactNumber: "09281234567",
  guardianName: null,
  guardianContact: null,
  is4psBeneficiary: false,
  householdId4ps: null,
  isIndigenous: false,
  isPwd: false,
  pwdIdNumber: null,
  seniorIdNumber: null,
  isPregnant: false,
  lastMenstrualPeriod: null,
  estimatedDueDate: null,
  gravida: null,
  para: null,
  heightCm: 165,
  weightKg: 68.5,
  allergies: "None",
  knownConditions: "Hypertension",
  registrationSource: "walk_in",
  registrationDataSource: "pre_visit",
  dataPrivacyConsent: false, // left unchecked — user must tick it
  confirmDuplicate: false,
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function IntakePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? null;

  const { data: intakeData, loading: loadingToken, error: tokenError } = useDraftIntake(token);
  const { saveDraft, loading: savingDraft, error: saveError } = useSaveDraft(token);

  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [testDataLoaded, setTestDataLoaded] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Visit purpose — outside Zod schema, merged at submit
  const [visitPurpose, setVisitPurpose] = useState("");
  const [visitPurposeOther, setVisitPurposeOther] = useState("");
  const [purposeErr, setPurposeErr] = useState("");
  const [purposeDetails, setPurposeDetails] = useState<Partial<PurposeDetails>>({});
  const [purposeDetailsErrors, setPurposeDetailsErrors] = useState<Record<string, string>>({});

  // Extra fields not in PatientCreate Zod schema
  const [suffix, setSuffix] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("");

  const {
    register,
    control,
    watch,
    trigger,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientIntakeFormValues>({
    resolver: zodResolver(patientIntakeSchema),
    mode: "onBlur",
    defaultValues: {
      firstName: "",
      lastName: "",
      birthDate: "",
      barangay: "Patubig",
      municipality: "Marilao",
      province: "Bulacan",
      emergencyContactName: "",
      emergencyContactNumber: "",
      address: "",
      is4psBeneficiary: false,
      isIndigenous: false,
      isPwd: false,
      isPregnant: false,
      registrationSource: "walk_in",
      registrationDataSource: "pre_visit",
      dataPrivacyConsent: false,
      confirmDuplicate: false,
    },
  });

  const birthDate = watch("birthDate") ?? "";
  const isPwd = watch("isPwd");
  const isPregnant = watch("isPregnant");
  const is4ps = watch("is4psBeneficiary");
  const philhealthNo = watch("philhealthNo") ?? "";
  const emergencyContactName = watch("emergencyContactName") ?? "";

  const age = useMemo(() => computeAge(birthDate), [birthDate]);
  const showGuardian = age > 0 && (age < 18 || age >= 60 || isPwd);
  const showSeniorId = age >= 60;
  const showPregnancy = isPregnant || visitPurpose === "Prenatal / Maternal Care";
  const showPhilhealthCategory = philhealthNo.trim().length > 0;
  const showEmergencyRel = emergencyContactName.trim().length > 0;

  useEffect(() => {
    if (intakeData?.visit_purpose) {
      setVisitPurpose(intakeData.visit_purpose);
    }
    if (intakeData?.purpose_details) {
      const { visit_purpose: _vp, ...details } = intakeData.purpose_details as Record<string, unknown>;
      setPurposeDetails(details as Partial<PurposeDetails>);
    }
  }, [intakeData]);

  // stepFields maps each step to the RHF field names that MUST pass before
  // advancing.  Only include fields that are truly required in the schema or
  // have format validators (e.g. optional PH mobile).  Optional-only fields
  // that carry no schema constraint are omitted to avoid false negatives.
  const stepFields: Record<number, (keyof PatientIntakeFormValues)[]> = {
    1: [],
    2: ["firstName", "lastName", "birthDate", "sex", "barangay", "municipality", "province"],
    3: ["address", "mobileNumber", "emergencyContactNumber"],
    4: ["heightCm", "weightKg", "gravida", "para"],
    5: [],
    6: ["dataPrivacyConsent"],
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!visitPurpose) { setPurposeErr("Please select your reason for visiting."); return; }
      if (visitPurpose === "Others" && !visitPurposeOther.trim()) { setPurposeErr("Please describe your reason."); return; }
      setPurposeErr("");
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (currentStep === 5) {
      if (!visitPurpose) {
        setCurrentStep(6);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const schema = getPurposeSchema(visitPurpose as VisitPurposeValue);
      const result = schema.safeParse({
        visit_purpose: visitPurpose,
        ...purposeDetails,
      });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = issue.path.join(".");
          fieldErrors[key] = issue.message;
        }
        setPurposeDetailsErrors(fieldErrors);
        // Scroll to the first error field
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setPurposeDetailsErrors({});
      setCurrentStep(6);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Steps 2, 3, 4 — trigger field-level validation before advancing.
    // trigger() calls the zod resolver on the listed fields and populates
    // formState.errors so inline <FieldError> components become visible.
    const ok = await trigger(stepFields[currentStep]);
    if (ok) {
      setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Scroll up so the user can see the first error, which is near the top of the card.
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => setCurrentStep((s) => Math.max(1, s - 1));

  // Dev-only: fill all form fields with realistic test data so the full
  // submission flow can be exercised without manual typing.
  const handleFillTestData = () => {
    reset(TEST_INTAKE_DATA);
    setVisitPurpose("Hypertension / BP Monitoring");
    setVisitPurposeOther("");
    setSuffix("");
    setEmergencyRel("Spouse");
    setPurposeDetails({});
    setPurposeDetailsErrors({});
    setPurposeErr("");
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Show transient toast — clear any previous timer
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setTestDataLoaded(true);
    toastTimerRef.current = setTimeout(() => setTestDataLoaded(false), 3000);
  };

  // onFormInvalid: called by handleSubmit when zod validation fails at submit
  // time.  With step-level trigger() guarding each "Continue" click, all
  // required fields should be valid before the user reaches step 6.  This
  // handler is a last-resort fallback — it scrolls to the top of the current
  // step so any inline <FieldError> elements are visible.  No modal redirect.
  const onFormInvalid = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit: SubmitHandler<PatientIntakeFormValues> = async (data) => {
    const payload: Record<string, unknown> = {
      first_name: data.firstName,
      middle_name: data.middleName ?? null,
      last_name: data.lastName,
      suffix: suffix.trim() || null,
      birth_date: data.birthDate,
      sex: data.sex,
      civil_status: data.civilStatus ?? null,
      blood_type: data.bloodType ?? null,
      place_of_birth: data.placeOfBirth ?? null,
      mothers_maiden_name: data.mothersMaidenName ?? null,
      occupation: data.occupation ?? null,
      barangay: data.barangay,
      municipality: data.municipality,
      province: data.province,
      sitio_purok: data.sitioPurok ?? null,
      household_number: data.householdNumber ?? null,
      mobile_number: data.mobileNumber ?? null,
      address: data.address,
      emergency_contact_name: data.emergencyContactName ?? null,
      emergency_contact_number: data.emergencyContactNumber ?? null,
      emergency_contact_relationship: emergencyRel.trim() || null,
      guardian_name: data.guardianName ?? null,
      guardian_contact: data.guardianContact ?? null,
      philhealth_no: data.philhealthNo ?? null,
      philhealth_member_type: data.philhealthMemberType ?? null,
      philhealth_category: data.philhealthCategory ?? null,
      is_4ps_beneficiary: data.is4psBeneficiary,
      household_id_4ps: data.householdId4ps ?? null,
      is_indigenous: data.isIndigenous,
      is_pwd: data.isPwd,
      pwd_id_number: data.pwdIdNumber ?? null,
      is_pregnant: data.isPregnant,
      senior_id_number: data.seniorIdNumber ?? null,
      last_menstrual_period: data.lastMenstrualPeriod ?? null,
      gravida: data.gravida ?? null,
      para: data.para ?? null,
      estimated_due_date: data.estimatedDueDate ?? null,
      height_cm: data.heightCm ?? null,
      weight_kg: data.weightKg ?? null,
      allergies: data.allergies ?? null,
      known_conditions: data.knownConditions ?? null,
      registration_source: data.registrationSource,
      registration_data_source: "pre_visit",
      data_privacy_consent: data.dataPrivacyConsent,
      confirm_duplicate: false,
      visit_purpose: visitPurpose || null,
      visit_purpose_other: visitPurpose === "Others" ? visitPurposeOther.trim() || null : null,
      purpose_details: visitPurpose ? { visit_purpose: visitPurpose, ...purposeDetails } : null,
      data_capture_date: new Date().toISOString().split("T")[0],
    };

    Swal.fire({
      title: "Submitting…",
      text: "Please wait while we save your information.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const saved = await saveDraft(payload);
      if (!saved) {
        throw new Error("Failed to save your information. Please check your connection and try again.");
      }

      await Swal.fire({
        icon: "success",
        title: "Form Submitted!",
        html: `
          <p style="color:#374151;line-height:1.6;">
            Your information has been received successfully.<br/>
            Health center staff will review your details and complete your registration when you arrive.
          </p>
          <p style="color:#6b7280;font-size:0.85rem;margin-top:0.75rem;">
            Please bring a valid government ID (PhilID, PhilHealth card, or UMID).
          </p>
        `,
        confirmButtonColor: "#b5343e",
        confirmButtonText: "Done",
        allowOutsideClick: false,
      });

      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      await Swal.fire({
        icon: "error",
        title: "Submission Failed",
        text: message,
        confirmButtonColor: "#b5343e",
        confirmButtonText: "Try Again",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Gate states
  // ---------------------------------------------------------------------------

  if (tokenError || (intakeData === null && !loadingToken && token)) {
    return (
      <div style={{ maxWidth: 560, margin: "5rem auto", padding: "2rem 1.25rem", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff1f2", border: "1px solid #fecdd3", margin: "0 auto 1.25rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Activity size={22} color={C.error} strokeWidth={2} />
        </div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: C.text, marginBottom: "0.5rem" }}>Link Not Valid</h1>
        <p style={{ color: C.textMuted, lineHeight: 1.6, marginBottom: "0.75rem" }}>
          {tokenError ?? "This link has expired or has already been used."}
        </p>
        <p style={{ color: C.textSubtle, fontSize: "0.875rem" }}>
          Contact the Sta. Rosa 1 BHS for a new link: (044) 000-0000
        </p>
      </div>
    );
  }

  if (loadingToken) {
    return (
      <div style={{ maxWidth: 560, margin: "5rem auto", padding: "2rem", textAlign: "center", color: C.textMuted }}>
        Loading your form…
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 560, margin: "5rem auto", padding: "2rem 1.25rem", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.successBg, border: `1px solid ${C.successBorder}`, margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={28} color={C.success} strokeWidth={2} />
        </div>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: C.success, marginBottom: "0.625rem" }}>Form Submitted</h1>
        <p style={{ color: "#374151", lineHeight: 1.65, marginBottom: "1rem" }}>
          Your information has been saved. When you arrive at the health center, staff will verify your details and complete your registration.
        </p>
        <p style={{ color: C.textSubtle, fontSize: "0.8125rem", lineHeight: 1.5 }}>
          Please bring a valid government ID (PhilID, PhilHealth card, or UMID) and your health card if you have one.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Scoped interaction styles — hover/active states that need CSS pseudo-classes */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .purpose-card:hover:not([data-selected]) {
          border-color: ${C.primaryBorder} !important;
          background: ${C.primaryBg} !important;
        }
        .purpose-card:active {
          transform: scale(0.97);
        }
        .nav-btn-primary:active {
          transform: scale(0.96);
          background: ${C.primaryDark} !important;
        }
        .nav-btn-back:hover {
          border-color: ${C.textSubtle} !important;
          color: ${C.text} !important;
        }
        .nav-btn-back:active {
          transform: scale(0.96);
        }
        input[type="text"]:focus,
        input[type="tel"]:focus,
        input[type="date"]:focus,
        input[type="number"]:focus,
        input[type="email"]:focus,
        select:focus,
        textarea:focus {
          border-color: ${C.borderFocus} !important;
          box-shadow: 0 0 0 3px rgba(181,52,62,0.1) !important;
          outline: none !important;
        }
      `}</style>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>

        {/* Page header */}
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: C.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.375rem" }}>
                Sta. Rosa 1 Barangay Health Station · Patubig, Marilao, Bulacan
              </p>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: C.text, lineHeight: 1.2, marginBottom: "0.375rem" }}>
                Pre-Visit Health Form
              </h1>
              <p style={{ fontSize: "0.875rem", color: C.textMuted, lineHeight: 1.5 }}>
                Fill in your details before your visit. Our staff will verify your information when you arrive.
              </p>
            </div>

            {/* Dev-only fill button — never shown in production */}
            {process.env.NODE_ENV === "development" && (
              <button
                type="button"
                onClick={handleFillTestData}
                title="Fill all form fields with realistic test data (dev only)"
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.4375rem 0.875rem",
                  border: `1.5px solid ${C.primaryBorder}`,
                  borderRadius: "0.5rem",
                  background: C.primaryBg,
                  color: C.primary,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  transition: "border-color 0.15s, background 0.15s",
                  marginTop: "0.125rem",
                }}
              >
                <FlaskConical size={13} strokeWidth={2} />
                Fill Test Data
              </button>
            )}
          </div>

          {/* Transient toast shown after test data is loaded */}
          {process.env.NODE_ENV === "development" && testDataLoaded && (
            <div
              style={{
                marginTop: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.875rem",
                background: C.successBg,
                border: `1px solid ${C.successBorder}`,
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
                color: C.success,
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={14} strokeWidth={2.5} />
              Test data loaded — review each step and submit
            </div>
          )}
        </div>

        {/* Step indicator */}
        <StepIndicator current={currentStep} total={TOTAL_STEPS} />

        {/* Purpose chip on steps 2–6 */}
        {currentStep > 1 && visitPurpose && <PurposeChip value={visitPurpose} />}

        {/* ---------------------------------------------------------------- */}
        {/* Step 1 — Visit Purpose                                           */}
        {/* ---------------------------------------------------------------- */}
        {currentStep === 1 && (
          <div style={card}>
            <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "0.25rem" }}>
              Why are you visiting today?
            </h2>
            <p style={{ fontSize: "0.8125rem", color: C.textMuted, marginBottom: "1.25rem", lineHeight: 1.5 }}>
              Select the service that best matches your reason for visiting the Barangay Health Center.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "0.625rem",
              }}
            >
              {VISIT_PURPOSES.map((opt) => (
                <PurposeCard
                  key={opt.value}
                  opt={opt}
                  selected={visitPurpose === opt.value}
                  onSelect={() => {
                    setVisitPurpose(opt.value);
                    setPurposeErr("");
                    if (opt.value !== "Others") setVisitPurposeOther("");
                  }}
                />
              ))}
            </div>

            {visitPurpose === "Others" && (
              <div style={{ marginTop: "1rem" }}>
                <label style={label} htmlFor="visitPurposeOther">
                  Please describe your reason *
                </label>
                <input
                  id="visitPurposeOther"
                  type="text"
                  value={visitPurposeOther}
                  onChange={(e) => { setVisitPurposeOther(e.target.value); if (e.target.value.trim()) setPurposeErr(""); }}
                  placeholder="Describe your reason for visiting…"
                  style={{ ...input, borderColor: purposeErr ? C.errorBorder : C.border }}
                  maxLength={500}
                />
              </div>
            )}

            {purposeErr && <p style={{ ...errMsg, marginTop: "0.75rem" }}>{purposeErr}</p>}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Steps 2–6 — inside react-hook-form                              */}
        {/* ---------------------------------------------------------------- */}
        <form onSubmit={(e) => void handleSubmit(onSubmit, onFormInvalid)(e)} noValidate>

          {/* Step 2 — Identity & Demographics */}
          {currentStep === 2 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1.25rem" }}>
                Identity &amp; Demographics
              </h2>

              <SectionLabel>Full Name</SectionLabel>
              <div style={twoCol}>
                <div>
                  <label style={label} htmlFor="firstName">First Name *</label>
                  <input id="firstName" type="text" {...register("firstName")} style={{ ...input, borderColor: errors.firstName ? C.errorBorder : C.border }} />
                  <FieldError message={errors.firstName?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="middleName">Middle Name</label>
                  <input id="middleName" type="text" {...register("middleName")} style={input} />
                </div>
                <div>
                  <label style={label} htmlFor="lastName">Last Name *</label>
                  <input id="lastName" type="text" {...register("lastName")} style={{ ...input, borderColor: errors.lastName ? C.errorBorder : C.border }} />
                  <FieldError message={errors.lastName?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="suffix-input">Suffix</label>
                  <input id="suffix-input" type="text" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="Jr., Sr., II, III" style={input} maxLength={20} />
                </div>
              </div>

              <SectionLabel>Date of Birth &amp; Sex</SectionLabel>
              <div style={twoCol}>
                <div>
                  <label style={label} htmlFor="birthDate">Birthday *</label>
                  <input id="birthDate" type="date" max={new Date().toISOString().split("T")[0]} {...register("birthDate")} style={{ ...input, borderColor: errors.birthDate ? C.errorBorder : C.border }} />
                  <FieldError message={errors.birthDate?.message} />
                </div>
                <div>
                  <label style={label}>Sex *</label>
                  <Controller name="sex" control={control} render={({ field }) => (
                    <div style={{ display: "flex", gap: "1.25rem", paddingTop: "0.5rem" }}>
                      {(["male", "female"] as const).map((v) => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
                          <input type="radio" checked={field.value === v} onChange={() => field.onChange(v)} />
                          {v === "male" ? "Male" : "Female"}
                        </label>
                      ))}
                    </div>
                  )} />
                  <FieldError message={errors.sex?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="civilStatus">Civil Status</label>
                  <select id="civilStatus" {...register("civilStatus")} style={{ ...input, borderColor: errors.civilStatus ? C.errorBorder : C.border }}>
                    <option value="">— Select —</option>
                    {["Single", "Married", "Widowed", "Separated", "Annulled"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <FieldError message={errors.civilStatus?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="bloodType">Blood Type</label>
                  <select id="bloodType" {...register("bloodType")} style={input}>
                    <option value="">— Unknown —</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <SectionLabel>Additional Details</SectionLabel>
              <div style={twoCol}>
                <div>
                  <label style={label} htmlFor="placeOfBirth">Place of Birth</label>
                  <input id="placeOfBirth" type="text" {...register("placeOfBirth")} style={input} placeholder="City or Municipality" />
                </div>
                <div>
                  <label style={label} htmlFor="mothersMaidenName">Mother's Maiden Name</label>
                  <input id="mothersMaidenName" type="text" {...register("mothersMaidenName")} style={input} placeholder="First Middle Last" />
                </div>
                <div>
                  <label style={label} htmlFor="occupation">Occupation</label>
                  <input id="occupation" type="text" {...register("occupation")} style={input} placeholder="e.g. Farmer, Teacher, Student" />
                </div>
              </div>

              <SectionLabel>Home Address</SectionLabel>
              <div style={twoCol}>
                <div>
                  <label style={label} htmlFor="barangay">Barangay *</label>
                  <input id="barangay" type="text" {...register("barangay")} style={{ ...input, borderColor: errors.barangay ? C.errorBorder : C.border }} />
                  <FieldError message={errors.barangay?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="municipality">Municipality *</label>
                  <input id="municipality" type="text" {...register("municipality")} style={{ ...input, borderColor: errors.municipality ? C.errorBorder : C.border }} />
                  <FieldError message={errors.municipality?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="province">Province *</label>
                  <input id="province" type="text" {...register("province")} style={{ ...input, borderColor: errors.province ? C.errorBorder : C.border }} />
                  <FieldError message={errors.province?.message} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Contact & Address */}
          {currentStep === 3 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1.25rem" }}>
                Contact &amp; Address
              </h2>

              <SectionLabel>Your Contact Number <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></SectionLabel>
              <div style={{ maxWidth: 280 }}>
                <label style={label} htmlFor="mobileNumber">Mobile Number</label>
                <input id="mobileNumber" type="tel" {...register("mobileNumber")} style={input} placeholder="09171234567 (optional)" />
                <FieldError message={errors.mobileNumber?.message} />
              </div>

              <SectionLabel>Residential Address</SectionLabel>
              <div style={{ display: "grid", gap: "0.875rem" }}>
                <div style={twoCol}>
                  <div>
                    <label style={label} htmlFor="sitioPurok">Sitio / Purok</label>
                    <input id="sitioPurok" type="text" {...register("sitioPurok")} style={input} placeholder="e.g. Sitio Mabini" />
                  </div>
                  <div>
                    <label style={label} htmlFor="householdNumber">Household Number</label>
                    <input id="householdNumber" type="text" {...register("householdNumber")} style={input} placeholder="e.g. HH-0042" />
                  </div>
                </div>
                <div>
                  <label style={label} htmlFor="address">Complete Address *</label>
                  <textarea id="address" rows={3} {...register("address")} style={{ ...input, resize: "vertical", borderColor: errors.address ? C.errorBorder : C.border }} placeholder="House no., street, sitio, barangay" />
                  <FieldError message={errors.address?.message} />
                </div>
              </div>

              <SectionLabel>Emergency Contact <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional but recommended)</span></SectionLabel>
              <div style={twoCol}>
                <div>
                  <label style={label} htmlFor="emergencyContactName">Contact Name</label>
                  <input id="emergencyContactName" type="text" {...register("emergencyContactName")} style={input} placeholder="e.g. Juan dela Cruz" />
                  <FieldError message={errors.emergencyContactName?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="emergencyContactNumber">Contact Number</label>
                  <input id="emergencyContactNumber" type="tel" {...register("emergencyContactNumber")} style={input} placeholder="09171234567 (optional)" />
                  <FieldError message={errors.emergencyContactNumber?.message} />
                </div>
                {showEmergencyRel && (
                  <div>
                    <label style={label} htmlFor="emergencyRel">Relationship to You</label>
                    <input id="emergencyRel" type="text" value={emergencyRel} onChange={(e) => setEmergencyRel(e.target.value)} style={input} placeholder="e.g. Spouse, Parent, Sibling" maxLength={100} />
                  </div>
                )}
              </div>

              {showGuardian && (
                <>
                  <SectionLabel>Guardian (for minors / seniors / PWD)</SectionLabel>
                  <div style={twoCol}>
                    <div>
                      <label style={label} htmlFor="guardianName">Guardian Name</label>
                      <input id="guardianName" type="text" {...register("guardianName")} style={input} />
                    </div>
                    <div>
                      <label style={label} htmlFor="guardianContact">Guardian Contact No.</label>
                      <input id="guardianContact" type="tel" {...register("guardianContact")} style={input} placeholder="09171234567" />
                      <FieldError message={errors.guardianContact?.message} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4 — Health Profile & PhilHealth */}
          {currentStep === 4 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1.25rem" }}>
                Health Profile &amp; PhilHealth
              </h2>

              <SectionLabel>PhilHealth Information</SectionLabel>
              <div style={twoCol}>
                <div>
                  <label style={label} htmlFor="philhealthNo">PhilHealth No.</label>
                  <input id="philhealthNo" type="text" {...register("philhealthNo")} style={input} placeholder="12-345678901-2" />
                </div>
                <div>
                  <label style={label}>Member Type</label>
                  <Controller name="philhealthMemberType" control={control} render={({ field }) => (
                    <div style={{ display: "flex", gap: "1.25rem", paddingTop: "0.5rem" }}>
                      {([["member", "Member"], ["dependent", "Dependent"]] as [string, string][]).map(([v, lbl]) => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
                          <input type="radio" checked={field.value === v} onChange={() => field.onChange(v)} />{lbl}
                        </label>
                      ))}
                    </div>
                  )} />
                </div>
                {showPhilhealthCategory && (
                  <div>
                    <label style={label} htmlFor="philhealthCategory">PhilHealth Category</label>
                    <select id="philhealthCategory" {...register("philhealthCategory")} style={input}>
                      <option value="">— Select —</option>
                      <option value="indigent">Indigent</option>
                      <option value="sponsored">Sponsored</option>
                      <option value="formal_economy">Formal Economy</option>
                      <option value="informal_economy">Informal Economy</option>
                      <option value="lifetime_member">Lifetime Member</option>
                    </select>
                  </div>
                )}
              </div>

              <SectionLabel>Special Classifications</SectionLabel>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {([
                  ["is4psBeneficiary", "4Ps / Pantawid Pamilya Beneficiary"],
                  ["isIndigenous", "Indigenous Peoples (IP)"],
                  ["isPwd", "Person with Disability (PWD)"],
                  ["isPregnant", "Currently Pregnant"],
                ] as [keyof PatientIntakeFormValues, string][]).map(([field, lbl]) => (
                  <label key={field} style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
                    <input type="checkbox" {...register(field)} style={{ width: 17, height: 17, accentColor: C.primary }} />
                    {lbl}
                  </label>
                ))}
              </div>

              {(is4ps || showSeniorId || isPwd) && (
                <>
                  <SectionLabel>ID Numbers</SectionLabel>
                  <div style={twoCol}>
                    {is4ps && (
                      <div>
                        <label style={label} htmlFor="householdId4ps">4Ps Household ID</label>
                        <input id="householdId4ps" type="text" {...register("householdId4ps")} style={input} />
                      </div>
                    )}
                    {showSeniorId && (
                      <div>
                        <label style={label} htmlFor="seniorIdNumber">Senior Citizen ID No.</label>
                        <input id="seniorIdNumber" type="text" {...register("seniorIdNumber")} style={input} />
                      </div>
                    )}
                    {isPwd && (
                      <div>
                        <label style={label} htmlFor="pwdIdNumber">PWD ID No.</label>
                        <input id="pwdIdNumber" type="text" {...register("pwdIdNumber")} style={input} />
                      </div>
                    )}
                  </div>
                </>
              )}

              <SectionLabel>Vital Signs <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — staff may assist)</span></SectionLabel>
              <div style={twoCol}>
                <div>
                  <label style={label} htmlFor="heightCm">Height (cm)</label>
                  <input id="heightCm" type="number" min={30} max={250} step={0.5} {...register("heightCm", { valueAsNumber: true })} style={{ ...input, borderColor: errors.heightCm ? C.errorBorder : C.border }} placeholder="e.g. 155" />
                  <FieldError message={errors.heightCm?.message} />
                </div>
                <div>
                  <label style={label} htmlFor="weightKg">Weight (kg)</label>
                  <input id="weightKg" type="number" min={0.5} max={500} step={0.1} {...register("weightKg", { valueAsNumber: true })} style={{ ...input, borderColor: errors.weightKg ? C.errorBorder : C.border }} placeholder="e.g. 58.5" />
                  <FieldError message={errors.weightKg?.message} />
                </div>
              </div>

              {showPregnancy && (
                <>
                  <SectionLabel>Obstetric / Pregnancy Details</SectionLabel>
                  <div style={twoCol}>
                    <div>
                      <label style={label} htmlFor="lastMenstrualPeriod">Last Menstrual Period</label>
                      <input id="lastMenstrualPeriod" type="date" max={new Date().toISOString().split("T")[0]} {...register("lastMenstrualPeriod")} style={input} />
                    </div>
                    <div>
                      <label style={label} htmlFor="estimatedDueDate">Estimated Due Date</label>
                      <input id="estimatedDueDate" type="date" {...register("estimatedDueDate")} style={input} />
                    </div>
                    <div>
                      <label style={label} htmlFor="gravida">Gravida (total pregnancies)</label>
                      <input id="gravida" type="number" min={0} step={1} {...register("gravida", { valueAsNumber: true })} style={{ ...input, borderColor: errors.gravida ? C.errorBorder : C.border }} placeholder="0" />
                      <FieldError message={errors.gravida?.message} />
                    </div>
                    <div>
                      <label style={label} htmlFor="para">Para (live births)</label>
                      <input id="para" type="number" min={0} step={1} {...register("para", { valueAsNumber: true })} style={{ ...input, borderColor: errors.para ? C.errorBorder : C.border }} placeholder="0" />
                      <FieldError message={errors.para?.message} />
                    </div>
                  </div>
                </>
              )}

              <SectionLabel>Medical Background</SectionLabel>
              <div style={{ display: "grid", gap: "0.875rem" }}>
                <div>
                  <label style={label} htmlFor="knownConditions">Pre-existing Conditions</label>
                  <textarea id="knownConditions" rows={3} {...register("knownConditions")} style={{ ...input, resize: "vertical" }} placeholder="e.g. Hypertension, Diabetes, Asthma…" maxLength={5000} />
                </div>
                <div>
                  <label style={label} htmlFor="allergies">Known Allergies</label>
                  <textarea id="allergies" rows={3} {...register("allergies")} style={{ ...input, resize: "vertical" }} placeholder="e.g. Penicillin, Aspirin, Shellfish…" maxLength={5000} />
                </div>
              </div>
            </div>
          )}

          {/* Step 5 — Visit Details */}
          {currentStep === 5 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1.25rem" }}>
                {visitPurpose ? `Details for ${visitPurpose}` : "Visit Details"}
              </h2>
              <PurposeDetailsForm
                visitPurpose={visitPurpose as VisitPurposeValue}
                value={purposeDetails}
                onChange={(updated) => setPurposeDetails(updated)}
                errors={purposeDetailsErrors}
              />
            </div>
          )}

          {/* Step 6 — Review & Consent */}
          {currentStep === 6 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1rem" }}>
                Review Your Information
              </h2>

              {/* Summary review table so the patient can verify before submitting */}
              <div
                style={{
                  background: C.surfaceAlt,
                  border: `1px solid ${C.border}`,
                  borderRadius: "0.625rem",
                  padding: "1rem 1.125rem",
                  marginBottom: "1.25rem",
                  fontSize: "0.8125rem",
                  color: "#374151",
                  lineHeight: 1.7,
                }}
              >
                <p style={{ fontWeight: 700, color: C.text, marginBottom: "0.625rem", fontSize: "0.875rem" }}>
                  Please confirm your details before submitting.
                </p>
                {(
                  [
                    ["Name", [watch("firstName"), watch("middleName"), watch("lastName")].filter(Boolean).join(" ")],
                    ["Birthday", watch("birthDate") ?? ""],
                    ["Sex", watch("sex") ? (watch("sex") === "male" ? "Male" : "Female") : ""],
                    ["Barangay", watch("barangay") ?? ""],
                    ["Municipality", watch("municipality") ?? ""],
                    ["Province", watch("province") ?? ""],
                    ["Address", watch("address") ?? ""],
                    ["Mobile", watch("mobileNumber") ?? "(not provided)"],
                    ["Visit Purpose", visitPurpose || "(not selected)"],
                  ] as [string, string][]
                )
                  .filter(([, v]) => v.trim() !== "")
                  .map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 1fr",
                        gap: "0.25rem 0.75rem",
                        borderBottom: `1px solid ${C.border}`,
                        paddingTop: "0.25rem",
                        paddingBottom: "0.25rem",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: C.textMuted }}>{label}</span>
                      <span style={{ color: C.text, wordBreak: "break-word" }}>{value}</span>
                    </div>
                  ))}
                <p style={{ marginTop: "0.625rem", color: C.textSubtle, fontSize: "0.75rem" }}>
                  Need to change something? Use the Back button.
                </p>
              </div>

              {/* Data Privacy Notice */}
              <div
                style={{
                  background: C.surfaceAlt,
                  border: `1px solid ${C.border}`,
                  borderRadius: "0.625rem",
                  padding: "1rem 1.125rem",
                  marginBottom: "1.25rem",
                  fontSize: "0.8125rem",
                  color: "#374151",
                  lineHeight: 1.65,
                }}
              >
                <p style={{ fontWeight: 700, color: C.text, marginBottom: "0.5rem" }}>
                  Data Privacy Act of 2012 (R.A. 10173) Notice
                </p>
                <p style={{ marginBottom: "0.5rem" }}>
                  The Sta. Rosa 1 Barangay Health Station will collect and process your personal health information for the purpose of providing medical care, generating your Barangay Health Card, scheduling appointments, and sending SMS health reminders.
                </p>
                <p>
                  Your data will be kept confidential, stored securely, and accessed only by authorized health center staff. You have the right to access, correct, and request deletion of your records in accordance with applicable law.
                </p>
              </div>

              <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  {...register("dataPrivacyConsent")}
                  style={{ width: 18, height: 18, marginTop: "0.1875rem", flexShrink: 0, accentColor: C.primary }}
                />
                <span style={{ fontSize: "0.9375rem", color: C.textMuted, lineHeight: 1.55 }}>
                  I understand and consent to the collection and processing of my personal health information for
                  registration and care at the Sta. Rosa 1 BHS as described above. <span style={{ color: C.error }}>*</span>
                </span>
              </label>
              <FieldError message={errors.dataPrivacyConsent?.message} />
            </div>
          )}

          {saveError && (
            <div style={{ color: C.error, background: C.errorBg, border: `1px solid ${C.errorBorder}`, borderRadius: "0.5rem", padding: "0.625rem 1rem", marginBottom: "0.75rem", fontSize: "0.875rem" }}>
              {saveError}
            </div>
          )}

          {/* Navigation for steps 2–6 */}
          {currentStep > 1 && (
            <NavButtons
              step={currentStep}
              total={TOTAL_STEPS}
              onBack={handleBack}
              onNext={handleNext}
              submitting={savingDraft}
            />
          )}
        </form>

        {/* Navigation for step 1 */}
        {currentStep === 1 && (
          <NavButtons
            step={1}
            total={TOTAL_STEPS}
            onBack={handleBack}
            onNext={handleNext}
          />
        )}

        <p style={{ textAlign: "center", marginTop: "2rem", color: C.textSubtle, fontSize: "0.75rem", lineHeight: 1.5 }}>
          Your information is kept private and secure under R.A. 10173.<br />
          This form is for use by authorized patients only.
        </p>
      </div>
    </>
  );
}
