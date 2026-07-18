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
  /** Human-readable confirmation that the OTP was dispatched. */
  message: string;
  /**
   * The user's UUID — pass this as `user_id` to `loginStep2`.
   * Stored in sessionStorage between the two login steps.
   */
  session_hint: string;
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
 * @returns `LoginResponse` containing `session_hint` (user UUID).
 * @throws  `ApiError` with status 401 on invalid credentials or 403 if the
 *          account is disabled.
 */
export async function loginStep1(
  email: string,
  password: string
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
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
 * @returns `TokenResponse` on success.
 * @throws  `ApiError` with status 401 on invalid/expired OTP.
 */
export async function loginStep2(
  userId: string,
  otpCode: string
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, otp_code: otpCode }),
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
