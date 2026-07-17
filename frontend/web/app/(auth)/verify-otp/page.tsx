import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify OTP" };

/**
 * OTP verification page — second factor in the MFA flow.
 * User is redirected here after successful password login.
 */
export default function VerifyOtpPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "#0f172a" }}>
        Verify Your Identity
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
        Enter the 6-digit code sent to your registered mobile number.
      </p>
      {/* TODO: Implement OtpForm component in Phase 1 */}
      <p style={{ marginTop: "2rem", color: "#94a3b8", fontSize: "0.75rem" }}>
        OTP verification form — coming in Phase 1
      </p>
    </div>
  );
}
