/**
 * Auth helper functions — step 1 and step 2 of the MFA login flow, logout,
 * and OTP resend.
 *
 * All functions delegate to `apiFetch` from `api-client.ts` so they inherit
 * cookie-based auth and standardised error handling automatically.
 */

import { apiFetch } from "./api-client";

// ---------------------------------------------------------------------------
// Response types (mirror the Pydantic schemas in backend/app/schemas/auth.py)
// ---------------------------------------------------------------------------

export interface LoginResponse {
  /** Human-readable confirmation of the outcome. */
  message: string;
  /**
   * The user's UUID — pass this as `user_id` to `loginStep2`.
   * Stored in sessionStorage between the two login steps.
   */
  session_hint: string;
  /**
   * False when a trusted device (matched via device_fingerprint) let login
   * skip the OTP step entirely — in that case access_token/refresh_token
   * are already populated and the caller should redirect straight to the
   * dashboard instead of navigating to /verify-otp.
   */
  mfa_required: boolean;
  access_token?: string | null;
  refresh_token?: string | null;
  token_type?: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

export interface ResendOtpResponse {
  message: string;
}

export interface LogoutResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Step 1 — credential validation + OTP dispatch
// ---------------------------------------------------------------------------

/**
 * POST /auth/login — validates email and password.
 *
 * On success the backend generates an OTP and (in production) sends it via
 * Semaphore SMS.  In Phase 1 development the OTP is logged to the server
 * console.
 *
 * If `deviceFingerprint` matches an unexpired trusted_devices row for this
 * user (see "Remember this device", L-1), the OTP step is skipped entirely
 * and the response has `mfa_required: false` with `access_token` /
 * `refresh_token` already populated (cookies are also already set) — the
 * caller should redirect straight to the dashboard in that case.
 *
 * @returns `LoginResponse` containing `session_hint` (user UUID) and
 *          `mfa_required`.
 * @throws  `ApiError` with status 401 on invalid credentials or 403 if the
 *          account is disabled.
 */
export async function loginStep1(
  email: string,
  password: string,
  deviceFingerprint?: string
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      device_fingerprint: deviceFingerprint ?? null,
    }),
  });
}

// ---------------------------------------------------------------------------
// Step 2 — OTP verification + JWT issuance
// ---------------------------------------------------------------------------

/**
 * POST /auth/verify-otp — verifies the 6-digit OTP and issues JWT tokens.
 *
 * On success the backend sets `access_token` and `refresh_token` as httpOnly
 * cookies AND returns them in the response body (for Swagger UI convenience).
 * The frontend relies on the cookies — the body tokens should not be stored
 * in localStorage or sessionStorage.
 *
 * @param userId  UUID from the `session_hint` field of the step-1 response.
 * @param otpCode 6-digit code entered by the user.
 * @param rememberDevice If true, the backend stores `deviceFingerprint` in
 *        trusted_devices for 30 days so a future login from the same
 *        browser can skip the OTP step. UX convenience only — not a
 *        substitute for the OTP factor itself.
 * @param deviceFingerprint Same fingerprint sent to `loginStep1`. Required
 *        for `rememberDevice` to take effect.
 * @returns `TokenResponse` on success.
 * @throws  `ApiError` with status 401 on invalid/expired OTP.
 */
export async function loginStep2(
  userId: string,
  otpCode: string,
  rememberDevice?: boolean,
  deviceFingerprint?: string
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      otp_code: otpCode,
      remember_device: rememberDevice ?? false,
      device_fingerprint: deviceFingerprint ?? null,
    }),
  });
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/**
 * POST /auth/logout — clears httpOnly auth cookies server-side and writes an
 * audit log entry.
 *
 * Requires a valid `access_token` cookie (set automatically by the browser).
 * The caller should clear client-side state (e.g. query cache) after this
 * resolves.
 */
export async function logout(): Promise<LogoutResponse> {
  return apiFetch<LogoutResponse>("/auth/logout", {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Resend OTP
// ---------------------------------------------------------------------------

/**
 * POST /auth/resend-otp — invalidates the current OTP and dispatches a new one.
 *
 * @param userId UUID from the step-1 `session_hint` (stored in sessionStorage).
 */
export async function resendOtp(userId: string): Promise<ResendOtpResponse> {
  return apiFetch<ResendOtpResponse>("/auth/resend-otp", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}
