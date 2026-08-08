/**
 * E2E tests — Patient registration → health card auto-generation journey.
 *
 * Journey: Authenticated admin → /patients/new → fill form → POST /patients
 *          → verify patient profile page → verify health card exists.
 *
 * SDP Reference: Section 5.2 (Patient Records), Section 5.4 (Health Cards)
 */

import { test, expect, type Page } from "@playwright/test";
import { E2E_ADMIN, fetchDevOtp } from "./fixtures/seed";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Shared login helper (duplicated from auth.spec.ts for spec isolation)
// ---------------------------------------------------------------------------

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/verify-otp/);

  const userId = await page.evaluate(() =>
    window.sessionStorage.getItem("mfa_user_id")
  );
  const otp = await fetchDevOtp(BASE, userId!);

  const otpInputs = page.getByRole("textbox");
  const count = await otpInputs.count();
  if (count === 6) {
    for (let i = 0; i < 6; i++) await otpInputs.nth(i).fill(otp[i]);
  } else {
    await otpInputs.first().fill(otp);
  }

  await page.getByRole("button", { name: /verify/i }).click();
  await page.waitForURL(/\/dashboard/);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Patient Registration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Patient list page is accessible from sidebar", async ({ page }) => {
    await page.getByRole("link", { name: /patients/i }).first().click();
    await page.waitForURL(/\/patients/);
    await expect(
      page.getByRole("heading", { name: /patients/i })
    ).toBeVisible();
  });

  test("Register new patient — form validation prevents empty submit", async ({
    page,
  }) => {
    await page.goto("/patients/new");
    await page.waitForLoadState("networkidle");

    // Try submitting without filling anything
    const submitBtn = page.getByRole("button", { name: /register|save/i });
    await submitBtn.click();

    // Required field errors should appear
    await expect(page.getByText(/first name is required/i).or(
      page.getByText(/required/i).first()
    )).toBeVisible({ timeout: 3000 });
  });

  test("Register new patient successfully", async ({ page }) => {
    await page.goto("/patients/new");
    await page.waitForLoadState("networkidle");

    const unique = Date.now();

    // Fill required fields
    await page.getByLabel(/first name/i).fill("E2ETestFirst");
    await page.getByLabel(/middle name/i).fill("E2E");
    await page.getByLabel(/last name/i).fill(`TestLast${unique}`);
    await page.getByLabel(/birth date|birthday/i).fill("1995-05-10");

    // Sex selection
    const sexSelect = page.getByLabel(/sex/i);
    if (await sexSelect.count() > 0) {
      await sexSelect.selectOption("male");
    } else {
      await page.getByRole("radio", { name: /male/i }).check();
    }

    await page.getByLabel(/address/i).fill("789 Test Lane, Marilao, Bulacan");

    // Submit
    await page.getByRole("button", { name: /register|save/i }).click();

    // Should redirect to patient profile
    await page.waitForURL(/\/patients\/[0-9a-f-]+/i, { timeout: 10000 });

    // Patient name should appear on the profile page
    await expect(page.getByText(/E2ETestFirst/)).toBeVisible();
  });

  test("Seeded E2E patient appears in patient list", async ({ page }) => {
    await page.goto("/patients");
    await page.waitForLoadState("networkidle");

    // Search for the seeded patient
    const searchInput = page.getByPlaceholder(/search|name|code/i);
    if (await searchInput.count() > 0) {
      await searchInput.fill("BHC-E2E-000001");
      await page.waitForTimeout(500); // debounce
    }

    await expect(page.getByText("dela Cruz")).toBeVisible({ timeout: 5000 });
  });

  test("Patient profile shows health card section", async ({ page }) => {
    await page.goto("/patients");
    await page.waitForLoadState("networkidle");

    // Navigate to seeded patient profile
    await page.getByText("dela Cruz").click();
    await page.waitForURL(/\/patients\/[0-9a-f-]+/i);

    // Health card section should be present (may show Generate button or card number)
    await expect(
      page.getByText(/health card/i).or(page.getByText(/BHC-E2E-HC001/))
    ).toBeVisible({ timeout: 5000 });
  });

  test("Generate health card for patient", async ({ page }) => {
    await page.goto("/patients");
    await page.waitForLoadState("networkidle");
    await page.getByText("dela Cruz").click();
    await page.waitForURL(/\/patients\/[0-9a-f-]+/i);

    // Look for a Generate or Download card button
    const cardBtn = page
      .getByRole("button", { name: /generate card|generate/i })
      .or(page.getByRole("link", { name: /health card/i }));

    if (await cardBtn.count() > 0) {
      await cardBtn.first().click();
      // Card should now show the card number
      await expect(
        page.getByText(/BHC-\d{4}-\d{6}/).or(page.getByText(/card generated/i))
      ).toBeVisible({ timeout: 8000 });
    } else {
      // Card already generated — verify its presence
      await expect(page.getByText(/BHC-/)).toBeVisible({ timeout: 5000 });
    }
  });
});
