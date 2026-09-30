"use client";
/**
 * Public Online Patient Registration page.
 * URL: /register
 * Auth: None (public — no JWT required)
 *
 * Collects the full registration form and submits to:
 *   POST /api/v1/intake-applications
 *
 * On success shows a confirmation screen with a reference number.
 */

import { useState, useMemo } from "react";
import { useForm, Controller, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Swal from "sweetalert2";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const PH_MOBILE_RE = /^(\+63|0)(9\d{9})$/;

const schema = z.object({
  // Personal Information
  first_name: z.string().min(1, "First name is required").max(100),
  middle_name: z.string().max(100).optional().or(z.literal("")),
  last_name: z.string().min(1, "Last name is required").max(100),
  suffix: z.string().max(20).optional().or(z.literal("")),
  birth_date: z
    .string()
    .min(1, "Date of birth is required")
    .refine((v) => new Date(v) < new Date(), { message: "Birth date cannot be in the future" }),
  sex: z.enum(["male", "female", "other"], { required_error: "Sex is required" }),
  civil_status: z.string().max(20).optional().or(z.literal("")),
  philhealth_id: z.string().max(20).optional().or(z.literal("")),
  pwd_id: z.string().max(80).optional().or(z.literal("")),
  blood_type: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown", ""])
    .optional(),

  // Contact & Address
  mobile_number: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || PH_MOBILE_RE.test(v),
      { message: "Enter a valid Philippine mobile number (e.g. 09171234567)" }
    ),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  house_street: z.string().max(255).optional().or(z.literal("")),
  barangay: z.string().min(1, "Barangay is required").max(150),
  municipality: z.string().min(1, "Municipality is required").max(150),
  province: z.string().max(150).optional().or(z.literal("")),
  region: z.string().max(150).optional().or(z.literal("")),
  zip_code: z.string().max(10).optional().or(z.literal("")),

  // Emergency Contact
  emergency_contact_name: z.string().min(1, "Emergency contact name is required").max(150),
  emergency_contact_relationship: z.string().max(80).optional().or(z.literal("")),
  emergency_contact_number: z
    .string()
    .min(1, "Emergency contact number is required")
    .refine((v) => PH_MOBILE_RE.test(v), {
      message: "Enter a valid Philippine mobile number (e.g. 09171234567)",
    }),

  // Medical Background
  known_allergies: z.string().max(2000).optional().or(z.literal("")),
  current_medications: z.string().max(2000).optional().or(z.literal("")),
  pre_existing_conditions: z.string().max(2000).optional().or(z.literal("")),

  // Consent
  data_privacy_consent: z.literal(true, {
    errorMap: () => ({ message: "You must give consent to submit" }),
  }),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Styles (inline to match existing intake form pattern)
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #e5d4cc",
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p style={errorStyle}>{message}</p>;
}

function computeAge(birthDateStr: string): number {
  if (!birthDateStr) return 0;
  const bd = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  if (
    today.getMonth() < bd.getMonth() ||
    (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())
  ) age--;
  return Math.max(0, age);
}

// ---------------------------------------------------------------------------
// API call (no auth cookie needed — public endpoint)
// ---------------------------------------------------------------------------

async function submitApplication(payload: Record<string, unknown>): Promise<string> {
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
      else if (Array.isArray(body.detail)) {
        msg = body.detail.map((d) => d.msg).join("; ");
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as { reference_number: string };
  return data.reference_number;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  "Personal Info",
  "Contact & Address",
  "Emergency Contact",
  "Medical Background",
  "Review & Consent",
];

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ ...sectionStyle, marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#3d2222" }}>
          Step {current} of {total} — {STEPS[current - 1]}
        </span>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: i + 1 <= current ? "#b5343e" : "#f4e8e3",
                color: i + 1 <= current ? "white" : "#7a5252",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);

  const {
    register,
    control,
    watch,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      barangay: "Patubig",
      municipality: "Marilao",
      province: "Bulacan",
      sex: undefined,
      data_privacy_consent: undefined,
    },
  });

  const birthDateValue = watch("birth_date") ?? "";
  const currentAge = useMemo(() => computeAge(birthDateValue), [birthDateValue]);

  // ---------------------------------------------------------------------------
  // Step field maps for per-step validation
  // ---------------------------------------------------------------------------

  const stepFields: Record<number, (keyof FormValues)[]> = {
    1: ["first_name", "last_name", "birth_date", "sex"],
    2: ["barangay", "municipality", "mobile_number"],
    3: ["emergency_contact_name", "emergency_contact_number"],
    4: [],
    5: ["data_privacy_consent"],
  };

  async function goNext() {
    const ok = await trigger(stepFields[currentStep]);
    if (ok) setCurrentStep((s) => Math.min(STEPS.length, s + 1));
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setSubmitting(true);
    try {
      const ref = await submitApplication({
        first_name: data.first_name,
        middle_name: data.middle_name || null,
        last_name: data.last_name,
        suffix: data.suffix || null,
        birth_date: data.birth_date,
        sex: data.sex,
        civil_status: data.civil_status || null,
        philhealth_id: data.philhealth_id || null,
        pwd_id: data.pwd_id || null,
        blood_type: data.blood_type || null,
        mobile_number: data.mobile_number || null,
        email: data.email || null,
        house_street: data.house_street || null,
        barangay: data.barangay,
        municipality: data.municipality,
        province: data.province || null,
        region: data.region || null,
        zip_code: data.zip_code || null,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_relationship: data.emergency_contact_relationship || null,
        emergency_contact_number: data.emergency_contact_number,
        known_allergies: data.known_allergies || null,
        current_medications: data.current_medications || null,
        pre_existing_conditions: data.pre_existing_conditions || null,
        data_privacy_consent: data.data_privacy_consent,
      });
      setReferenceNumber(ref);
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
            Please take a screenshot or note your reference number. Bring a valid ID when you visit.
          </p>`,
        confirmButtonText: "Done",
        confirmButtonColor: "#16a34a",
        allowOutsideClick: false,
      });
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
  // Confirmation screen
  // ---------------------------------------------------------------------------

  if (referenceNumber) {
    return (
      <div style={{ maxWidth: 600, margin: "4rem auto", padding: "1.5rem", textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#16a34a,#15803d)",
            color: "white",
            fontSize: "2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          &#10003;
        </div>
        <h1 style={{ fontSize: "1.5rem", color: "#166534", marginBottom: "0.5rem" }}>
          Application Submitted!
        </h1>
        <p style={{ color: "#374151", marginBottom: "1.25rem" }}>
          Thank you for registering. Your application is now under review by the health center staff.
        </p>
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "0.75rem",
            padding: "1rem 1.5rem",
            marginBottom: "1.25rem",
          }}
        >
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
            Reference Number
          </p>
          <p style={{ fontSize: "1.5rem", fontWeight: 800, color: "#15803d", fontFamily: "monospace" }}>
            {referenceNumber}
          </p>
          <p style={{ fontSize: "0.8125rem", color: "#166534", marginTop: "0.25rem" }}>
            Please note this number for your records.
          </p>
        </div>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
          Please bring a valid government ID (PhilID, PhilHealth card, or UMID) when you visit.
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          For questions, contact Sta. Rosa 1 BHS at (044) 000-0000.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", color: "#1a0808", marginBottom: "0.5rem" }}>
          Online Patient Registration
        </h1>
        <p style={{ color: "#7a5252", fontSize: "0.875rem" }}>
          Sta. Rosa 1 BHS &mdash; Patubig, Marilao, Bulacan
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.8125rem" }}>
          Fill in all required fields (*). A staff member will review your application before creating your patient record.
        </p>
      </div>

      <StepBar current={currentStep} total={STEPS.length} />

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        {/* ── Step 1: Personal Information ────────────────────────── */}
        {currentStep === 1 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "1rem" }}>Personal Information</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="first_name">First Name *</label>
                <input
                  id="first_name"
                  type="text"
                  {...register("first_name")}
                  style={{ ...inputStyle, borderColor: errors.first_name ? "#fca5a5" : "#e5d4cc" }}
                />
                <FieldError message={errors.first_name?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="middle_name">Middle Name</label>
                <input id="middle_name" type="text" {...register("middle_name")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="last_name">Last Name *</label>
                <input
                  id="last_name"
                  type="text"
                  {...register("last_name")}
                  style={{ ...inputStyle, borderColor: errors.last_name ? "#fca5a5" : "#e5d4cc" }}
                />
                <FieldError message={errors.last_name?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="suffix">Suffix</label>
                <input id="suffix" type="text" {...register("suffix")} style={inputStyle} placeholder="Jr., Sr., III" />
              </div>
              <div>
                <label style={labelStyle} htmlFor="birth_date">Date of Birth *</label>
                <input
                  id="birth_date"
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  {...register("birth_date")}
                  style={{ ...inputStyle, borderColor: errors.birth_date ? "#fca5a5" : "#e5d4cc" }}
                />
                <FieldError message={errors.birth_date?.message} />
                {currentAge > 0 && (
                  <p style={{ fontSize: "0.75rem", color: "#7a5252", marginTop: "0.25rem" }}>
                    Age: {currentAge} years
                  </p>
                )}
              </div>
              <div>
                <label style={labelStyle}>Sex *</label>
                <Controller
                  name="sex"
                  control={control}
                  render={({ field }) => (
                    <div style={{ display: "flex", gap: "1rem", paddingTop: "0.5rem", flexWrap: "wrap" }}>
                      {(["male", "female", "other"] as const).map((v) => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}>
                          <input type="radio" checked={field.value === v} onChange={() => field.onChange(v)} />
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </label>
                      ))}
                    </div>
                  )}
                />
                <FieldError message={errors.sex?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="civil_status">Civil Status</label>
                <select id="civil_status" {...register("civil_status")} style={inputStyle}>
                  <option value="">— Select —</option>
                  {["Single", "Married", "Widowed", "Separated", "Annulled"].map((s) => (
                    <option key={s} value={s.toLowerCase()}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="blood_type">Blood Type</label>
                <select id="blood_type" {...register("blood_type")} style={inputStyle}>
                  <option value="">— Unknown —</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="philhealth_id">PhilHealth ID</label>
                <input id="philhealth_id" type="text" {...register("philhealth_id")} style={inputStyle} placeholder="12-345678901-2" />
              </div>
              <div>
                <label style={labelStyle} htmlFor="pwd_id">PWD ID</label>
                <input id="pwd_id" type="text" {...register("pwd_id")} style={inputStyle} placeholder="PWD ID number (if applicable)" />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Contact & Address ─────────────────────────── */}
        {currentStep === 2 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "1rem" }}>Contact &amp; Address</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="mobile_number">Mobile Number</label>
                <input id="mobile_number" type="tel" {...register("mobile_number")} style={inputStyle} placeholder="09171234567" />
                <FieldError message={errors.mobile_number?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="email">Email Address</label>
                <input id="email" type="email" {...register("email")} style={inputStyle} placeholder="example@email.com" />
                <FieldError message={errors.email?.message} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle} htmlFor="house_street">House No. / Street</label>
                <input id="house_street" type="text" {...register("house_street")} style={inputStyle} placeholder="123 Sampaguita St." />
              </div>
              <div>
                <label style={labelStyle} htmlFor="barangay">Barangay *</label>
                <input
                  id="barangay"
                  type="text"
                  {...register("barangay")}
                  style={{ ...inputStyle, borderColor: errors.barangay ? "#fca5a5" : "#e5d4cc" }}
                />
                <FieldError message={errors.barangay?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="municipality">Municipality / City *</label>
                <input
                  id="municipality"
                  type="text"
                  {...register("municipality")}
                  style={{ ...inputStyle, borderColor: errors.municipality ? "#fca5a5" : "#e5d4cc" }}
                />
                <FieldError message={errors.municipality?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="province">Province</label>
                <input id="province" type="text" {...register("province")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="region">Region</label>
                <input id="region" type="text" {...register("region")} style={inputStyle} placeholder="e.g. Region III" />
              </div>
              <div>
                <label style={labelStyle} htmlFor="zip_code">ZIP Code</label>
                <input id="zip_code" type="text" {...register("zip_code")} style={inputStyle} placeholder="3019" maxLength={10} />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Emergency Contact ─────────────────────────── */}
        {currentStep === 3 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "1rem" }}>Emergency Contact</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="emergency_contact_name">Contact Name *</label>
                <input
                  id="emergency_contact_name"
                  type="text"
                  {...register("emergency_contact_name")}
                  style={{ ...inputStyle, borderColor: errors.emergency_contact_name ? "#fca5a5" : "#e5d4cc" }}
                />
                <FieldError message={errors.emergency_contact_name?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="emergency_contact_relationship">Relationship</label>
                <input
                  id="emergency_contact_relationship"
                  type="text"
                  {...register("emergency_contact_relationship")}
                  style={inputStyle}
                  placeholder="Spouse, Parent, Sibling..."
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="emergency_contact_number">Contact Number *</label>
                <input
                  id="emergency_contact_number"
                  type="tel"
                  {...register("emergency_contact_number")}
                  style={{ ...inputStyle, borderColor: errors.emergency_contact_number ? "#fca5a5" : "#e5d4cc" }}
                  placeholder="09171234567"
                />
                <FieldError message={errors.emergency_contact_number?.message} />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Medical Background ─────────────────────────── */}
        {currentStep === 4 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "0.5rem" }}>Medical Background</h2>
            <p style={{ fontSize: "0.8125rem", color: "#7a5252", marginBottom: "1rem" }}>
              Optional — your full medical history will be recorded after your first visit with the health center.
            </p>
            <div style={{ display: "grid", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="known_allergies">Known Allergies</label>
                <textarea
                  id="known_allergies"
                  rows={3}
                  {...register("known_allergies")}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="e.g. Penicillin, shellfish, dust"
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="current_medications">Current Medications</label>
                <textarea
                  id="current_medications"
                  rows={3}
                  {...register("current_medications")}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="List any medications you are currently taking"
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="pre_existing_conditions">Pre-existing Conditions</label>
                <textarea
                  id="pre_existing_conditions"
                  rows={3}
                  {...register("pre_existing_conditions")}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="e.g. Hypertension, Diabetes, Asthma"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: Review & Consent ─────────────────────────── */}
        {currentStep === 5 && (
          <div>
            {/* Quick summary */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "0.75rem" }}>Summary</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem 1.5rem", fontSize: "0.875rem" }}>
                {[
                  ["Name", `${watch("first_name") || ""} ${watch("middle_name") || ""} ${watch("last_name") || ""}`.trim()],
                  ["Birth Date", watch("birth_date") || "—"],
                  ["Sex", watch("sex") || "—"],
                  ["Barangay", watch("barangay") || "—"],
                  ["Municipality", watch("municipality") || "—"],
                  ["Mobile", watch("mobile_number") || "—"],
                  ["Emergency Contact", watch("emergency_contact_name") || "—"],
                  ["Emergency No.", watch("emergency_contact_number") || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#b09090", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                    <p style={{ color: "#1a0808" }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Consent */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "1rem" }}>Data Privacy Consent</h2>
              <p style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6, marginBottom: "1rem" }}>
                Under the Data Privacy Act of 2012 (Republic Act No. 10173), the Sta. Rosa 1 Barangay Health Station
                collects and processes your personal health information for the sole purpose of providing healthcare services.
                Your data will be kept confidential and used only by authorized health center staff.
              </p>
              <Controller
                name="data_privacy_consent"
                control={control}
                render={({ field }) => (
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={field.value === true}
                      onChange={(e) => field.onChange(e.target.checked ? true : undefined)}
                      style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: "0.875rem", color: "#3d2222", lineHeight: 1.5 }}>
                      I consent to the collection and processing of my personal health information for registration
                      and care at the Sta. Rosa 1 BHS. *
                    </span>
                  </label>
                )}
              />
              <FieldError message={errors.data_privacy_consent?.message} />
            </div>
          </div>
        )}

        {/* Error banner */}
        {submitError && (
          <div style={{ color: "#991b1b", background: "#fee2e2", borderRadius: "0.375rem", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
            {submitError}
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", paddingTop: "0.5rem" }}>
          <button
            type="button"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            style={{
              padding: "0.625rem 1.25rem",
              border: "1px solid #e5d4cc",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#3d2222",
              background: "white",
              cursor: currentStep === 1 ? "not-allowed" : "pointer",
              opacity: currentStep === 1 ? 0.5 : 1,
            }}
          >
            Back
          </button>
          {currentStep < STEPS.length ? (
            <button
              type="button"
              onClick={() => void goNext()}
              style={{
                padding: "0.625rem 1.5rem",
                background: "linear-gradient(135deg, #b5343e, #c94060)",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "0.625rem 1.5rem",
                background: submitting ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Submitting..." : "Submit Registration"}
            </button>
          )}
        </div>
      </form>

      <p style={{ textAlign: "center", marginTop: "2rem", color: "#9ca3af", fontSize: "0.75rem" }}>
        Your information is kept private and secure. This form is for authorized use only.
      </p>
    </div>
  );
}
