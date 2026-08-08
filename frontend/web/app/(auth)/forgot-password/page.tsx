"use client";

/**
 * Forgot password page — two-step, single-page OTP-based password reset flow.
 *
 * Step 1 ("email"): Collect the user's email and call POST /auth/forgot-password.
 *                   Always transitions to step 2 regardless of whether the
 *                   email is registered (anti-enumeration).
 * Step 2 ("reset"): Collect the 6-digit OTP + new password and call
 *                   POST /auth/reset-password using the session_hint UUID
 *                   received in step 1.
 * Step 3 ("done"):  Show success message and auto-redirect to /login after 2 s.
 *
 * Visual style matches login/page.tsx exactly (same inline style tokens,
 * same input / button / link patterns).
 */

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "email" | "reset" | "done";

// ---------------------------------------------------------------------------
// Password complexity helper (mirrors ResetPasswordRequest validator)
// ---------------------------------------------------------------------------

function validatePassword(p: string): string | null {
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(p)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(p)) return "Password must contain at least one digit.";
  return null;
}

// ---------------------------------------------------------------------------
// Shared style tokens (kept close to login/page.tsx)
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  border: "1.5px solid #e2e8f0",
  borderRadius: "0.5rem",
  fontSize: "0.9375rem",
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease",
};

