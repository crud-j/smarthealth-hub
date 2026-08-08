"use client";
/**
 * Patient Edit Page.
 *
 * Pre-fills all registration fields from the existing patient record and
 * submits a PUT /patients/{id} with only the changed data.
 *
 * Visual style matches new/page.tsx (same inline-style constants, same
 * section card layout).
 *
 * RBAC:
 *   - All authenticated roles can reach this page (the Edit button is visible
 *     to all on the profile page).
 *   - isPwd and isPregnant flags are editable only by Admins; other roles see
 *     them as read-only text.
 */

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePatient, useUpdatePatient } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import { swSuccess, swError } from "@/lib/swal";
import { patientUpdateSchema, type PatientUpdateFormValues } from "@/lib/schemas/patient";

// ---------------------------------------------------------------------------
// Shared styles (identical to new/page.tsx)
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
// Read-only flag row (shown to non-Admin roles)
// ---------------------------------------------------------------------------

function ReadOnlyFlag({
  label,
  active,
  description,
}: {
  label: string;
  active: boolean;
  description: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.625rem",
        fontSize: "0.875rem",
        color: "#3d2222",
        opacity: active ? 1 : 0.5,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 18,
          height: 18,
          borderRadius: 3,
          border: "2px solid #d4b0b0",
          background: active ? "linear-gradient(135deg, #b5343e, #c94060)" : "white",
          flexShrink: 0,
          marginTop: 1,
        }}
      />
      <span>
        <strong>{label}</strong>
        {active ? " (set)" : " (not set)"}
        <br />
        <span style={{ color: "#9b6e6e", fontSize: "0.75rem" }}>{description}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PatientEditPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  const router = useRouter();
  const { data: patient, loading: patientLoading, error: patientError } = usePatient(patientId);
  const { updatePatient, loading: saving, error: saveError } = useUpdatePatient(patientId);
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<PatientUpdateFormValues>({
    resolver: zodResolver(patientUpdateSchema),
    mode: "onBlur",
    defaultValues: {
      isPwd: false,
      isPregnant: false,
      confirmDuplicate: false,
      sex: undefined,
      philhealthMemberType: null,
      bloodType: null,
    },
  });

  // Populate form once patient data arrives (only once via reset)
  useEffect(() => {
    if (patient) {
      reset({
        firstName: patient.firstName,
        middleName: patient.middleName ?? null,
        lastName: patient.lastName,
        birthDate: patient.birthDate,
        sex: patient.sex,
        civilStatus: patient.civilStatus ?? null,
        mobileNumber: patient.mobileNumber ?? null,
        address: patient.address,
        guardianName: patient.guardianName ?? null,
        guardianContact: patient.guardianContact ?? null,
        philhealthNo: patient.philhealthNo ?? null,
        philhealthMemberType: patient.philhealthMemberType ?? null,
        isPwd: patient.isPwd,
        isPregnant: patient.isPregnant,
        bloodType: (patient.bloodType as PatientUpdateFormValues["bloodType"]) ?? null,
        confirmDuplicate: false,
      });
    }
  }, [patient, reset]);

  // Watch values needed for conditional rendering / display
  const birthDateValue = watch("birthDate") ?? "";
  const philhealthMemberTypeValue = watch("philhealthMemberType");

  const age = computeAge(birthDateValue);

  const onSubmit = async (data: PatientUpdateFormValues) => {
    const payload = {
      firstName: data.firstName.trim(),
      middleName: data.middleName?.trim() || undefined,
      lastName: data.lastName.trim(),
      birthDate: data.birthDate,
      sex: data.sex,
      civilStatus: data.civilStatus?.trim() || undefined,
      mobileNumber: data.mobileNumber?.trim() || undefined,
      address: data.address.trim(),
      guardianName: data.guardianName?.trim() || undefined,
      guardianContact: data.guardianContact?.trim() || undefined,
      philhealthNo: data.philhealthNo?.trim() || undefined,
      philhealthMemberType: data.philhealthMemberType ?? undefined,
      isPwd: isAdmin ? (data.isPwd ?? false) : (patient?.isPwd ?? false),
      isPregnant: isAdmin ? (data.isPregnant ?? false) : (patient?.isPregnant ?? false),
      bloodType: data.bloodType ?? null,
    };

    const updated = await updatePatient(payload);
    if (!updated) {
      void swError(saveError?.message ?? "Failed to save patient record.");
      return;
    }

    void swSuccess("Patient record updated successfully.");
    router.push(`/patients/${patientId}`);
  };

  // -------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------

  if (patientLoading) {
    return (
      <div
        style={{
          padding: "3rem",
          textAlign: "center",
          color: "#b09090",
          fontSize: "0.875rem",
        }}
      >
        Loading patient record...
      </div>
    );
  }

  if (patientError || !patient) {
    return (
      <div
        style={{
          padding: "1.5rem",
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: "0.5rem",
          color: "#dc2626",
          fontSize: "0.875rem",
        }}
      >
        {patientError?.message ?? "Patient not found."}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href={`/patients/${patientId}`}
          style={{
            fontSize: "0.8125rem",
            color: "#9b6e6e",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            marginBottom: "0.5rem",
          }}
        >
          &#8592; Back to Patient Profile
        </Link>
        <h1
          style={{
            fontSize: "1.5rem",
            fontFamily: "var(--font-dm-serif, Georgia, serif)",
            fontWeight: 400,
            color: "#1a0808",
            marginBottom: "0.25rem",
            marginTop: 0,
          }}
        >
          Edit Patient: {patient.fullName}
        </h1>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "0.8125rem",
            color: "#9b6e6e",
          }}
        >
          {patient.patientCode}
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
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
                {...register("firstName")}
                style={{
                  ...inputStyle,
                  borderColor: errors.firstName ? "#fca5a5" : "#e5d4cc",
                }}
                placeholder="e.g. Maria"
              />
              {errors.firstName && <p style={errorStyle}>{errors.firstName.message}</p>}
            </div>

            {/* Middle Name */}
            <div>
              <label style={labelStyle} htmlFor="middleName">
                Middle Name
              </label>
              <input
                id="middleName"
                type="text"
                {...register("middleName")}
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
                {...register("lastName")}
                style={{
                  ...inputStyle,
                  borderColor: errors.lastName ? "#fca5a5" : "#e5d4cc",
                }}
                placeholder="e.g. Dela Cruz"
              />
              {errors.lastName && <p style={errorStyle}>{errors.lastName.message}</p>}
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
                max={new Date().toISOString().split("T")[0]}
                {...register("birthDate")}
                style={{
                  ...inputStyle,
                  borderColor: errors.birthDate ? "#fca5a5" : "#e5d4cc",
                }}
              />
              {errors.birthDate && <p style={errorStyle}>{errors.birthDate.message}</p>}
            </div>

            {/* Age (computed — read-only) */}
            <div>
              <label style={labelStyle}>Age</label>
              <div
                style={{
                  ...inputStyle,
                  background: "#fdf5f0",
                  color: "#7a5252",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {birthDateValue ? `${age} years old` : "—"}
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
              <Controller
                name="sex"
                control={control}
                render={({ field }) => (
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
                          checked={field.value === s}
                          onChange={() => field.onChange(s)}
                          onBlur={field.onBlur}
                        />
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </label>
                    ))}
                  </div>
                )}
              />
              {errors.sex && <p style={errorStyle}>{errors.sex.message}</p>}
            </div>

            {/* Civil Status */}
            <div>
              <label style={labelStyle} htmlFor="civilStatus">
                Civil Status
              </label>
              <select
                id="civilStatus"
                {...register("civilStatus")}
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

          {/* Blood Type — second row in Demographics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle} htmlFor="bloodType">
                Blood Type
              </label>
              <select
                id="bloodType"
                {...register("bloodType")}
                style={inputStyle}
              >
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
          </div>
        </div>

        {/* ── Section 3: PhilHealth ──────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>PhilHealth</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* PhilHealth Member Type */}
            <div>
              <label style={labelStyle}>PhilHealth Member / Dependent</label>
              <Controller
                name="philhealthMemberType"
                control={control}
                render={({ field }) => (
                  <div style={{ display: "flex", gap: "1rem", paddingTop: "0.5rem" }}>
                    <label
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
                        name="philhealthType"
                        value=""
                        checked={!field.value}
                        onChange={() => field.onChange(null)}
                        onBlur={field.onBlur}
                      />
                      No
                    </label>
                    <label
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
                        name="philhealthType"
                        value="member"
                        checked={field.value === "member"}
                        onChange={() => field.onChange("member")}
                        onBlur={field.onBlur}
                      />
                      Member
                    </label>
                    <label
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
                        name="philhealthType"
                        value="dependent"
                        checked={field.value === "dependent"}
                        onChange={() => field.onChange("dependent")}
                        onBlur={field.onBlur}
                      />
                      Dependent
                    </label>
                  </div>
                )}
              />
            </div>

            {/* PhilHealth No. */}
            <div>
              <label style={labelStyle} htmlFor="philhealthNo">
                PhilHealth No.
              </label>
              <input
                id="philhealthNo"
                type="text"
                {...register("philhealthNo")}
                style={inputStyle}
                placeholder="e.g. 12-345678901-2"
                disabled={!philhealthMemberTypeValue}
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
              {...register("mobileNumber")}
              style={{
                ...inputStyle,
                borderColor: errors.mobileNumber ? "#fca5a5" : "#e5d4cc",
              }}
              placeholder="e.g. 09171234567 or +639171234567"
            />
            {errors.mobileNumber && <p style={errorStyle}>{errors.mobileNumber.message}</p>}
            <p style={{ fontSize: "0.75rem", color: "#b09090", marginTop: "0.25rem" }}>
              Used for appointment reminders and SMS notifications
            </p>
          </div>
          <div>
            <label style={labelStyle} htmlFor="address">
              Complete Address <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              id="address"
              rows={3}
              {...register("address")}
              style={{
                ...inputStyle,
                resize: "vertical",
                borderColor: errors.address ? "#fca5a5" : "#e5d4cc",
              }}
              placeholder="House No., Street, Barangay, Municipality, Province"
            />
            {errors.address && <p style={errorStyle}>{errors.address.message}</p>}
          </div>
        </div>

        {/* ── Section 5: Emergency Contact ─────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Emergency Contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle} htmlFor="guardianName">
                Contact Name
              </label>
              <input
                id="guardianName"
                type="text"
                {...register("guardianName")}
                style={inputStyle}
                placeholder="Full name of emergency contact"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="guardianContact">
                Contact No.
              </label>
              <input
                id="guardianContact"
                type="tel"
                {...register("guardianContact")}
                style={{
                  ...inputStyle,
                  borderColor: errors.guardianContact ? "#fca5a5" : "#e5d4cc",
                }}
                placeholder="e.g. 09171234567"
              />
              {errors.guardianContact && (
                <p style={errorStyle}>{errors.guardianContact.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 6: Special Flags ─────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Special Status</div>
          {isAdmin ? (
            /* Admins can toggle flags */
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "#3d2222",
                }}
              >
                <input
                  type="checkbox"
                  {...register("isPwd")}
                  style={{ width: 18, height: 18 }}
                />
                <span>
                  <strong>Person with Disability (PWD)</strong>
                  <br />
                  <span style={{ color: "#9b6e6e", fontSize: "0.75rem" }}>
                    Priority queuing and accessibility accommodations
                  </span>
                </span>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "#3d2222",
                }}
              >
                <input
                  type="checkbox"
                  {...register("isPregnant")}
                  style={{ width: 18, height: 18 }}
                />
                <span>
                  <strong>Currently Pregnant</strong>
                  <br />
                  <span style={{ color: "#9b6e6e", fontSize: "0.75rem" }}>
                    Enables prenatal tracking and related reminders
                  </span>
                </span>
              </label>
            </div>
          ) : (
            /* Non-admins: read-only */
            <div>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#b09090",
                  marginBottom: "1rem",
                  marginTop: 0,
                }}
              >
                Special status flags can only be changed by an Administrator.
              </p>
              <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <ReadOnlyFlag
                  label="Person with Disability (PWD)"
                  active={patient.isPwd}
                  description="Priority queuing and accessibility accommodations"
                />
                <ReadOnlyFlag
                  label="Currently Pregnant"
                  active={patient.isPregnant}
                  description="Enables prenatal tracking and related reminders"
                />
              </div>
            </div>
          )}
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
          <Link
            href={`/patients/${patientId}`}
            style={{
              padding: "0.625rem 1.25rem",
              border: "1px solid #e5d4cc",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#3d2222",
              textDecoration: "none",
              background: "white",
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "0.625rem 1.5rem",
              background: saving ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
