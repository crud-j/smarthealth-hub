/**
 * E2E tests — Authentication journey (Login + OTP + Dashboard).
 *
 * Journey: POST /auth/login → OTP screen → POST /auth/verify-otp →
 *          JWT cookie set → redirected to /dashboard.
 *
 * SDP Reference: Section 13 (Testing Strategy), Section 10 (Security & MFA)
 */

import { test, expect } from "@playwright/test";
import { E2E_ADMIN, fetchDevOtp } from "./fixtures/seed";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Helper: complete the full login → OTP flow, return the userId from the
// session (stored in sessionStorage by the login page).
// ---------------------------------------------------------------------------

async function loginWithOtp(
  page: import("@playwright/test").Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Fill credentials
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /continue/i }).click();

  // After step 1 we land on /verify-otp
  await page.waitForURL(/\/verify-otp/);

  // Retrieve userId stored in sessionStorage by the login page
  const userId = await page.evaluate(() =>
    window.sessionStorage.getItem("mfa_user_id")
  );
  expect(userId).toBeTruthy();

  // Fetch OTP from the backend dev endpoint
  const otp = await fetchDevOtp(BASE, userId!);

  // Fill OTP input(s) — the OTP input renders 6 individual digit inputs
  const otpInputs = page.getByRole("textbox");
  const count = await otpInputs.count();
  if (count === 6) {
    // 6 individual digit inputs
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(otp[i]);
    }
  } else {
    // Single combined input
    await otpInputs.first().fill(otp);
  }

  await page.getByRole("button", { name: /verify/i }).click();

  // After OTP verification we should land on /dashboard
  await page.waitForURL(/\/dashboard/);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Authentication flow", () => {
  test("Login page renders and shows required fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
  });

  test("Invalid credentials show error banner", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: /continue/i }).click();

    // Expect an error message (backend returns 401/422)
    await expect(
      page.getByRole("alert").or(page.getByText(/invalid/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test("Client-side validation blocks empty form submission", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /continue/i }).click();

    // Both fields should show validation errors
    await expect(page.getByText(/email address is required/i)).toBeVisible();
    await expect(page.getByText(/password is required/i)).toBeVisible();
  });

  test("Successful login + OTP flow lands on dashboard", async ({ page }) => {
    await loginWithOtp(page, E2E_ADMIN.email, E2E_ADMIN.password);

    // Dashboard headline and summary cards should be visible
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/total active patients/i)).toBeVisible();
    await expect(page.getByText(/visits this week/i)).toBeVisible();
  });

  test("Unauthenticated access to /dashboard redirects to /login", async ({ page }) => {
    // Visit dashboard without any auth cookie
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    await expect(page.getByLabel("Email address")).toBeVisible();
  });

  test("Logout clears session and redirects to login", async ({ page }) => {
    await loginWithOtp(page, E2E_ADMIN.email, E2E_ADMIN.password);

    // Find and click logout — it is in the Topbar user menu
    await page.getByRole("button", { name: /logout|sign out/i }).click();
    await page.waitForURL(/\/login/);

    // After logout, attempting to navigate back requires auth again
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
  });
});
