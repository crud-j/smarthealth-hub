/**
 * Which paths open without a staff session (used by proxy.ts).
 *
 * A public page matches a whole path segment: "/verify" and "/verify/..."
 * are public, "/verify-dashboard" is not. A plain startsWith("/verify")
 * would make every future page whose name begins with "verify" public.
 *
 * The backend still checks the JWT on every API call; this only decides
 * whether the browser is sent to /login first.
 */

/** Public pages, including anything below them. */
const PUBLIC_PAGES = [
  "/login",
  "/verify-otp",
  "/forgot-password",
  "/verify", // card QR scan landing page (phone camera)
  "/register", // online self-registration (poster QR); POST /intake-applications is public
  "/intake", // public intake form (/intake) and token pre-visit form (/intake/<token>)
  "/photo-capture", // phone page from the photo QR (/photo-capture/<token>); the token is the permission
] as const;

/** Framework and API paths the proxy never gates. */
const PUBLIC_PREFIXES = ["/api/", "/_next/"] as const;

/** Exact public paths. */
const PUBLIC_EXACT = new Set(["/", "/favicon.ico"]);

const STATIC_ASSET = /\.(?:png|svg|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|mp4|pdf)$/i;

// Not public on purpose:
//   /nfc-monitor          shows the last scanned patient's details
//   /health-cards/verify  the staff scanner inside the dashboard
//   /registrations        admin review of online registrations

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname) || STATIC_ASSET.test(pathname)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
