import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for SmartHealth Hub.
 *
 * - All tests run against a locally started stack (Next.js + FastAPI + Postgres + Redis).
 * - In CI the stack is started by the ci.yml workflow before ``playwright test`` runs.
 * - Locally run ``turbo dev`` first, then ``pnpm --filter web exec playwright test``.
 *
 * SDP Reference: Section 13 (Testing Strategy)
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",

  // Fail fast — surface the first broken journey immediately.
  fullyParallel: false,
  workers: 1,

  // Retry on CI to absorb timing flakes; no retry locally for fast feedback.
  retries: process.env.CI ? 2 : 0,

  // Keep a trace on first retry so failures in CI are debuggable.
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Send httpOnly cookies — the auth flow depends on this.
    // Playwright sets `credentials: 'include'` by default.
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile viewport — important for QR scan journey (BHW uses phone/tablet)
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  // No webServer block — CI starts the stack manually; local dev requires
  // ``turbo dev`` to already be running.
  // webServer: { ... }
});
