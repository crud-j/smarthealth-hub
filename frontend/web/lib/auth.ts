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

// ---------------------------------------------------------------------------
// Passkey (FIDO2/WebAuthn) API helpers
// ---------------------------------------------------------------------------

export interface PasskeyCredentialInfo {
  id: string;
  device_name: string;
  aaguid: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

/**
 * POST /auth/passkey/register/begin — start a registration ceremony.
 *
 * Returns `options` to pass to `startPasskeyRegistration()` in passkey.ts.
 */
export async function passkeyRegisterBegin(
  device_name: string
): Promise<{ options: Record<string, unknown> }> {
  return apiFetch<{ options: Record<string, unknown> }>(
    "/auth/passkey/register/begin",
    { method: "POST", body: JSON.stringify({ device_name }) }
  );
}

/**
 * POST /auth/passkey/register/complete — finish a registration ceremony.
 *
 * @param credential  Attestation object returned by `startPasskeyRegistration()`.
 * @param device_name Same name passed to `passkeyRegisterBegin`.
 */
export async function passkeyRegisterComplete(
  credential: Record<string, unknown>,
  device_name: string
): Promise<{ id: string; device_name: string; created_at: string; message: string }> {
  return apiFetch("/auth/passkey/register/complete", {
    method: "POST",
    body: JSON.stringify({ credential, device_name }),
  });
}

/**
 * POST /auth/passkey/authenticate/begin — start an authentication ceremony.
 *
 * Returns `options` to pass to `startPasskeyAuthentication()` in passkey.ts.
 *
 * @param email  The user's email address (used to look up registered credentials).
 */
export async function passkeyAuthBegin(
  email: string
): Promise<{ options: Record<string, unknown> }> {
  return apiFetch<{ options: Record<string, unknown> }>(
    "/auth/passkey/authenticate/begin",
    { method: "POST", body: JSON.stringify({ email }) }
  );
}

/**
 * POST /auth/passkey/authenticate/complete — finish an authentication ceremony.
 *
 * On success the backend sets httpOnly auth cookies — no tokens need to be
 * stored by the caller. Redirect to /dashboard immediately after this resolves.
 *
 * @param credential  Assertion object returned by `startPasskeyAuthentication()`.
 * @param email       Same email passed to `passkeyAuthBegin`.
 */
export async function passkeyAuthComplete(
  credential: Record<string, unknown>,
  email: string
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/passkey/authenticate/complete", {
    method: "POST",
    body: JSON.stringify({ credential, email }),
  });
}

/**
 * GET /auth/passkey/credentials — list all passkeys registered to the current user.
 *
 * Requires a valid access_token cookie (set automatically by the browser).
 */
export async function listPasskeys(): Promise<{ credentials: PasskeyCredentialInfo[] }> {
  return apiFetch<{ credentials: PasskeyCredentialInfo[] }>("/auth/passkey/credentials");
}

/**
 * DELETE /auth/passkey/credentials/{id} — revoke a single passkey.
 *
 * @param id  The credential `id` string from `PasskeyCredentialInfo`.
 */
export async function revokePasskey(id: string): Promise<void> {
  await apiFetch(`/auth/passkey/credentials/${id}`, { method: "DELETE" });
}
