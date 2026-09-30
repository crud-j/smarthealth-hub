"use client";
/**
 * Public Patient Intake Form (tokenless)
 * URL: /intake
 * Auth: None — fully public
 *
 * This is the form linked from the QR code posted at the health center
 * and shared on Facebook/social media. Any patient can fill it out.
 *
 * On submit → POST /api/v1/intake-applications (status='pending')
 * Admin reviews submissions at /settings/intake-applications
 *
 * Step 1 — Visit Purpose
 * Step 2 — Identity & Demographics
 * Step 3 — Contact & Address
 * Step 4 — Health Profile & PhilHealth
 * Step 5 — Consent
 */

import { useMemo, useState } from "react";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  Apple,
  Baby,
  Bandage,
  CheckCircle2,
  ClipboardList,
  Droplets,
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
import Swal from "sweetalert2";
import { patientCreateSchema } from "@/lib/schemas/patient";
import type { PatientCreateFormValues } from "@/lib/schemas/patient";

// ---------------------------------------------------------------------------
// Design tokens (matches /intake/[token] design)
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

const lbl: React.CSSProperties = {
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

const divider: React.CSSProperties = {
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
// Visit purpose options
// ---------------------------------------------------------------------------

interface VisitPurposeOption {
  value: string;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

const VISIT_PURPOSES: VisitPurposeOption[] = [
  { value: "General Consultation",            label: "General Consultation",            hint: "Check-up, illness, or general concern",       Icon: Stethoscope },
  { value: "Immunization / Vaccination",       label: "Immunization",                    hint: "Vaccines for children and adults",            Icon: Syringe     },
  { value: "Prenatal / Maternal Care",         label: "Prenatal / Maternal",             hint: "Prenatal check-up and maternal health",       Icon: Baby        },
  { value: "Family Planning",                  label: "Family Planning",                 hint: "Contraception counseling and services",       Icon: Users       },
  { value: "Dental Services",                  label: "Dental Services",                 hint: "Tooth extraction, oral exam",                 Icon: SmilePlus   },
  { value: "TB-DOTS Program",                  label: "TB-DOTS Program",                 hint: "Tuberculosis treatment follow-up",            Icon: Pill        },
  { value: "Child Health / Growth Monitoring", label: "Child Health",                    hint: "Growth monitoring and child wellness",        Icon: TrendingUp  },
  { value: "Hypertension / BP Monitoring",     label: "Hypertension / BP",               hint: "Blood pressure check and management",        Icon: HeartPulse  },
  { value: "Diabetes Management",              label: "Diabetes",                        hint: "Blood sugar monitoring and care",             Icon: Droplets    },
  { value: "Wound Care / Dressing",            label: "Wound Care",                      hint: "Wound dressing and minor procedures",        Icon: Bandage     },
  { value: "Nutrition Counseling",             label: "Nutrition",                       hint: "Dietary guidance and nutrition program",      Icon: Apple       },
  { value: "Senior Citizens Health Check",     label: "Senior Health Check",             hint: "Health assessment for senior citizens",      Icon: UserCheck   },
  { value: "Medical Certificate",              label: "Medical Certificate",             hint: "Certificate for work, school, or legal use", Icon: ClipboardList },
  { value: "Others",                           label: "Others",                          hint: "Any other health service or concern",         Icon: PenLine     },
];

const STEP_TITLES: Record<number, string> = {
  1: "Visit Purpose",
  2: "Personal Info",
  3: "Contact & Address",
  4: "Health Profile",
  5: "Consent",
};

const TOTAL_STEPS = 5;

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function submitIntakeForm(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/v1/intake-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `Submission failed (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string | { msg: string }[] };
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((d) => d.msg).join("; ");
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as { reference_number: string };
  return data.reference_number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p style={errMsg}>{message}</p>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p style={divider}>{children}</p>;
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
// Purpose card
// ---------------------------------------------------------------------------

function PurposeCard({ opt, selected, onSelect }: { opt: VisitPurposeOption; selected: boolean; onSelect: () => void }) {
  const { Icon } = opt;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="purpose-card"
      data-selected={selected ? "true" : undefined}
      style={{
        display: "flex", alignItems: "flex-start", gap: "0.75rem",
        padding: "0.875rem 1rem",
        border: `1.5px solid ${selected ? C.primary : C.border}`,
        borderRadius: "0.75rem",
        background: selected ? C.primaryBg : C.surface,
        color: selected ? C.primary : C.text,
        cursor: "pointer", textAlign: "left", width: "100%",
        boxShadow: selected ? `0 0 0 3px rgba(181,52,62,0.1)` : "0 1px 3px rgba(90,30,30,0.04)",
        transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
        fontFamily: "inherit",
      }}
    >
      <span style={{ flexShrink: 0, marginTop: "0.0625rem", color: selected ? C.primary : C.textMuted, transition: "color 0.15s" }}>
        <Icon size={20} strokeWidth={selected ? 2 : 1.5} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: "0.875rem", fontWeight: selected ? 700 : 500, lineHeight: 1.3, marginBottom: "0.125rem" }}>
          {opt.label}
        </span>
        <span style={{ display: "block", fontSize: "0.75rem", color: selected ? C.primary : C.textSubtle, lineHeight: 1.4 }}>
          {opt.hint}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Purpose chip
// ---------------------------------------------------------------------------

function PurposeChip({ value }: { value: string }) {
  const opt = VISIT_PURPOSES.find((o) => o.value === value);
  if (!opt) return null;
  const { Icon } = opt;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4375rem", background: C.primaryBg, border: `1px solid ${C.primaryBorder}`, borderRadius: "2rem", padding: "0.3125rem 0.875rem 0.3125rem 0.625rem", fontSize: "0.8125rem", fontWeight: 600, color: C.primary, marginBottom: "1rem" }}>
      <Icon size={15} strokeWidth={2} color={C.primary} />
      <span>{opt.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "0.875rem", padding: "1rem 1.25rem", marginBottom: "1rem", boxShadow: "0 1px 4px rgba(90,30,30,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" as const, marginBottom: "0.625rem" }}>
        <div>
          <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: C.text }}>Step {current} of {TOTAL_STEPS}</span>
          <span style={{ fontSize: "0.8125rem", color: C.textMuted, marginLeft: "0.375rem" }}>— {STEP_TITLES[current]}</span>
        </div>
        <div style={{ display: "flex", gap: "0.3125rem", alignItems: "center" }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => {
            const done = s < current;
            const active = s === current;
            return (
              <div key={s} title={STEP_TITLES[s]} style={{ width: 26, height: 26, borderRadius: "50%", background: done ? C.success : active ? C.primary : C.surfaceAlt, border: `1.5px solid ${done ? C.success : active ? C.primary : C.border}`, color: done || active ? "#fff" : C.textSubtle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6875rem", fontWeight: 700, transition: "background 0.2s, border-color 0.2s", flexShrink: 0 }}>
                {done ? <CheckCircle2 size={14} strokeWidth={2.5} /> : s}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ height: 3, background: C.surfaceAlt, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${((current - 1) / (TOTAL_STEPS - 1)) * 100}%`, background: C.primary, borderRadius: 2, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav buttons
// ---------------------------------------------------------------------------

function NavButtons({ step, onBack, onNext, submitting }: { step: number; onBack: () => void; onNext: () => void | Promise<void>; submitting?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: step === 1 ? "flex-end" : "space-between", gap: "0.75rem", paddingTop: "0.75rem" }}>
      {step > 1 && (
        <button type="button" onClick={onBack} className="nav-btn-back" style={{ padding: "0.625rem 1.25rem", border: `1.5px solid ${C.border}`, borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 600, color: C.textMuted, background: C.surface, cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s, color 0.15s, transform 0.1s" }}>
          Back
        </button>
      )}
      {step < TOTAL_STEPS ? (
        <button type="button" onClick={() => void onNext()} className="nav-btn-primary" style={{ padding: "0.625rem 1.625rem", background: C.primary, color: "#fff", border: "none", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s, transform 0.1s" }}>
          Continue
        </button>
      ) : (
        <button type="submit" disabled={submitting} className="nav-btn-primary" style={{ padding: "0.625rem 1.625rem", background: submitting ? "#c88" : C.primary, color: "#fff", border: "none", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.15s, transform 0.1s" }}>
          {submitting ? "Submitting…" : "Submit Application"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PublicIntakePage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Visit purpose (local state — supplemental to form schema)
  const [visitPurpose, setVisitPurpose] = useState("");
  const [visitPurposeOther, setVisitPurposeOther] = useState("");
  const [purposeErr, setPurposeErr] = useState("");

  // Extra fields not in PatientCreate Zod schema
  const [suffix, setSuffix] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("");

  const {
    register,
    control,
    watch,
    trigger,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientCreateFormValues>({
    resolver: zodResolver(patientCreateSchema),
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

  const birthDate   = watch("birthDate") ?? "";
  const isPwd       = watch("isPwd");
  const isPregnant  = watch("isPregnant");
  const is4ps       = watch("is4psBeneficiary");
  const philNo      = watch("philhealthNo") ?? "";
  const ecName      = watch("emergencyContactName") ?? "";

  const age             = useMemo(() => computeAge(birthDate), [birthDate]);
  const showGuardian    = age > 0 && (age < 18 || age >= 60 || isPwd);
  const showSeniorId    = age >= 60;
  const showPregnancy   = isPregnant || visitPurpose === "Prenatal / Maternal Care";
  const showPhilCat     = philNo.trim().length > 0;
  const showEcRel       = ecName.trim().length > 0;

  const stepFields: Record<number, (keyof PatientCreateFormValues)[]> = {
    1: [],
    2: ["firstName", "middleName", "lastName", "birthDate", "sex", "civilStatus", "barangay", "municipality", "province"],
    3: ["mobileNumber", "address", "emergencyContactName", "emergencyContactNumber"],
    4: ["philhealthNo", "is4psBeneficiary", "isIndigenous", "isPwd", "isPregnant", "heightCm", "weightKg", "allergies", "knownConditions"],
    5: ["dataPrivacyConsent"],
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!visitPurpose) { setPurposeErr("Please select your reason for visiting."); return; }
      if (visitPurpose === "Others" && !visitPurposeOther.trim()) { setPurposeErr("Please describe your reason."); return; }
      setPurposeErr(""); setStep(2); return;
    }
    const ok = await trigger(stepFields[step]);
    if (ok) setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const onSubmit: SubmitHandler<PatientCreateFormValues> = async (data) => {
    setSubmitting(true);
    try {
      const ref = await submitIntakeForm({
        // Personal
        first_name:            data.firstName,
        middle_name:           data.middleName ?? null,
        last_name:             data.lastName,
        suffix:                suffix.trim() || null,
        birth_date:            data.birthDate,
        sex:                   data.sex,
        civil_status:          data.civilStatus ?? null,
        blood_type:            data.bloodType ?? null,
        philhealth_id:         data.philhealthNo ?? null,
        pwd_id:                data.pwdIdNumber ?? null,
        // Contact
        mobile_number:         data.mobileNumber ?? null,
        house_street:          [data.sitioPurok, data.householdNumber, data.address].filter(Boolean).join(", ") || null,
        barangay:              data.barangay,
        municipality:          data.municipality,
        province:              data.province ?? null,
        // Emergency contact
        emergency_contact_name:         data.emergencyContactName,
        emergency_contact_relationship: emergencyRel.trim() || null,
        emergency_contact_number:       data.emergencyContactNumber,
        // Medical
        known_allergies:          data.allergies ?? null,
        current_medications:      null,
        pre_existing_conditions:  data.knownConditions ?? null,
        // Visit purpose (stored in form_data via the schema extension)
        visit_purpose:       visitPurpose || null,
        visit_purpose_other: visitPurpose === "Others" ? visitPurposeOther.trim() || null : null,
        // Consent
        data_privacy_consent: data.dataPrivacyConsent,
      });

      await Swal.fire({
        icon: "success",
        title: "Application Submitted!",
        html: `
          <p style="color:#374151;margin-bottom:0.75rem">
            Your registration is now under review by the health center staff.
          </p>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:0.5rem;padding:0.75rem 1rem">
            <p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#166534;margin-bottom:0.25rem">Reference Number</p>
            <p style="font-size:1.25rem;font-weight:800;color:#166534;font-family:monospace">${ref}</p>
          </div>
          <p style="font-size:0.8rem;color:#6b7280;margin-top:0.75rem">
            Screenshot your reference number. Bring a valid ID when you visit the health center.
          </p>`,
        confirmButtonText: "Done",
        confirmButtonColor: "#16a34a",
        allowOutsideClick: false,
      });

      // Reset form for a new application
      reset();
      setVisitPurpose(""); setVisitPurposeOther(""); setSuffix(""); setEmergencyRel("");
      setStep(1);

    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Submission Failed",
        text: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        confirmButtonText: "Try Again",
        confirmButtonColor: "#b5343e",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <style>{`
        .purpose-card:hover:not([data-selected]) { border-color: ${C.primaryBorder} !important; background: ${C.primaryBg} !important; }
        .purpose-card:active { transform: scale(0.97); }
        .nav-btn-primary:active { transform: scale(0.96); background: ${C.primaryDark} !important; }
        .nav-btn-back:hover { border-color: ${C.textSubtle} !important; color: ${C.text} !important; }
        .nav-btn-back:active { transform: scale(0.96); }
        input:focus, select:focus, textarea:focus { border-color: ${C.borderFocus} !important; box-shadow: 0 0 0 3px rgba(181,52,62,0.1) !important; outline: none !important; }
      `}</style>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.75rem" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: C.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.375rem" }}>
            Sta. Rosa 1 Barangay Health Station · Patubig, Marilao, Bulacan
          </p>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: C.text, lineHeight: 1.2, marginBottom: "0.375rem" }}>
            Patient Intake Form
          </h1>
          <p style={{ fontSize: "0.875rem", color: C.textMuted, lineHeight: 1.5 }}>
            Fill in your details to register at the health center. Our staff will review your application before your visit.
          </p>
        </div>

        <StepIndicator current={step} />

        {step > 1 && visitPurpose && <PurposeChip value={visitPurpose} />}

        {/* ── Step 1: Visit Purpose ── */}
        {step === 1 && (
          <div style={card}>
            <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "0.25rem" }}>Why are you visiting today?</h2>
            <p style={{ fontSize: "0.8125rem", color: C.textMuted, marginBottom: "1.25rem", lineHeight: 1.5 }}>
              Select the service that best matches your reason for visiting the Barangay Health Center.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.625rem" }}>
              {VISIT_PURPOSES.map((opt) => (
                <PurposeCard key={opt.value} opt={opt} selected={visitPurpose === opt.value}
                  onSelect={() => { setVisitPurpose(opt.value); setPurposeErr(""); if (opt.value !== "Others") setVisitPurposeOther(""); }} />
              ))}
            </div>
            {visitPurpose === "Others" && (
              <div style={{ marginTop: "1rem" }}>
                <label style={lbl} htmlFor="purposeOther">Please describe your reason *</label>
                <input id="purposeOther" type="text" value={visitPurposeOther} onChange={(e) => { setVisitPurposeOther(e.target.value); if (e.target.value.trim()) setPurposeErr(""); }} placeholder="Describe your reason…" style={{ ...input, borderColor: purposeErr ? C.errorBorder : C.border }} maxLength={500} />
              </div>
            )}
            {purposeErr && <p style={{ ...errMsg, marginTop: "0.75rem" }}>{purposeErr}</p>}
          </div>
        )}

        {/* ── Steps 2–5: react-hook-form ── */}
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>

          {/* Step 2 — Identity & Demographics */}
          {step === 2 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1.25rem" }}>Identity &amp; Demographics</h2>
              <SectionLabel>Full Name</SectionLabel>
              <div style={twoCol}>
                <div><label style={lbl} htmlFor="fn">First Name *</label><input id="fn" type="text" {...register("firstName")} style={{ ...input, borderColor: errors.firstName ? C.errorBorder : C.border }} /><FieldError message={errors.firstName?.message} /></div>
                <div><label style={lbl} htmlFor="mn">Middle Name</label><input id="mn" type="text" {...register("middleName")} style={input} /></div>
                <div><label style={lbl} htmlFor="ln">Last Name *</label><input id="ln" type="text" {...register("lastName")} style={{ ...input, borderColor: errors.lastName ? C.errorBorder : C.border }} /><FieldError message={errors.lastName?.message} /></div>
                <div><label style={lbl} htmlFor="sfx">Suffix</label><input id="sfx" type="text" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="Jr., Sr., II, III" style={input} maxLength={20} /></div>
              </div>
              <SectionLabel>Date of Birth &amp; Sex</SectionLabel>
              <div style={twoCol}>
                <div><label style={lbl} htmlFor="dob">Birthday *</label><input id="dob" type="date" max={new Date().toISOString().split("T")[0]} {...register("birthDate")} style={{ ...input, borderColor: errors.birthDate ? C.errorBorder : C.border }} /><FieldError message={errors.birthDate?.message} /></div>
                <div>
                  <label style={lbl}>Sex *</label>
                  <Controller name="sex" control={control} render={({ field }) => (
                    <div style={{ display: "flex", gap: "1.25rem", paddingTop: "0.5rem" }}>
                      {(["male", "female"] as const).map((v) => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
                          <input type="radio" checked={field.value === v} onChange={() => field.onChange(v)} />{v === "male" ? "Male" : "Female"}
                        </label>
                      ))}
                    </div>
                  )} />
                  <FieldError message={errors.sex?.message} />
                </div>
                <div>
                  <label style={lbl} htmlFor="cs">Civil Status *</label>
                  <select id="cs" {...register("civilStatus")} style={{ ...input, borderColor: errors.civilStatus ? C.errorBorder : C.border }}>
                    <option value="">— Select —</option>
                    {["Single","Married","Widowed","Separated","Annulled"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <FieldError message={errors.civilStatus?.message} />
                </div>
                <div>
                  <label style={lbl} htmlFor="bt">Blood Type</label>
                  <select id="bt" {...register("bloodType")} style={input}>
                    <option value="">— Unknown —</option>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <SectionLabel>Address</SectionLabel>
              <div style={twoCol}>
                <div><label style={lbl} htmlFor="brgy">Barangay *</label><input id="brgy" type="text" {...register("barangay")} style={{ ...input, borderColor: errors.barangay ? C.errorBorder : C.border }} /><FieldError message={errors.barangay?.message} /></div>
                <div><label style={lbl} htmlFor="mun">Municipality *</label><input id="mun" type="text" {...register("municipality")} style={{ ...input, borderColor: errors.municipality ? C.errorBorder : C.border }} /><FieldError message={errors.municipality?.message} /></div>
                <div><label style={lbl} htmlFor="prv">Province</label><input id="prv" type="text" {...register("province")} style={input} /></div>
              </div>
            </div>
          )}

          {/* Step 3 — Contact & Address */}
          {step === 3 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1.25rem" }}>Contact &amp; Address</h2>
              <SectionLabel>Your Contact Number</SectionLabel>
              <div style={{ maxWidth: 260 }}><label style={lbl} htmlFor="mob">Mobile Number</label><input id="mob" type="tel" {...register("mobileNumber")} style={input} placeholder="09171234567" /><FieldError message={errors.mobileNumber?.message} /></div>
              <SectionLabel>Residential Address</SectionLabel>
              <div style={{ display: "grid", gap: "0.875rem" }}>
                <div style={twoCol}>
                  <div><label style={lbl} htmlFor="sp">Sitio / Purok</label><input id="sp" type="text" {...register("sitioPurok")} style={input} placeholder="e.g. Sitio Mabini" /></div>
                  <div><label style={lbl} htmlFor="hn">Household Number</label><input id="hn" type="text" {...register("householdNumber")} style={input} placeholder="e.g. HH-0042" /></div>
                </div>
                <div><label style={lbl} htmlFor="addr">Complete Address *</label><textarea id="addr" rows={3} {...register("address")} style={{ ...input, resize: "vertical", borderColor: errors.address ? C.errorBorder : C.border }} placeholder="House no., street, sitio, barangay" /><FieldError message={errors.address?.message} /></div>
              </div>
              <SectionLabel>Emergency Contact</SectionLabel>
              <div style={twoCol}>
                <div><label style={lbl} htmlFor="ecn">Contact Name *</label><input id="ecn" type="text" {...register("emergencyContactName")} style={{ ...input, borderColor: errors.emergencyContactName ? C.errorBorder : C.border }} /><FieldError message={errors.emergencyContactName?.message} /></div>
                <div><label style={lbl} htmlFor="ecno">Contact Number *</label><input id="ecno" type="tel" {...register("emergencyContactNumber")} style={{ ...input, borderColor: errors.emergencyContactNumber ? C.errorBorder : C.border }} placeholder="09171234567" /><FieldError message={errors.emergencyContactNumber?.message} /></div>
                {showEcRel && <div><label style={lbl} htmlFor="ecr">Relationship to You</label><input id="ecr" type="text" value={emergencyRel} onChange={(e) => setEmergencyRel(e.target.value)} style={input} placeholder="e.g. Spouse, Parent, Sibling" maxLength={100} /></div>}
              </div>
              {showGuardian && (
                <><SectionLabel>Guardian (for minors / seniors / PWD)</SectionLabel>
                <div style={twoCol}>
                  <div><label style={lbl} htmlFor="gn">Guardian Name</label><input id="gn" type="text" {...register("guardianName")} style={input} /></div>
                  <div><label style={lbl} htmlFor="gc">Guardian Contact No.</label><input id="gc" type="tel" {...register("guardianContact")} style={input} placeholder="09171234567" /><FieldError message={errors.guardianContact?.message} /></div>
                </div></>
              )}
            </div>
          )}

          {/* Step 4 — Health Profile & PhilHealth */}
          {step === 4 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1.25rem" }}>Health Profile &amp; PhilHealth</h2>
              <SectionLabel>PhilHealth Information</SectionLabel>
              <div style={twoCol}>
                <div><label style={lbl} htmlFor="phn">PhilHealth No.</label><input id="phn" type="text" {...register("philhealthNo")} style={input} placeholder="12-345678901-2" /></div>
                <div>
                  <label style={lbl}>Member Type</label>
                  <Controller name="philhealthMemberType" control={control} render={({ field }) => (
                    <div style={{ display: "flex", gap: "1.25rem", paddingTop: "0.5rem" }}>
                      {([["member","Member"],["dependent","Dependent"]] as [string,string][]).map(([v,l]) => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
                          <input type="radio" checked={field.value === v} onChange={() => field.onChange(v)} />{l}
                        </label>
                      ))}
                    </div>
                  )} />
                </div>
                {showPhilCat && <div>
                  <label style={lbl} htmlFor="phc">PhilHealth Category</label>
                  <select id="phc" {...register("philhealthCategory")} style={input}>
                    <option value="">— Select —</option>
                    <option value="indigent">Indigent</option>
                    <option value="sponsored">Sponsored</option>
                    <option value="formal_economy">Formal Economy</option>
                    <option value="informal_economy">Informal Economy</option>
                    <option value="lifetime_member">Lifetime Member</option>
                  </select>
                </div>}
              </div>
              <SectionLabel>Special Classifications</SectionLabel>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {([["is4psBeneficiary","4Ps / Pantawid Pamilya Beneficiary"],["isIndigenous","Indigenous Peoples (IP)"],["isPwd","Person with Disability (PWD)"],["isPregnant","Currently Pregnant"]] as [keyof PatientCreateFormValues, string][]).map(([f, l]) => (
                  <label key={f} style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
                    <input type="checkbox" {...register(f)} style={{ width: 17, height: 17, accentColor: C.primary }} />{l}
                  </label>
                ))}
              </div>
              {(is4ps || showSeniorId || isPwd) && (
                <><SectionLabel>ID Numbers</SectionLabel>
                <div style={twoCol}>
                  {is4ps && <div><label style={lbl} htmlFor="h4">4Ps Household ID</label><input id="h4" type="text" {...register("householdId4ps")} style={input} /></div>}
                  {showSeniorId && <div><label style={lbl} htmlFor="sid">Senior Citizen ID No.</label><input id="sid" type="text" {...register("seniorIdNumber")} style={input} /></div>}
                  {isPwd && <div><label style={lbl} htmlFor="pid">PWD ID No.</label><input id="pid" type="text" {...register("pwdIdNumber")} style={input} /></div>}
                </div></>
              )}
              <SectionLabel>Vital Signs <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></SectionLabel>
              <div style={twoCol}>
                <div><label style={lbl} htmlFor="ht">Height (cm)</label><input id="ht" type="number" min={30} max={250} step={0.5} {...register("heightCm", { valueAsNumber: true })} style={input} placeholder="e.g. 155" /><FieldError message={errors.heightCm?.message} /></div>
                <div><label style={lbl} htmlFor="wt">Weight (kg)</label><input id="wt" type="number" min={0.5} max={500} step={0.1} {...register("weightKg", { valueAsNumber: true })} style={input} placeholder="e.g. 58.5" /><FieldError message={errors.weightKg?.message} /></div>
              </div>
              {showPregnancy && (
                <><SectionLabel>Obstetric / Pregnancy Details</SectionLabel>
                <div style={twoCol}>
                  <div><label style={lbl} htmlFor="lmp">Last Menstrual Period</label><input id="lmp" type="date" max={new Date().toISOString().split("T")[0]} {...register("lastMenstrualPeriod")} style={input} /></div>
                  <div><label style={lbl} htmlFor="edd">Estimated Due Date</label><input id="edd" type="date" {...register("estimatedDueDate")} style={input} /></div>
                  <div><label style={lbl} htmlFor="grav">Gravida (total pregnancies)</label><input id="grav" type="number" min={0} step={1} {...register("gravida", { valueAsNumber: true })} style={input} placeholder="0" /><FieldError message={errors.gravida?.message} /></div>
                  <div><label style={lbl} htmlFor="para">Para (live births)</label><input id="para" type="number" min={0} step={1} {...register("para", { valueAsNumber: true })} style={input} placeholder="0" /><FieldError message={errors.para?.message} /></div>
                </div></>
              )}
              <SectionLabel>Medical Background</SectionLabel>
              <div style={{ display: "grid", gap: "0.875rem" }}>
                <div><label style={lbl} htmlFor="kc">Pre-existing Conditions</label><textarea id="kc" rows={3} {...register("knownConditions")} style={{ ...input, resize: "vertical" }} placeholder="e.g. Hypertension, Diabetes, Asthma…" maxLength={5000} /></div>
                <div><label style={lbl} htmlFor="al">Known Allergies</label><textarea id="al" rows={3} {...register("allergies")} style={{ ...input, resize: "vertical" }} placeholder="e.g. Penicillin, Aspirin, Shellfish…" maxLength={5000} /></div>
              </div>
            </div>
          )}

          {/* Step 5 — Consent */}
          {step === 5 && (
            <div style={card}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "1rem" }}>Data Privacy Consent</h2>
              <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: "0.625rem", padding: "1rem 1.125rem", marginBottom: "1.25rem", fontSize: "0.8125rem", color: "#374151", lineHeight: 1.65 }}>
                <p style={{ fontWeight: 700, color: C.text, marginBottom: "0.5rem" }}>Data Privacy Act of 2012 (R.A. 10173) Notice</p>
                <p style={{ marginBottom: "0.5rem" }}>The Sta. Rosa 1 Barangay Health Station will collect and process your personal health information for the purpose of providing medical care, generating your Barangay Health Card, scheduling appointments, and sending SMS health reminders.</p>
                <p>Your data will be kept confidential, stored securely, and accessed only by authorized health center staff. You have the right to access, correct, and request deletion of your records in accordance with applicable law.</p>
              </div>
              <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" {...register("dataPrivacyConsent")} style={{ width: 18, height: 18, marginTop: "0.1875rem", flexShrink: 0, accentColor: C.primary }} />
                <span style={{ fontSize: "0.9375rem", color: C.textMuted, lineHeight: 1.55 }}>I understand and consent to the collection and processing of my personal health information for registration and care at the Sta. Rosa 1 BHS as described above.</span>
              </label>
              <FieldError message={errors.dataPrivacyConsent?.message} />
              <div style={{ marginTop: "1.5rem", padding: "0.875rem 1rem", background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: "0.625rem" }}>
                <p style={{ fontWeight: 700, color: C.success, marginBottom: "0.25rem", fontSize: "0.875rem" }}>Ready to submit?</p>
                <p style={{ fontSize: "0.8125rem", color: "#374151", lineHeight: 1.5 }}>Please review your answers before clicking Submit. Health center staff will review your application before your visit.</p>
              </div>
            </div>
          )}

          {step > 1 && <NavButtons step={step} onBack={() => setStep((s) => Math.max(1, s - 1))} onNext={handleNext} submitting={submitting} />}
        </form>

        {step === 1 && <NavButtons step={1} onBack={() => {}} onNext={handleNext} />}

        <p style={{ textAlign: "center", marginTop: "2rem", color: C.textSubtle, fontSize: "0.75rem", lineHeight: 1.5 }}>
          Your information is kept private and secure under R.A. 10173.<br />
          This form is for patients of the Sta. Rosa 1 Barangay Health Station.
        </p>
      </div>
    </>
  );
}
