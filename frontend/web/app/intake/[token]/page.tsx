"use client";
/**
 * Public pre-visit intake form.
 * URL: /intake/{token}
 * Auth: None (public — no JWT required)
 */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { patientCreateSchema } from "@/lib/schemas/patient";
import type { PatientCreateFormValues } from "@/lib/schemas/patient";
import { useDraftIntake, useSaveDraft } from "@/hooks/useIntake";

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
  if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
  return Math.max(0, age);
}

export default function IntakePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? null;

  const { data: intakeData, loading: loadingToken, error: tokenError } = useDraftIntake(token);
  const { saveDraft, loading: savingDraft, error: saveError } = useSaveDraft(token);

  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    control,
    watch,
    trigger,
    handleSubmit,
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

  const birthDateValue = watch("birthDate") ?? "";
  const isPwdValue = watch("isPwd");
  const currentAge = useMemo(() => computeAge(birthDateValue), [birthDateValue]);
  const showGuardian = currentAge > 0 && (currentAge < 18 || currentAge >= 60 || isPwdValue);

  if (tokenError || (intakeData === null && !loadingToken && token)) {
    const errorMsg = tokenError ?? "This link has expired or has already been used.";
    return (
      <div style={{ maxWidth: 600, margin: "4rem auto", padding: "1.5rem", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>&#9888;</div>
        <h1 style={{ fontSize: "1.5rem", color: "#1a0808", marginBottom: "0.5rem" }}>Invalid Link</h1>
        <p style={{ color: "#7a5252" }}>{errorMsg}</p>
        <p style={{ color: "#7a5252", marginTop: "1rem" }}>
          Please contact the Sta. Rosa 1 BHS for assistance at (044) 000-0000.
        </p>
      </div>
    );
  }

  if (loadingToken) {
    return (
      <div style={{ maxWidth: 600, margin: "4rem auto", padding: "1.5rem", textAlign: "center", color: "#7a5252" }}>
        Loading intake form...
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 600, margin: "4rem auto", padding: "1.5rem", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>&#10003;</div>
        <h1 style={{ fontSize: "1.5rem", color: "#166534", marginBottom: "0.5rem" }}>Thank You!</h1>
        <p style={{ color: "#374151" }}>
          Your information has been saved. When you arrive at the health center,
          the staff will verify your details and complete your registration.
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "1rem" }}>
          Please bring a valid government ID (PhilID, PhilHealth card, or UMID) and your health card if you have one.
        </p>
      </div>
    );
  }

  const onSubmit: SubmitHandler<PatientCreateFormValues> = async (data) => {
    const payload = {
      first_name: data.firstName,
      middle_name: data.middleName,
      last_name: data.lastName,
      birth_date: data.birthDate,
      sex: data.sex,
      civil_status: data.civilStatus,
      barangay: data.barangay,
      municipality: data.municipality,
      province: data.province,
      mobile_number: data.mobileNumber,
      address: data.address,
      emergency_contact_name: data.emergencyContactName,
      emergency_contact_number: data.emergencyContactNumber,
      guardian_name: data.guardianName,
      guardian_contact: data.guardianContact,
      philhealth_no: data.philhealthNo,
      philhealth_member_type: data.philhealthMemberType,
      is_4ps_beneficiary: data.is4psBeneficiary,
      is_indigenous: data.isIndigenous,
      is_pwd: data.isPwd,
      is_pregnant: data.isPregnant,
      registration_source: data.registrationSource,
      registration_data_source: "pre_visit",
      data_privacy_consent: data.dataPrivacyConsent,
      blood_type: data.bloodType ?? null,
      confirm_duplicate: false,
    };

    const ok = await saveDraft(payload as Record<string, unknown>);
    if (ok) {
      setSubmitted(true);
    }
  };

  const stepFields: Record<number, (keyof PatientCreateFormValues)[]> = {
    1: ["firstName", "middleName", "lastName", "birthDate", "sex", "civilStatus", "barangay", "municipality", "province"],
    2: ["mobileNumber", "address", "emergencyContactName", "emergencyContactNumber"],
    3: ["philhealthNo", "is4psBeneficiary", "isIndigenous", "isPwd", "isPregnant", "dataPrivacyConsent"],
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", color: "#1a0808", marginBottom: "0.5rem" }}>
          Complete Your Health Center Registration
        </h1>
        <p style={{ color: "#7a5252", fontSize: "0.875rem" }}>
          Sta. Rosa 1 BHS — Patubig, Marilao, Bulacan
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.8125rem" }}>
          Please fill in your details below. Staff will verify your information when you arrive.
        </p>
      </div>

      <div style={{ ...sectionStyle, marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#3d2222" }}>
            Step {currentStep} of 3
          </span>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {[1, 2, 3].map((s) => (
              <span key={s} style={{ width: 28, height: 28, borderRadius: "50%", background: s <= currentStep ? "#b5343e" : "#f4e8e3", color: s <= currentStep ? "white" : "#7a5252", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        {currentStep === 1 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "1rem" }}>Identity &amp; Demographics</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="firstName">First Name *</label>
                <input id="firstName" type="text" {...register("firstName")} style={{ ...inputStyle, borderColor: errors.firstName ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.firstName?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="middleName">Middle Name</label>
                <input id="middleName" type="text" {...register("middleName")} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="lastName">Last Name *</label>
                <input id="lastName" type="text" {...register("lastName")} style={{ ...inputStyle, borderColor: errors.lastName ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.lastName?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="birthDate">Birthday *</label>
                <input id="birthDate" type="date" max={new Date().toISOString().split("T")[0]} {...register("birthDate")} style={{ ...inputStyle, borderColor: errors.birthDate ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.birthDate?.message} />
              </div>
              <div>
                <label style={labelStyle}>Sex *</label>
                <Controller name="sex" control={control} render={({ field }) => (
                  <div style={{ display: "flex", gap: "1rem", paddingTop: "0.5rem" }}>
                    {["male", "female"].map((v) => (
                      <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}>
                        <input type="radio" checked={field.value === v} onChange={() => field.onChange(v)} />
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </label>
                    ))}
                  </div>
                )} />
                <FieldError message={errors.sex?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="barangay">Barangay *</label>
                <input id="barangay" type="text" {...register("barangay")} style={{ ...inputStyle, borderColor: errors.barangay ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.barangay?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="municipality">Municipality *</label>
                <input id="municipality" type="text" {...register("municipality")} style={{ ...inputStyle, borderColor: errors.municipality ? "#fca5a5" : "#e5d4cc" }} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="province">Province *</label>
                <input id="province" type="text" {...register("province")} style={{ ...inputStyle, borderColor: errors.province ? "#fca5a5" : "#e5d4cc" }} />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "1rem" }}>Contact &amp; Emergency</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="mobileNumber">Your Mobile No.</label>
                <input id="mobileNumber" type="tel" {...register("mobileNumber")} style={inputStyle} placeholder="09171234567" />
                <FieldError message={errors.mobileNumber?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="emergencyContactName">Emergency Contact Name *</label>
                <input id="emergencyContactName" type="text" {...register("emergencyContactName")} style={{ ...inputStyle, borderColor: errors.emergencyContactName ? "#fca5a5" : "#e5d4cc" }} />
                <FieldError message={errors.emergencyContactName?.message} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="emergencyContactNumber">Emergency Contact No. *</label>
                <input id="emergencyContactNumber" type="tel" {...register("emergencyContactNumber")} style={{ ...inputStyle, borderColor: errors.emergencyContactNumber ? "#fca5a5" : "#e5d4cc" }} placeholder="09171234567" />
                <FieldError message={errors.emergencyContactNumber?.message} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle} htmlFor="address">Home Address *</label>
                <textarea id="address" rows={3} {...register("address")} style={{ ...inputStyle, resize: "vertical", borderColor: errors.address ? "#fca5a5" : "#e5d4cc" }} placeholder="House no., street, sitio, barangay" />
                <FieldError message={errors.address?.message} />
              </div>
              {showGuardian && (
                <>
                  <div>
                    <label style={labelStyle} htmlFor="guardianName">Guardian Name</label>
                    <input id="guardianName" type="text" {...register("guardianName")} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="guardianContact">Guardian Contact No.</label>
                    <input id="guardianContact" type="tel" {...register("guardianContact")} style={inputStyle} placeholder="09171234567" />
                    <FieldError message={errors.guardianContact?.message} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "1rem", color: "#1a0808", marginBottom: "1rem" }}>PhilHealth &amp; Consent</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={labelStyle} htmlFor="philhealthNo">PhilHealth No.</label>
                <input id="philhealthNo" type="text" {...register("philhealthNo")} style={inputStyle} placeholder="12-345678901-2" />
              </div>
            </div>
            <div style={{ marginTop: "1rem", display: "grid", gap: "0.625rem" }}>
              {(
                [
                  ["is4psBeneficiary", "4Ps Beneficiary"],
                  ["isIndigenous", "Indigenous Peoples / IP"],
                  ["isPwd", "Person with Disability (PWD)"],
                  ["isPregnant", "Currently Pregnant"],
                ] as [keyof PatientCreateFormValues, string][]
              ).map(([field, label]) => (
                <label key={field} style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "#3d2222" }}>
                  <input type="checkbox" {...register(field)} style={{ width: 18, height: 18 }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: "1.25rem" }}>
              <label style={{ fontSize: "0.875rem", color: "#3d2222", lineHeight: 1.5, display: "flex", gap: "0.625rem", alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" {...register("dataPrivacyConsent")} style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
                <span>I consent to the collection and processing of my personal health information for registration and care at the Sta. Rosa 1 BHS.</span>
              </label>
              <FieldError message={errors.dataPrivacyConsent?.message} />
            </div>
          </div>
        )}

        {saveError && (
          <div style={{ color: "#991b1b", background: "#fee2e2", borderRadius: "0.375rem", padding: "0.625rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
            {saveError}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", paddingTop: "0.5rem" }}>
          <button type="button" disabled={currentStep === 1} onClick={() => setCurrentStep((s) => Math.max(1, s - 1))} style={{ padding: "0.625rem 1.25rem", border: "1px solid #e5d4cc", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: 600, color: "#3d2222", background: "white" }}>
            Back
          </button>
          {currentStep < 3 ? (
            <button type="button" onClick={async () => {
              const ok = await trigger(stepFields[currentStep]);
              if (ok) setCurrentStep((s) => Math.min(3, s + 1));
            }} style={{ padding: "0.625rem 1.5rem", background: "linear-gradient(135deg, #b5343e, #c94060)", color: "white", border: "none", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: 700 }}>
              Next
            </button>
          ) : (
            <button type="submit" disabled={savingDraft} style={{ padding: "0.625rem 1.5rem", background: savingDraft ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)", color: "white", border: "none", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: 700, cursor: savingDraft ? "not-allowed" : "pointer" }}>
              {savingDraft ? "Saving..." : "Submit My Information"}
            </button>
          )}
        </div>
      </form>

      <p style={{ textAlign: "center", marginTop: "2rem", color: "#9ca3af", fontSize: "0.75rem" }}>
        Your information is kept private and secure. This form is for use by authorized patients only.
      </p>
    </div>
  );
}
