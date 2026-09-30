/**
 * Typed fetch wrapper for the SmartHealth Hub API.
 *
 * - Base URL resolved from NEXT_PUBLIC_API_BASE_URL env var (falls back to
 *   http://localhost:8000/api/v1 for local development).
 * - Sends credentials (httpOnly cookies) with every request via
 *   `credentials: 'include'`.
 * - Parses the backend's standard error envelope and throws `ApiError` for
 *   non-2xx responses so callers can catch a typed error.
 * - On 401 responses, attempts a single silent token refresh via
 *   POST /auth/refresh and retries the original request. Concurrent 401s
 *   share one in-flight refresh. Only if the refresh itself fails does it
 *   redirect to /login (client-side only — no-ops during SSR to avoid
 *   hydration issues).
 */

// Browser: use a relative URL so requests go through the Next.js rewrite
// proxy (/api/v1/* → FastAPI).  The cookie is then Set on the same origin
// (Next.js host:port) that the middleware reads — fixing the infinite
// redirect-to-login loop caused by cookies being scoped to port 8000.
//
// SSR (Node.js): relative URLs don't resolve, so fall back to the internal
// FastAPI address via SERVER_SIDE_API_URL.
const API_BASE_URL =
  typeof window !== "undefined"
    ? "/api/v1"
    : `${process.env.SERVER_SIDE_API_URL ?? "http://localhost:8000"}/api/v1`;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Represents a structured error returned by the API.
 *
 * The backend always responds with:
 *   { "error": { "code": string, "message": string, "detail": {} } }
 *
 * This class surfaces those fields so UI components can show specific messages.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Silent token-refresh coordination
// ---------------------------------------------------------------------------

/** Path (relative to API_BASE_URL) of the token-refresh endpoint. */
const REFRESH_PATH = "/auth/refresh";

/**
 * Module-level shared refresh promise. When several requests receive a 401 at
 * the same time, only the first triggers a refresh; the rest await this same
 * promise. It resolves to `true` when the refresh succeeded, `false` otherwise.
 * Reset to `null` once settled so a later 401 can trigger a fresh refresh.
 */
let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Attempt to refresh the auth tokens exactly once, coordinating concurrent
 * callers through a shared in-flight promise so only one network refresh runs.
 *
 * @returns `true` if the refresh succeeded, `false` otherwise.
 */
function refreshTokens(): Promise<boolean> {
  if (inFlightRefresh === null) {
    inFlightRefresh = fetch(`${API_BASE_URL}${REFRESH_PATH}`, {
      method: "POST",
      credentials: "include", // send the httpOnly refresh_token cookie
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated API call.
 *
 * @param path    Path relative to API_BASE_URL, e.g. `/auth/login`.
 * @param options Standard `RequestInit` options merged with defaults.
 * @returns       Parsed JSON body cast to `T`.
 * @throws        `ApiError` for non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
  };

  const requestInit: RequestInit = {
    ...options,
    credentials: "include", // send httpOnly auth cookies on every request
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  let response = await fetch(url, requestInit);

  // 401 → attempt a single silent refresh, then retry the original request.
  // Never attempt refresh-retry when the failing request IS the refresh call
  // itself (avoids an infinite loop).
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    path !== REFRESH_PATH
  ) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      // Refresh succeeded — retry the original request once.
      response = await fetch(url, requestInit);
    } else {
      // Refresh failed — session is truly expired; send the user to login.
      window.location.href = "/login";
    }
  }

  if (!response.ok) {
    let code = "api_error";
    let message = `HTTP ${response.status}`;

    try {
      // Attempt to parse the backend's standard error envelope.
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      // Response body is not JSON — use the generic message.
    }

    throw new ApiError(message, response.status, code);
  }

  // Handle responses with no body (e.g. 204 No Content).
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}