const errorTextStyle: React.CSSProperties = {
  color: "#ef4444",
  fontSize: "0.8125rem",
  marginTop: "0.25rem",
  display: "block",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
  marginBottom: "0.375rem",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ForgotPasswordPage() {
  const router = useRouter();

  // ── Shared ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("email");

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // UUID string returned by the API — held in React state only (no localStorage).
  const [sessionHint, setSessionHint] = useState<string | null>(null);

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Inline (per-field) validation errors — fire on change, not only on submit.
  const [otpError, setOtpError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // ── Step 3 — auto-redirect ────────────────────────────────────────────────
  useEffect(() => {
    if (step === "done") {
      const t = setTimeout(() => router.push("/login"), 2000);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  // ---------------------------------------------------------------------------
  // Step 1 — submit email
  // ---------------------------------------------------------------------------

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStep1Error(null);
    setEmailFieldError(null);

    // Client-side validation
    if (email.trim() === "") {
      setEmailFieldError("Email is required.");
      return;
    }
    if (!email.includes("@")) {
      setEmailFieldError("Enter a valid email address.");
      return;
    }

    setStep1Loading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });

      // Parse response — we expect 200 in all cases (anti-enumeration).
      // If the server unexpectedly returns a non-200, surface a generic error
      // but still allow the user to continue (the reset step will fail with
      // a clear API error if session_hint is null).
      let data: { session_hint?: string; message?: string } = {};
      try {
        data = await res.json();
      } catch {
        // JSON parse failure — proceed with null hint.
      }

      setSessionHint(data.session_hint ?? null);
      // Always transition to step 2 (anti-enumeration).
      setStep("reset");
    } catch {
      // Network error — show message but do NOT reveal whether email existed.
      setStep1Error("Unable to reach the server. Check your connection and try again.");
    } finally {
      setStep1Loading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2 — inline validation handlers
  // ---------------------------------------------------------------------------

  function handleOtpChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(v);
    setOtpError(v.length > 0 && v.length < 6 ? "OTP must be 6 digits." : null);
  }

  function handleNewPasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setNewPassword(v);
    const err = validatePassword(v);
    setPasswordError(err);
    // Also re-validate confirm if it has been touched.
    if (confirmPassword) {
      setConfirmError(v !== confirmPassword ? "Passwords do not match." : null);
    }
  }

  function handleConfirmPasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setConfirmPassword(v);
    setConfirmError(v !== newPassword ? "Passwords do not match." : null);
  }

  // ---------------------------------------------------------------------------
  // Step 2 — submit reset
  // ---------------------------------------------------------------------------

  async function handleResetSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStep2Error(null);

    // Validate all fields before hitting the API.
    const errors: string[] = [
      otp.length !== 6 ? "OTP must be 6 digits." : null,
      validatePassword(newPassword),
      newPassword !== confirmPassword ? "Passwords do not match." : null,
    ].filter((x): x is string => x !== null);

    if (errors.length > 0) {
      setStep2Error(errors[0]);
      return;
    }

    setStep2Loading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: sessionHint,
          otp_code: otp,
          new_password: newPassword,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        let detail = "Failed to reset password. Please try again.";
        try {
          const data = await res.json();
          if (typeof data?.detail === "string") detail = data.detail;
        } catch {
          // leave default message
        }
        setStep2Error(detail);
        return;
      }

      setStep("done");
    } catch {
      setStep2Error("Unable to reach the server. Check your connection and try again.");
    } finally {
      setStep2Loading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived button styles (depend on loading state)
  // ---------------------------------------------------------------------------

  function primaryButtonStyle(loading: boolean): React.CSSProperties {
    return {
      width: "100%",
      padding: "0.75rem",
      backgroundColor: loading ? "#93c5fd" : "#2563eb",
      color: "#ffffff",
      border: "none",
      borderRadius: "0.5rem",
      fontSize: "0.9375rem",
      fontWeight: 600,
      cursor: loading ? "not-allowed" : "pointer",
      marginTop: "0.5rem",
      transition: "background-color 0.15s ease",
    };
  }

  // ---------------------------------------------------------------------------
  // Success banner (shown at top of step 2)
  // ---------------------------------------------------------------------------

  const successBanner = (
    <div
      role="status"
      style={{
        padding: "0.75rem 1rem",
        backgroundColor: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: "0.5rem",
        color: "#15803d",
        fontSize: "0.875rem",
        marginBottom: "1.25rem",
      }}
    >
      Check your email — we sent an OTP to the email address linked to this account.
    </div>
  );

  // ---------------------------------------------------------------------------
  // Shared page header
  // ---------------------------------------------------------------------------

  const pageHeader = (
    <div style={{ marginBottom: "1.75rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          marginBottom: "0.75rem",
        }}
      >
        <div
          style={{
            width: "2.5rem",
            height: "2.5rem",
            backgroundColor: "#2563eb",
            borderRadius: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
        </div>
        <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "#0f172a" }}>
          SmartHealth Hub
        </span>
      </div>
      <h1
        style={{
          fontSize: "1.375rem",
          fontWeight: 700,
          color: "#0f172a",
          margin: 0,
        }}
      >
        Reset your password
      </h1>
      <p
        style={{
          color: "#64748b",
          fontSize: "0.875rem",
          marginTop: "0.375rem",
        }}
      >
        {step === "email"
          ? "Enter your registered email address to receive a reset code."
          : "Enter the code we sent and choose a new password."}
      </p>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Bottom back-to-login link (present on every step)
  // ---------------------------------------------------------------------------

  const backLink = (
    <p
      style={{
        marginTop: "1.5rem",
        textAlign: "center",
        fontSize: "0.8125rem",
        color: "#64748b",
      }}
    >
      <a
        href="/login"
        style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
      >
        &larr; Back to login
      </a>
    </p>
  );

  // ---------------------------------------------------------------------------
  // Step 1 — email form
  // ---------------------------------------------------------------------------

  if (step === "email") {
    return (
      <>
        {pageHeader}

        {/* API-level error banner */}
        {step1Error && (
          <div
            role="alert"
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.5rem",
              color: "#dc2626",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {step1Error}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} noValidate>
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="fp-email" style={labelStyle}>
              Email address
            </label>
            <input
              id="fp-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailFieldError) setEmailFieldError(null);
              }}
              style={{
                ...inputStyle,
                borderColor: emailFieldError ? "#ef4444" : "#e2e8f0",
              }}
              placeholder="staff@example.com"
              aria-describedby={emailFieldError ? "fp-email-error" : undefined}
              aria-invalid={emailFieldError !== null}
              disabled={step1Loading}
            />
            {emailFieldError && (
              <span id="fp-email-error" style={errorTextStyle} role="alert">
                {emailFieldError}
              </span>
            )}
          </div>

          <button
            type="submit"
            style={primaryButtonStyle(step1Loading)}
            disabled={step1Loading}
          >
            {step1Loading ? "Sending..." : "Send reset code"}
          </button>
        </form>

        {backLink}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2 — OTP + new password form
  // ---------------------------------------------------------------------------

  if (step === "reset") {
    return (
      <>
        {pageHeader}
        {successBanner}

        {/* API-level error banner */}
        {step2Error && (
          <div
            role="alert"
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.5rem",
              color: "#dc2626",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {step2Error}
          </div>
        )}

        <form onSubmit={handleResetSubmit} noValidate>
          {/* OTP */}
          <div style={{ marginBottom: "1.125rem" }}>
            <label htmlFor="fp-otp" style={labelStyle}>
              6-digit reset code
            </label>
            <input
              id="fp-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={handleOtpChange}
              style={{
                ...inputStyle,
                letterSpacing: "0.25em",
                borderColor: otpError ? "#ef4444" : "#e2e8f0",
              }}
              placeholder="123456"
              maxLength={6}
              aria-describedby={otpError ? "fp-otp-error" : undefined}
              aria-invalid={otpError !== null}
              disabled={step2Loading}
            />
            {otpError && (
              <span id="fp-otp-error" style={errorTextStyle} role="alert">
                {otpError}
              </span>
            )}
          </div>

          {/* New password */}
          <div style={{ marginBottom: "1.125rem" }}>
            <label htmlFor="fp-password" style={labelStyle}>
              New password
            </label>
            <input
              id="fp-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              style={{
                ...inputStyle,
                borderColor: passwordError ? "#ef4444" : "#e2e8f0",
              }}
              placeholder="Min 8 chars, 1 uppercase, 1 digit"
              aria-describedby={passwordError ? "fp-password-error" : undefined}
              aria-invalid={passwordError !== null}
              disabled={step2Loading}
            />
            {passwordError && (
              <span id="fp-password-error" style={errorTextStyle} role="alert">
                {passwordError}
              </span>
            )}
          </div>

          {/* Confirm password */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="fp-confirm" style={labelStyle}>
              Confirm new password
            </label>
            <input
              id="fp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              style={{
                ...inputStyle,
                borderColor: confirmError ? "#ef4444" : "#e2e8f0",
              }}
              placeholder="Re-enter your new password"
              aria-describedby={confirmError ? "fp-confirm-error" : undefined}
              aria-invalid={confirmError !== null}
              disabled={step2Loading}
            />
            {confirmError && (
              <span id="fp-confirm-error" style={errorTextStyle} role="alert">
                {confirmError}
              </span>
            )}
          </div>

          <button
            type="submit"
            style={primaryButtonStyle(step2Loading)}
            disabled={step2Loading}
          >
            {step2Loading ? "Resetting..." : "Reset password"}
          </button>
        </form>

        {backLink}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3 — done
  // ---------------------------------------------------------------------------

  return (
    <>
      {pageHeader}

      <div
        role="status"
        style={{
          padding: "1rem",
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: "0.5rem",
          color: "#15803d",
          fontSize: "0.875rem",
          textAlign: "center",
          marginBottom: "1.25rem",
        }}
      >
        Password reset successfully. Redirecting to login&hellip;
      </div>

      {backLink}
    </>
  );
}
