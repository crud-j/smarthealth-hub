"use client";

/**
 * Login page — Phase 1 MFA flow, step 1.
 *
 * Collects email + password and calls POST /auth/login.
 * On success the session_hint (user UUID) is stored in sessionStorage and the
 * user is redirected to /verify-otp to complete the second factor.
 *
 * No external form library is used — validation is done with vanilla React
 * state so there are no extra package dependencies.
 */

import { type FormEvent, useState } from "react";
import { useLogin } from "../../../hooks/useAuth";
import { ApiError } from "../../../lib/api-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  const { runStep1, isLoading, error: apiError, clearError } = useLogin();

  // ---------------------------------------------------------------------------
  // Client-side validation
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      errors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();

    if (!validate()) return;

    try {
      const { sessionHint } = await runStep1(email.trim(), password);
      // Store the user UUID between the two login steps.
      sessionStorage.setItem("mfa_user_id", sessionHint);
      // Carry the ?next= param through to verify-otp so post-OTP redirect works.
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      window.location.href = next ? `/verify-otp?next=${encodeURIComponent(next)}` : "/verify-otp";
    } catch (err) {
      // ApiError message is surfaced via the `apiError` state from useLogin.
      // Non-ApiError failures (network outage, etc.) get a generic message.
      if (!(err instanceof ApiError)) {
        console.error("Unexpected login error:", err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Styles (inline to keep zero external CSS dependencies)
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

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: isLoading ? "#93c5fd" : "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "0.5rem",
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: isLoading ? "not-allowed" : "pointer",
    marginTop: "0.5rem",
    transition: "background-color 0.15s ease",
  };

  return (
    <>
      {/* Header */}
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
          <span
            style={{ fontSize: "1.125rem", fontWeight: 700, color: "#0f172a" }}
          >
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
          Sign in to your account
        </h1>
        <p
          style={{
            color: "#64748b",
            fontSize: "0.875rem",
            marginTop: "0.375rem",
          }}
        >
          Enter your credentials to access the health information system.
        </p>
      </div>

      {/* API-level error banner */}
      {apiError && (
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
          {apiError}
        </div>
      )}

      {/* Login form */}
      <form onSubmit={handleSubmit} noValidate>
        {/* Email */}
        <div style={{ marginBottom: "1.125rem" }}>
          <label htmlFor="email" style={labelStyle}>
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            style={{
              ...inputStyle,
              borderColor: fieldErrors.email ? "#ef4444" : "#e2e8f0",
            }}
            placeholder="staff@example.com"
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            aria-invalid={fieldErrors.email !== undefined}
            disabled={isLoading}
          />
          {fieldErrors.email && (
            <span id="email-error" style={errorTextStyle} role="alert">
              {fieldErrors.email}
            </span>
          )}
        </div>

        {/* Password */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "0.375rem",
            }}
          >
            <label htmlFor="password" style={{ ...labelStyle, margin: 0 }}>
              Password
            </label>
            <a
              href="/forgot-password"
              style={{
                fontSize: "0.8125rem",
                color: "#2563eb",
                textDecoration: "none",
              }}
            >
              Forgot password?
            </a>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) {
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }
            }}
            style={{
              ...inputStyle,
              borderColor: fieldErrors.password ? "#ef4444" : "#e2e8f0",
            }}
            placeholder="Your password"
            aria-describedby={
              fieldErrors.password ? "password-error" : undefined
            }
            aria-invalid={fieldErrors.password !== undefined}
            disabled={isLoading}
          />
          {fieldErrors.password && (
            <span id="password-error" style={errorTextStyle} role="alert">
              {fieldErrors.password}
            </span>
          )}
        </div>

        {/* Submit */}
        <button type="submit" style={buttonStyle} disabled={isLoading}>
          {isLoading ? "Verifying..." : "Continue"}
        </button>
      </form>

      {/* Footer note */}
      <p
        style={{
          marginTop: "1.5rem",
          color: "#94a3b8",
          fontSize: "0.75rem",
          textAlign: "center",
        }}
      >
        For BHC staff only. Unauthorised access is prohibited.
      </p>
    </>
  );
}
