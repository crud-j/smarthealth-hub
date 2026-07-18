"use client";

/**
 * Auth hooks — vanilla React state wrappers around the auth service functions.
 *
 * No external state library is used (no @tanstack/react-query, no Redux) —
 * all state is managed with React's built-in hooks.
 *
 * Hooks exported:
 *   useCurrentUser  — fetches GET /users/me; returns user, isLoading, isAuthenticated
 *   useLogin        — runs step-1 + step-2 of the MFA flow in sequence
 *   useLogout       — calls POST /auth/logout and redirects to /login
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "../lib/api-client";
import { loginStep1, loginStep2, logout as authLogout } from "../lib/auth";
import type { TokenResponse } from "../lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal user shape returned by GET /users/me. */
export interface CurrentUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
  otpCode: string;
}

// ---------------------------------------------------------------------------
// useCurrentUser
// ---------------------------------------------------------------------------

/**
 * Fetches the currently authenticated user from GET /users/me.
 *
 * - On mount (and when `refetch` is called) it sends a credentialed request.
 * - If the request returns 401 (handled by apiFetch which redirects to /login)
 *   or the server is unreachable, `user` remains null and `isAuthenticated`
 *   is false.
 * - Result is cached in module-level state so it is not re-fetched on every
 *   component mount within the same page — call `refetch()` explicitly to
 *   invalidate (e.g. after logout).
 */

// Module-level cache so multiple components share the same user object.
let _cachedUser: CurrentUser | null = null;
let _cacheValid = false;

export function useCurrentUser(): {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetch: () => void;
} {
  const [user, setUser] = useState<CurrentUser | null>(_cachedUser);
  const [isLoading, setIsLoading] = useState(!_cacheValid);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    _cacheValid = false;
    _cachedUser = null;
    setRefetchTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    if (_cacheValid && _cachedUser !== null) {
      setUser(_cachedUser);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    apiFetch<CurrentUser>("/users/me")
      .then((data) => {
        if (!cancelled) {
          _cachedUser = data;
          _cacheValid = true;
          setUser(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) {
            // apiFetch already redirects — just clear state.
            _cachedUser = null;
            _cacheValid = false;
            setUser(null);
          }
          // Other errors (network down, 503): keep existing user state.
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchTrigger]);

  return {
    user,
    isLoading,
    isAuthenticated: user !== null,
    refetch,
  };
}

// ---------------------------------------------------------------------------
// useLogin
// ---------------------------------------------------------------------------

/**
 * Runs the two-step MFA login:
 *   step 1 → POST /auth/login  (validates email + password, sends OTP)
 *   step 2 → POST /auth/verify-otp  (verifies OTP, issues cookies)
 *
 * The two steps are intentionally separate so the UI can navigate to the
 * OTP page between them.  Call `runStep1` after form submit on /login, then
 * call `runStep2` after the user enters the OTP on /verify-otp.
 */
export function useLogin(): {
  runStep1: (
    email: string,
    password: string
  ) => Promise<{ sessionHint: string }>;
  runStep2: (userId: string, otpCode: string) => Promise<TokenResponse>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const runStep1 = useCallback(
    async (email: string, password: string): Promise<{ sessionHint: string }> => {
      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const resp = await loginStep1(email, password);
        return { sessionHint: resp.session_hint };
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "Login failed. Please try again.";
        if (mountedRef.current) setError(message);
        throw err;
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    []
  );

  const runStep2 = useCallback(
    async (userId: string, otpCode: string): Promise<TokenResponse> => {
      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const resp = await loginStep2(userId, otpCode);
        // Invalidate user cache so useCurrentUser re-fetches after login.
        _cacheValid = false;
        _cachedUser = null;
        return resp;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "OTP verification failed. Please try again.";
        if (mountedRef.current) setError(message);
        throw err;
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    []
  );

  return { runStep1, runStep2, isLoading, error, clearError };
}

// ---------------------------------------------------------------------------
// useLogout
// ---------------------------------------------------------------------------

/**
 * Calls POST /auth/logout, clears the module-level user cache, and redirects
 * the browser to /login.
 */
export function useLogout(): {
  performLogout: () => Promise<void>;
  isLoading: boolean;
} {
  const [isLoading, setIsLoading] = useState(false);

  const performLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authLogout();
    } catch {
      // Swallow logout errors — we still clear state and redirect.
    } finally {
      // Clear cached user so subsequent useCurrentUser calls re-fetch.
      _cachedUser = null;
      _cacheValid = false;
      setIsLoading(false);

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  }, []);

  return { performLogout, isLoading };
}
