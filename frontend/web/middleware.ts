import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route protection middleware — Phase 1.
 *
 * Reads the `access_token` httpOnly cookie set by the FastAPI backend after
 * successful MFA login.  Requests to dashboard routes without this cookie
 * are redirected to /login.
 *
 * Note: The middleware cannot verify the JWT signature because the secret key
 * is only available on the backend.  Presence of the cookie is used as a
 * lightweight gate — the backend validates the actual token on every API call.
 * True tamper-proof validation at the edge would require either:
 *   a) The JWT_SECRET_KEY available in the edge runtime (not recommended for
 *      security reasons unless stored in edge secrets).
 *   b) A short-lived session token pattern (Phase 6 hardening concern).
 *
 * Public paths (no redirect):
 *   /login, /verify-otp, /forgot-password, /api/*, /_next/*, /favicon.ico
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Public paths that do not require authentication.
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/verify-otp") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/";

  if (isPublic) {
    return NextResponse.next();
  }

  // All other paths require the access_token cookie.
  const accessToken = request.cookies.get("access_token");

  if (!accessToken?.value) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination so the login page can redirect back.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Run middleware on all routes except:
   *  - Static files handled by Next.js (/_next/static, /_next/image, etc.)
   *  - Explicit public assets (favicon, robots.txt)
   *
   * This intentionally uses a broad matcher and lets the middleware function
   * above handle the allow/deny logic so the full path list only needs to be
   * maintained in one place.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt).*)",
  ],
};
