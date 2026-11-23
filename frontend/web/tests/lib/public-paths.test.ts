import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { isPublicPath } from "@/lib/public-paths"
import { proxy } from "@/proxy"

// Which pages open without a staff session. Everything else redirects to
// /login. A public page must match a whole path segment ("/verify" or
// "/verify/..."), never a prefix of another word ("/verify-dashboard").

const PUBLIC = [
  "/",
  "/login",
  "/verify-otp",
  "/forgot-password",
  "/verify", // card QR scan landing page
  "/register", // online self-registration (poster QR)
  "/intake", // public intake form (social media link)
  "/intake/abc123", // token pre-visit form
  "/photo-capture/abc123", // phone page from the patient-photo QR (token is the permission)
  "/api/v1/auth/login",
  "/_next/static/chunks/app.js",
  "/favicon.ico",
  "/logo.png",
]

const PROTECTED = [
  "/dashboard",
  "/patients",
  "/patients/123",
  "/nfc-monitor", // shows the last scanned patient
  "/health-cards/verify", // staff scanner inside the dashboard
  "/settings/audit-log",
  "/analytics/reports",
  "/verify-dashboard-preview", // any future page whose name starts with "verify"
  "/verifyx",
  "/loginx",
  "/login-as",
  "/registerx",
  "/registrations", // admin review of online registrations
  "/intakex",
  "/photo-capturex",
  "/apix",
]

describe("isPublicPath", () => {
  it.each(PUBLIC)("%s is public", (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  it.each(PROTECTED)("%s needs a session", (path) => {
    expect(isPublicPath(path)).toBe(false)
  })
})

describe("proxy", () => {
  const request = (path: string, signedIn = false) => {
    const req = new NextRequest(new URL(path, "https://hub.example"))
    if (signedIn) req.cookies.set("access_token", "t")
    return req
  }

  it("lets a patient open the online registration form without signing in", () => {
    const res = proxy(request("/register"))
    expect(res.headers.get("location")).toBeNull()
  })

  it("sends an anonymous visitor of a staff page to /login with next", () => {
    const res = proxy(request("/verify-dashboard-preview"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://hub.example/login?next=%2Fverify-dashboard-preview",
    )
  })

  it("lets a signed-in user through", () => {
    const res = proxy(request("/dashboard", true))
    expect(res.headers.get("location")).toBeNull()
  })
})
