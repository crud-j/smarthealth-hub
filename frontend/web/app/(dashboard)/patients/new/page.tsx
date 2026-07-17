import type { Metadata } from "next";

export const metadata: Metadata = { title: "Register Patient" };

/**
 * New patient registration page — multi-step form collecting demographics,
 * contact info, medical history, and generating the hybrid health card.
 * Full implementation in Phase 2 (Patient Records).
 */
export default function NewPatientPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Register New Patient
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Complete the registration form to create a new patient record and health card.
      </p>
      {/* TODO: Implement PatientRegistrationForm in Phase 2 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
        Patient registration form — coming in Phase 2
      </p>
    </div>
  );
}
