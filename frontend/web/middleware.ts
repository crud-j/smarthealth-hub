import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route protection middleware.
 * Redirects unauthenticated users to /login for all dashboard routes.
 * The actual JWT validation will be implemented in Phase 1.
 */
export function middleware(request: NextRequest) {
  // TODO (Phase 1): Validate JWT access token from cookies or Authorization header.
  // For now, pass all requests through so the scaffold works without auth.
  return NextResponse.next();
}

export const config = {
  /*
   * Match all dashboard routes that require authentication.
   * Excludes: /, /login, /verify-otp, /forgot-password, API routes, static files.
   */
  matcher: [
    "/dashboard/:path*",
    "/patients/:path*",
    "/appointments/:path*",
    "/health-cards/:path*",
    "/immunizations/:path*",
    "/analytics/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
