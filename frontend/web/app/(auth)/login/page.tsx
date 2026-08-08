"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft, Fingerprint, KeyRound, ScanFace, ShieldCheck } from "lucide-react";

import { useLogin } from "../../../hooks/useAuth";
import { ApiError } from "../../../lib/api-client";
import { isPasskeySupported, startPasskeyAuthentication } from "../../../lib/passkey";
import { passkeyAuthBegin, passkeyAuthComplete } from "../../../lib/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BHC_LOGO = "/BHCFINALLOGO.png";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [mode, setMode] = useState<"email-only" | "password">("email-only");
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPasskeySupported(isPasskeySupported());
  }, []);

  useEffect(() => {
    if (mode === "password") passwordRef.current?.focus();
  }, [mode]);

  const { runStep1, isLoading, error: apiError, clearError } = useLogin();

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validateEmail(): boolean {
    if (!email.trim()) {
      setFieldErrors((p) => ({ ...p, email: "Email address is required." }));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldErrors((p) => ({ ...p, email: "Enter a valid email address." }));
      return false;
    }
    setFieldErrors((p) => ({ ...p, email: undefined }));
    return true;
  }

  function validatePassword(): boolean {
    if (!password) {
      setFieldErrors((p) => ({ ...p, password: "Password is required." }));
      return false;
    }
    if (password.length < 8) {
      setFieldErrors((p) => ({ ...p, password: "Password must be at least 8 characters." }));
      return false;
    }
    setFieldErrors((p) => ({ ...p, password: undefined }));
    return true;
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleUsePassword() {
    if (!validateEmail()) return;
    clearError();
    setPasskeyError(null);
    setMode("password");
  }

  async function handlePasskeyLogin() {
    if (!validateEmail()) return;
    setPasskeyError(null);
    setIsPasskeyLoading(true);
    try {
      const { options } = await passkeyAuthBegin(email.trim());
      const assertion = await startPasskeyAuthentication(options);
      await passkeyAuthComplete(assertion, email.trim());
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      window.location.href = safeNext ?? "/dashboard";
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setPasskeyError("Passkey sign-in was cancelled.");
      } else if (err instanceof ApiError) {
        setPasskeyError(
          err.message.includes("No passkeys")
            ? "No passkey found for this account. Use the password flow to sign in, then add a passkey in Settings → Security."
            : err.message
        );
      } else {
        setPasskeyError("Passkey sign-in failed. Please use the password flow instead.");
      }
    } finally {
      setIsPasskeyLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();
    if (!validateEmail() || !validatePassword()) return;
    try {
      const { sessionHint } = await runStep1(email.trim(), password);
      sessionStorage.setItem("mfa_user_id", sessionHint);
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      window.location.href = next
        ? `/verify-otp?next=${encodeURIComponent(next)}`
        : "/verify-otp";
    } catch (err) {
      if (!(err instanceof ApiError)) console.error("Unexpected login error:", err);
    }
  }

  function backToEmailOnly() {
    setMode("email-only");
    setPassword("");
    setFieldErrors({});
    clearError();
    setPasskeyError(null);
  }

  const errorMessage = apiError ?? passkeyError;

  // ---------------------------------------------------------------------------
  // Email-only mode
  // ---------------------------------------------------------------------------

  if (mode === "email-only") {
    return (
      <div>
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BHC_LOGO}
            alt="Barangay Health Center"
            width={72}
            height={72}
            className="rounded-full ring-2 ring-rose-100 mb-4"
          />
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Sign in to SmartHealth Hub
          </h1>
          <p className="text-slate-500 text-sm mt-1 text-center max-w-[28ch]">
            {passkeySupported
              ? "Use a passkey or your password to continue."
              : "Enter your credentials to continue."}
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        {/* Email field */}
        <div className="flex flex-col gap-1.5 mb-5">
          <Label htmlFor="pk-email" className="text-sm font-medium text-slate-700">
            Email address
          </Label>
          <Input
            id="pk-email"
            type="email"
            placeholder="you@bhc.gov.ph"
            autoComplete="email webauthn"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                passkeySupported ? void handlePasskeyLogin() : handleUsePassword();
              }
            }}
            aria-describedby={fieldErrors.email ? "email-err" : undefined}
            aria-invalid={!!fieldErrors.email}
            disabled={isPasskeyLoading}
            className={
              fieldErrors.email
                ? "border-red-400 focus:border-red-400 focus:ring-red-200/40"
                : ""
            }
          />
          {fieldErrors.email && (
            <span id="email-err" className="text-xs text-red-600" role="alert">
              {fieldErrors.email}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2.5 mb-7">
          {passkeySupported && (
            <Button
              className="w-full gap-2 h-11"
              onClick={() => void handlePasskeyLogin()}
              disabled={isPasskeyLoading}
            >
              {isPasskeyLoading ? (
                <Fingerprint className="size-4 animate-pulse" aria-hidden />
              ) : (
                <ScanFace className="size-4" aria-hidden />
              )}
              {isPasskeyLoading ? "Verifying…" : "Continue with passkey"}
            </Button>
          )}

          <Button
            variant={passkeySupported ? "outline" : "default"}
            className="w-full gap-2 h-11"
            onClick={handleUsePassword}
            disabled={isPasskeyLoading}
          >
            <KeyRound className="size-4" aria-hidden />
            {passkeySupported ? "Use password instead" : "Continue with password"}
          </Button>
        </div>

        {/* Security note */}
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="size-3.5 flex-shrink-0" aria-hidden />
          Phishing-resistant · For BHC staff only
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Password mode
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* Back + account header */}
      <div className="mb-8">
        <button
          type="button"
          onClick={backToEmailOnly}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-5 -ml-0.5"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {passkeySupported ? "Use passkey instead" : "Back"}
        </button>

        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BHC_LOGO}
            alt=""
            width={40}
            height={40}
            className="rounded-full ring-1 ring-slate-200 flex-shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 tracking-tight leading-tight">
              Welcome back
            </h1>
            <p
              className="text-sm text-slate-500 truncate max-w-[22ch]"
              title={email}
            >
              {email}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {apiError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* Email — editable so user can correct a typo */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email-pw" className="text-sm font-medium text-slate-700">
            Email address
          </Label>
          <Input
            id="email-pw"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
            }}
            disabled={isLoading}
            className={
              fieldErrors.email ? "border-red-400 focus:border-red-400" : ""
            }
          />
          {fieldErrors.email && (
            <span className="text-xs text-red-600" role="alert">
              {fieldErrors.email}
            </span>
          )}
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </Label>
            <a
              href="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <Input
            ref={passwordRef}
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password)
                setFieldErrors((p) => ({ ...p, password: undefined }));
            }}
            aria-describedby={fieldErrors.password ? "pw-err" : undefined}
            aria-invalid={!!fieldErrors.password}
            disabled={isLoading}
            className={
              fieldErrors.password ? "border-red-400 focus:border-red-400" : ""
            }
          />
          {fieldErrors.password && (
            <span id="pw-err" className="text-xs text-red-600" role="alert">
              {fieldErrors.password}
            </span>
          )}
        </div>

        <Button type="submit" className="w-full h-11 mt-1" disabled={isLoading}>
          {isLoading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        For BHC staff only. Unauthorised access is prohibited.
      </p>
    </div>
  );
}
