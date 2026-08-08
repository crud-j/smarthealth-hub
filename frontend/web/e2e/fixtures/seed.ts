/**
 * E2E test data constants — must match backend/tests/e2e_seed.py.
 *
 * The seeder is run before the Playwright suite by the CI workflow.
 * Do NOT import server-side code here; these are purely constant references.
 */

export const E2E_ADMIN = {
  email: "e2e-admin@bhc.local",
  password: "E2eAdmin!2026",
} as const;

export const E2E_BHW = {
  email: "e2e-bhw@bhc.local",
  password: "E2eBhw!2026",
} as const;

export const E2E_PATIENT = {
  code: "BHC-E2E-000001",
  firstName: "Juan",
  lastName: "dela Cruz",
} as const;

export const E2E_PATIENT2 = {
  code: "BHC-E2E-000002",
  firstName: "Maria",
  lastName: "Santos",
} as const;

/**
 * Retrieve the OTP code that the backend logs to stdout in dev/CI mode.
 *
 * In CI (EMAIL_HOST_USER=test@example.com), the MFA service falls back to
 * logging the OTP to console rather than emailing it.  The CI workflow
 * captures backend stdout and we read the last logged OTP from the API's
 * debug endpoint (only active in non-production builds).
 *
 * For local test runs, read the OTP from the backend's terminal output.
 */
export async function fetchDevOtp(baseUrl: string, userId: string): Promise<string> {
  // The backend exposes a dev-only endpoint to retrieve the last OTP for a
  // given user so tests can automate the MFA flow without SMS access.
  // This endpoint is gated by settings.ENVIRONMENT != "production".
  const response = await fetch(`${baseUrl}/api/v1/auth/dev-otp/${userId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(
      `Could not fetch dev OTP (status ${response.status}). ` +
        "Ensure the backend is running and ENVIRONMENT is not 'production'."
    );
  }
  const data = (await response.json()) as { otp_code: string };
  return data.otp_code;
}
