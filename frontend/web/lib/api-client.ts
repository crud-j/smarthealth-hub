/**
 * Typed fetch wrapper for the SmartHealth Hub API.
 *
 * - Base URL resolved from NEXT_PUBLIC_API_BASE_URL env var (falls back to
 *   http://localhost:8000/api/v1 for local development).
 * - Sends credentials (httpOnly cookies) with every request via
 *   `credentials: 'include'`.
 * - Parses the backend's standard error envelope and throws `ApiError` for
 *   non-2xx responses so callers can catch a typed error.
 * - On 401 responses, redirects to /login (client-side only — no-ops during
 *   SSR to avoid hydration issues).
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

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

  const response = await fetch(url, {
    ...options,
    credentials: "include", // send httpOnly auth cookies on every request
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  // 401 → redirect to login (client-side only; skip during SSR)
  if (response.status === 401) {
    if (typeof window !== "undefined") {
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
