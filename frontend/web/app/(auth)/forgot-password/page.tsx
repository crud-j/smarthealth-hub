import type { Metadata } from "next";

export const metadata: Metadata = { title: "Forgot Password" };

/**
 * Forgot password page — triggers SMS-based password reset flow.
 */
export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "#0f172a" }}>
        Reset Password
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
        Enter your registered mobile number to receive a password reset code via SMS.
      </p>
      {/* TODO: Implement ForgotPasswordForm component in Phase 1 */}
      <p style={{ marginTop: "2rem", color: "#94a3b8", fontSize: "0.75rem" }}>
        Password reset form — coming in Phase 1
      </p>
    </div>
  );
}
