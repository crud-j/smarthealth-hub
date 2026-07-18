"use client";
/**
 * New Patient Registration Page.
 *
 * Client component containing the full RHU Patient Record registration form.
 * Section headings mirror the physical form from:
 *   "Rural Health Unit — Patubig, Municipal Health Office, Marilao, Bulacan"
 *
 * Form sections:
 *   1. Patient Name (First, Middle, Last)
 *   2. Birthday / Age / Sex
 *   3. PhilHealth (Member/Dependent toggle + PhilHealth No.)
 *   4. Contact No. + Complete Address
 *   5. Guardian Information (conditional for minors/seniors/PWD)
 *   6. Special Flags (PWD, Pregnant)
 *
 * Validation:
 *   - Required: First Name, Last Name, Birth Date, Sex, Address
 *   - Philippine mobile format for Contact No. and Guardian Contact
 *   - Birth date must be in the past
 *
 * On submit: POST /patients → redirect to /patients/{id}
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCreatePatient } from "@/hooks/usePatients";
import type { PatientCreatePayload } from "@/types/patient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PH_MOBILE_RE = /^(\+63|0)(9\d{9})$/;

function normalizePhone(v: string): string {
  const s = v.trim().replace(/[\s\-]/g, "");
  const m = PH_MOBILE_RE.exec(s);
  if (!m) return v; // return raw; server validates
  return `+63${m[2]}`;
}

// ---------------------------------------------------------------------------
// Shared input style
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #e2e8f0",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  color: "#0f172a",
  background: "white",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#374151",
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
  border: "1px solid #e2e8f0",
  borderRadius: "0.5rem",
  padding: "1.5rem",
  marginBottom: "1.25rem",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: "#0f172a",
  marginBottom: "1rem",
  paddingBottom: "0.5rem",
  borderBottom: "1px solid #f1f5f9",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function fieldRow(children: React.ReactNode, cols?: number): React.ReactNode {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols ?? 2}, 1fr)`,
        gap: "1rem",
        marginBottom: "1rem",
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Age computation helper
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  sex?: string;
  address?: string;
  mobileNumber?: string;
  guardianContact?: string;
}

function validate(data: Partial<PatientCreatePayload>): FormErrors {
  const errors: FormErrors = {};

  if (!data.firstName?.trim()) errors.firstName = "First name is required.";
  if (!data.lastName?.trim()) errors.lastName = "Last name is required.";

  if (!data.birthDate) {
    errors.birthDate = "Birth date is required.";
  } else if (new Date(data.birthDate) >= new Date()) {
    errors.birthDate = "Birth date must be in the past.";
  }

  if (!data.sex) errors.sex = "Sex is required.";

  if (!data.address?.trim()) errors.address = "Complete address is required.";

  if (data.mobileNumber) {
    const stripped = data.mobileNumber.trim().replace(/[\s\-]/g, "");
    if (!PH_MOBILE_RE.test(stripped)) {
      errors.mobileNumber =
        "Enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).";
    }
  }

  if (data.guardianContact) {
    const stripped = data.guardianContact.trim().replace(/[\s\-]/g, "");
    if (!PH_MOBILE_RE.test(stripped)) {
      errors.guardianContact =
        "Enter a valid Philippine mobile number for guardian.";
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NewPatientPage() {
  const router = useRouter();
  const { createPatient, loading, error: apiError } = useCreatePatient();

  // Form state
  const [form, setForm] = useState<Partial<PatientCreatePayload>>({
    sex: undefined,
    isPwd: false,
    isPregnant: false,
    philhealthMemberType: undefined,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const set = useCallback(
    (field: keyof PatientCreatePayload, value: unknown) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (submitted) {
        // Live-validate after first submit attempt
        setErrors((prev) => ({
          ...prev,
          [field]: undefined,
        }));
      }
    },
    [submitted]
  );

  const age = computeAge(form.birthDate ?? "");
  // Show guardian section for minors (<18), seniors (>=60), or if PWD
  const showGuardian = age > 0 && (age < 18 || age >= 60 || form.isPwd);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const payload: PatientCreatePayload = {
      firstName: form.firstName!.trim(),
      middleName: form.middleName?.trim() || undefined,
      lastName: form.lastName!.trim(),
      birthDate: form.birthDate!,
      sex: form.sex!,
      civilStatus: form.civilStatus?.trim() || undefined,
      mobileNumber: form.mobileNumber ? normalizePhone(form.mobileNumber) : undefined,
      address: form.address!.trim(),
      guardianName: form.guardianName?.trim() || undefined,
      guardianContact: form.guardianContact
        ? normalizePhone(form.guardianContact)
        : undefined,
      philhealthNo: form.philhealthNo?.trim() || undefined,
      philhealthMemberType: form.philhealthMemberType,
      isPwd: form.isPwd ?? false,
      isPregnant: form.isPregnant ?? false,
    };

    const patient = await createPatient(payload);
    if (patient) {
      router.push(`/patients/${patient.id}`);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.25rem" }}>
          Register New Patient
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
          RHU Patient Record — Sta. Rosa 1 BHS, Patubig, Marilao, Bulacan
        </p>
      </div>

      {/* API error banner */}
      {apiError && (
        <div
          style={{
            padding: "0.875rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "0.375rem",
            color: "#dc2626",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {apiError.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* ── Section 1: Patient Name ───────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Patient&apos;s Full Name</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "1rem",
            }}
          >
            {/* First Name */}
            <div>
              <label style={labelStyle} htmlFor="firstName">
                First Name <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={form.firstName ?? ""}
                onChange={(e) => set("firstName", e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: errors.firstName ? "#fca5a5" : "#e2e8f0",
                }}
                placeholder="e.g. Maria"
              />
              {errors.firstName && <p style={errorStyle}>{errors.firstName}</p>}
            </div>

            {/* Middle Name */}
            <div>
              <label style={labelStyle} htmlFor="middleName">
                Middle Name
              </label>
              <input
                id="middleName"
                type="text"
                value={form.middleName ?? ""}
                onChange={(e) => set("middleName", e.target.value)}
                style={inputStyle}
                placeholder="e.g. Santos"
              />
            </div>

            {/* Last Name */}
            <div>
              <label style={labelStyle} htmlFor="lastName">
                Last Name <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={form.lastName ?? ""}
                onChange={(e) => set("lastName", e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: errors.lastName ? "#fca5a5" : "#e2e8f0",
                }}
                placeholder="e.g. Dela Cruz"
              />
              {errors.lastName && <p style={errorStyle}>{errors.lastName}</p>}
            </div>
          </div>
        </div>

        {/* ── Section 2: Demographics ───────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Demographics</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            {/* Birthday */}
            <div>
              <label style={labelStyle} htmlFor="birthDate">
                Birthday <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                id="birthDate"
                type="date"
                required
                max={new Date().toISOString().split("T")[0]}
                value={form.birthDate ?? ""}
                onChange={(e) => set("birthDate", e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: errors.birthDate ? "#fca5a5" : "#e2e8f0",
                }}
              />
              {errors.birthDate && <p style={errorStyle}>{errors.birthDate}</p>}
            </div>

            {/* Age (computed — read-only) */}
            <div>
              <label style={labelStyle}>Age</label>
              <div
                style={{
                  ...inputStyle,
                  background: "#f8fafc",
                  color: "#475569",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {form.birthDate ? `${age} years old` : "—"}
                {age >= 60 && (
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      padding: "0.125rem 0.375rem",
                      background: "#8b5cf6",
                      color: "white",
                      borderRadius: "9999px",
                      fontSize: "0.625rem",
                      fontWeight: 600,
                    }}
                  >
                    SENIOR
                  </span>
                )}
              </div>
            </div>

            {/* Sex */}
            <div>
              <label style={labelStyle}>
                Sex <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: "1rem", paddingTop: "0.5rem" }}>
                {(["male", "female"] as const).map((s) => (
                  <label
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                    }}
                  >
                    <input
                      type="radio"
                      name="sex"
                      value={s}
                      checked={form.sex === s}
                      onChange={() => set("sex", s)}
                    />
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </label>
                ))}
              </div>
              {errors.sex && <p style={errorStyle}>{errors.sex}</p>}
            </div>

            {/* Civil Status */}
            <div>
              <label style={labelStyle} htmlFor="civilStatus">
                Civil Status
              </label>
              <select
                id="civilStatus"
                value={form.civilStatus ?? ""}
                onChange={(e) => set("civilStatus", e.target.value)}
                style={inputStyle}
              >
                <option value="">— Select —</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="widowed">Widowed</option>
                <option value="separated">Separated</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Section 3: PhilHealth ──────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>PhilHealth</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* PhilHealth Member Type */}
            <div>
              <label style={labelStyle}>PhilHealth Member / Dependent</label>
              <div style={{ display: "flex", gap: "1rem", paddingTop: "0.5rem" }}>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}
                >
                  <input
                    type="radio"
                    name="philhealthType"
                    value=""
                    checked={!form.philhealthMemberType}
                    onChange={() => set("philhealthMemberType", undefined)}
                  />
                  No
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}
                >
                  <input
                    type="radio"
                    name="philhealthType"
                    value="member"
                    checked={form.philhealthMemberType === "member"}
                    onChange={() => set("philhealthMemberType", "member")}
                  />
                  Member
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}
                >
                  <input
                    type="radio"
                    name="philhealthType"
                    value="dependent"
                    checked={form.philhealthMemberType === "dependent"}
                    onChange={() => set("philhealthMemberType", "dependent")}
                  />
                  Dependent
                </label>
              </div>
            </div>

            {/* PhilHealth No. */}
            <div>
              <label style={labelStyle} htmlFor="philhealthNo">
                PhilHealth No.
              </label>
              <input
                id="philhealthNo"
                type="text"
                value={form.philhealthNo ?? ""}
                onChange={(e) => set("philhealthNo", e.target.value)}
                style={inputStyle}
                placeholder="e.g. 12-345678901-2"
                disabled={!form.philhealthMemberType}
              />
            </div>
          </div>
        </div>

        {/* ── Section 4: Contact ────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Contact Information</div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle} htmlFor="mobileNumber">
              Contact No.
            </label>
            <input
              id="mobileNumber"
              type="tel"
              value={form.mobileNumber ?? ""}
              onChange={(e) => set("mobileNumber", e.target.value)}
              style={{
                ...inputStyle,
                borderColor: errors.mobileNumber ? "#fca5a5" : "#e2e8f0",
              }}
              placeholder="e.g. 09171234567 or +639171234567"
            />
            {errors.mobileNumber && <p style={errorStyle}>{errors.mobileNumber}</p>}
            <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.25rem" }}>
              Used for appointment reminders and SMS notifications
            </p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="address">
              Complete Address <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              id="address"
              required
              rows={3}
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
              style={{
                ...inputStyle,
                resize: "vertical",
                borderColor: errors.address ? "#fca5a5" : "#e2e8f0",
              }}
              placeholder="House No., Street, Barangay, Municipality, Province"
            />
            {errors.address && <p style={errorStyle}>{errors.address}</p>}
          </div>
        </div>

        {/* ── Section 5: Guardian (conditional) ────────────────────────── */}
        {showGuardian && (
          <div style={sectionStyle}>
            <div style={sectionHeadingStyle}>Guardian Information</div>
            <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1rem" }}>
              {age < 18
                ? "Required for minors (age < 18)"
                : age >= 60
                ? "Recommended for senior citizens"
                : "Recommended for PWD patients"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="guardianName">
                  Guardian Name
                </label>
                <input
                  id="guardianName"
                  type="text"
                  value={form.guardianName ?? ""}
                  onChange={(e) => set("guardianName", e.target.value)}
                  style={inputStyle}
                  placeholder="Full name of guardian"
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="guardianContact">
                  Guardian Contact No.
                </label>
                <input
                  id="guardianContact"
                  type="tel"
                  value={form.guardianContact ?? ""}
                  onChange={(e) => set("guardianContact", e.target.value)}
                  style={{
                    ...inputStyle,
                    borderColor: errors.guardianContact ? "#fca5a5" : "#e2e8f0",
                  }}
                  placeholder="e.g. 09171234567"
                />
                {errors.guardianContact && (
                  <p style={errorStyle}>{errors.guardianContact}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Section 6: Special Flags ─────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Special Status</div>
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            <label
              style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "#374151" }}
            >
              <input
                type="checkbox"
                checked={form.isPwd ?? false}
                onChange={(e) => set("isPwd", e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>
                <strong>Person with Disability (PWD)</strong>
                <br />
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  Priority queuing and accessibility accommodations
                </span>
              </span>
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "#374151" }}
            >
              <input
                type="checkbox"
                checked={form.isPregnant ?? false}
                onChange={(e) => set("isPregnant", e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>
                <strong>Currently Pregnant</strong>
                <br />
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  Enables prenatal tracking and related reminders
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* ── Submit controls ───────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
            paddingTop: "0.5rem",
          }}
        >
          <a
            href="/patients"
            style={{
              padding: "0.625rem 1.25rem",
              border: "1px solid #e2e8f0",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#374151",
              textDecoration: "none",
              background: "white",
            }}
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0.625rem 1.5rem",
              background: loading ? "#94a3b8" : "#14b8a6",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Registering..." : "Register Patient"}
          </button>
        </div>
      </form>
    </div>
  );
}
