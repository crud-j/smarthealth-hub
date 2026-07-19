"use client";

/**
 * Verify OTP page — Phase 1 MFA flow, step 2.
 *
 * Reads the user UUID (`mfa_user_id`) from sessionStorage — if it is missing
 * the user is redirected to /login.
 *
 * Behaviour:
 *  - Renders OtpInput with auto-submit on completion.
 *  - 60-second countdown with "Resend code" button activated at 0.
 *  - Redirects to /dashboard on successful verification.
 *  - Shows inline error message on failure.
 */

import { useEffect, useRef, useState } from "react";
import OtpInput from "../../../components/forms/OtpInput";
import { useLogin } from "../../../hooks/useAuth";
import { useOtpTimer } from "../../../hooks/useOtpTimer";
import { resendOtp } from "../../../lib/auth";
import { ApiError } from "../../../lib/api-client";

export default function VerifyOtpPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const { runStep2, isLoading: isVerifying } = useLogin();
  const { secondsLeft, isActive: isTimerActive, restart: restartTimer } =
    useOtpTimer(60);
  const hasRedirected = useRef(false);

  // ---------------------------------------------------------------------------
  // On mount: read userId from sessionStorage or redirect to /login
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("mfa_user_id");
    if (!stored) {
      window.location.href = "/login";
      return;
    }
    setUserId(stored);
  }, []);

  // ---------------------------------------------------------------------------
  // OTP submission — triggered automatically when all 6 digits are filled
  // ---------------------------------------------------------------------------

  async function handleOtpComplete(otp: string) {
    if (!userId || isVerifying || hasRedirected.current) return;
    setApiError(null);

    try {
      await runStep2(userId, otp);
      // Clear the session hint — it is no longer needed.
      sessionStorage.removeItem("mfa_user_id");
      hasRedirected.current = true;
      // Redirect to ?next= if present and is a safe relative path, else dashboard.
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      const safePath = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      window.location.href = safePath;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Verification failed. Please try again.";
      setApiError(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Resend OTP
  // ---------------------------------------------------------------------------

  async function handleResend() {
    if (!userId || isResending || isTimerActive) return;
    setIsResending(true);
    setResendMessage(null);
    setApiError(null);

    try {
      await resendOtp(userId);
      setResendMessage("A new code has been sent to your mobile number.");
      restartTimer();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to resend OTP. Please try again.";
      setApiError(message);
    } finally {
      setIsResending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const resendButtonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: isTimerActive || isResending ? "#94a3b8" : "#2563eb",
    cursor:
      isTimerActive || isResending ? "not-allowed" : "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
    padding: 0,
    textDecoration: isTimerActive || isResending ? "none" : "underline",
  };

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem", textAlign: "center" }}>
        {/* Lock icon */}
        <div
          style={{
            width: "3rem",
            height: "3rem",
            backgroundColor: "#eff6ff",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1
          style={{
            fontSize: "1.375rem",
            fontWeight: 700,
            color: "#0f172a",
            margin: "0 0 0.375rem",
          }}
        >
          Verify your identity
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Enter the 6-digit code sent to your registered mobile number.
        </p>
      </div>

      {/* API error */}
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
            marginBottom: "1.25rem",
            textAlign: "center",
          }}
        >
          {apiError}
        </div>
      )}

      {/* Resend success message */}
      {resendMessage && (
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
            textAlign: "center",
          }}
        >
          {resendMessage}
        </div>
      )}

      {/* OTP input */}
      <div style={{ marginBottom: "1.5rem" }}>
        <OtpInput
          onChange={handleOtpComplete}
          disabled={isVerifying}
          hasError={apiError !== null}
        />
      </div>

      {/* Loading indicator */}
      {isVerifying && (
        <p
          style={{
            textAlign: "center",
            color: "#64748b",
            fontSize: "0.875rem",
            margin: "0 0 1rem",
          }}
          aria-live="polite"
        >
          Verifying...
        </p>
      )}

      {/* Countdown and resend */}
      <div style={{ textAlign: "center" }}>
        {isTimerActive ? (
          <p
            style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 0.5rem" }}
            aria-live="polite"
          >
            Resend code in{" "}
            <span
              style={{ fontWeight: 600, color: "#0f172a" }}
              aria-label={`${secondsLeft} seconds`}
            >
              {secondsLeft}s
            </span>
          </p>
        ) : (
          <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
            Did not receive the code?
          </p>
        )}
        <button
          onClick={handleResend}
          disabled={isTimerActive || isResending}
          style={resendButtonStyle}
          aria-disabled={isTimerActive || isResending}
        >
          {isResending ? "Sending..." : "Resend code"}
        </button>
      </div>

      {/* Back link */}
      <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <a
          href="/login"
          style={{ color: "#64748b", fontSize: "0.8125rem", textDecoration: "none" }}
        >
          Back to sign in
        </a>
      </div>
    </>
  );
}
