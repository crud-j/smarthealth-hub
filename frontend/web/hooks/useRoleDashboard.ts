"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { RoleDashboardData } from "@/types/dashboard";

/**
 * GET /dashboard/me: the signed-in user's role-based dashboard.
 *
 * `unavailable` means the API has no such route yet (404): Vercel deploys the
 * website on merge, the backend only after deploy.sh, so the page then shows
 * the older one-size dashboard instead of an error.
 */
export type RoleDashboardState =
  | { status: "loading" }
  | { status: "ready"; data: RoleDashboardData }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export function useRoleDashboard(): RoleDashboardState {
  const [state, setState] = useState<RoleDashboardState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    apiFetch<RoleDashboardData>("/dashboard/me")
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: "unavailable" });
        } else {
          setState({
            status: "error",
            message: err instanceof ApiError ? err.message : "Could not load the dashboard.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
