import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In" };

/**
 * Login page — placeholder for Phase 1 (Foundation) implementation.
 * Full credential + MFA OTP form will be implemented in the auth feature phase.
 */
export default function LoginPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "#0f172a" }}>
        Sign in to SmartHealth Hub
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
        Enter your credentials to access the health information system.
      </p>
      {/* TODO: Implement LoginForm component in Phase 1 */}
      <p style={{ marginTop: "2rem", color: "#94a3b8", fontSize: "0.75rem" }}>
        Login form — coming in Phase 1
      </p>
    </div>
  );
}
