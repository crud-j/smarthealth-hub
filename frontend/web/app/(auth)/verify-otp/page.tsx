"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import OtpInput from "../../../components/forms/OtpInput";
import { useLogin } from "../../../hooks/useAuth";
import { useOtpTimer } from "../../../hooks/useOtpTimer";
import { resendOtp } from "../../../lib/auth";
import { ApiError } from "../../../lib/api-client";
import { isPasskeySupported } from "../../../lib/passkey";

export default function VerifyOtpPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const { runStep2, isLoading: isVerifying } = useLogin();
  const { secondsLeft, isActive: isTimerActive, restart: restartTimer } = useOtpTimer(60);
  const hasRedirected = useRef(false);

  useEffect(() => {
    setPasskeySupported(isPasskeySupported());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("mfa_user_id");
    if (!stored) {
      window.location.href = "/login";
      return;
    }
    setUserId(stored);
  }, []);

  async function handleOtpComplete(otp: string) {
    if (!userId || isVerifying || hasRedirected.current) return;
    setApiError(null);
    try {
      await runStep2(userId, otp);
      sessionStorage.removeItem("mfa_user_id");
      hasRedirected.current = true;
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      const safePath =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      window.location.href = safePath;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Verification failed. Please try again.";
      setApiError(message);
    }
  }

  async function handleResend() {
    if (!userId || isResending || isTimerActive) return;
    setIsResending(true);
    setResendMessage(null);
    setApiError(null);
    try {
      await resendOtp(userId);
      setResendMessage("A new code has been sent to your email address.");
      restartTimer();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to resend OTP. Please try again.";
      setApiError(message);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center mb-4">
          <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
          Verify your identity
        </h1>
        <p className="text-slate-500 text-sm mt-1 max-w-[28ch]">
          Enter the 6-digit code sent to your registered email address.
        </p>
      </div>

      {/* API error */}
      {apiError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-center"
        >
          {apiError}
        </div>
      )}

      {/* Resend success */}
      {resendMessage && (
        <div
          role="status"
          className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 text-center"
        >
          {resendMessage}
        </div>
      )}

      {/* OTP input */}
      <div className="mb-6">
        <OtpInput
          onChange={handleOtpComplete}
          disabled={isVerifying}
          hasError={apiError !== null}
        />
      </div>

      {/* Verifying indicator */}
      {isVerifying && (
        <p className="text-center text-sm text-slate-500 mb-4" aria-live="polite">
          Verifying…
        </p>
      )}

      {/* Countdown + resend */}
      <div className="text-center">
        {isTimerActive ? (
          <p className="text-sm text-slate-500 mb-2" aria-live="polite">
            Resend code in{" "}
            <span
              className="font-semibold text-slate-800"
              aria-label={`${secondsLeft} seconds`}
            >
              {secondsLeft}s
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-500 mb-2">Did not receive the code?</p>
        )}
        <button
          type="button"
          onClick={handleResend}
          disabled={isTimerActive || isResending}
          className={`text-sm font-medium transition-colors ${
            isTimerActive || isResending
              ? "text-slate-400 cursor-not-allowed"
              : "text-primary hover:underline cursor-pointer"
          }`}
          aria-disabled={isTimerActive || isResending}
        >
          {isResending ? "Sending…" : "Resend code"}
        </button>
      </div>

      {/* Back link */}
      <div className="text-center mt-6">
        <a
          href="/login"
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          Back to sign in
        </a>
      </div>

      {/* Passkey hint — only shown when WebAuthn is supported */}
      {passkeySupported && (
        <div className="text-center mt-2">
          <a
            href="/login"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Try signing in with a passkey instead
          </a>
        </div>
      )}
    </div>
  );
}
