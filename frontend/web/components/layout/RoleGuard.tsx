"use client";

/**
 * RoleGuard — client-side role-based UI gating.
 *
 * Renders `children` only when the currently authenticated user's role is
 * included in `roles`.  If the role check fails:
 *   - If a `fallback` prop is provided, renders that instead.
 *   - Otherwise renders nothing (null).
 *
 * This provides UI-layer defence-in-depth on top of the middleware route
 * protection and the backend RBAC enforcement on every API endpoint.
 *
 * Role matrix (SDP Section 10.3):
 *   admin         — full system access
 *   bhw           — patient records, immunizations, appointments
 *   physician     — patient records, medical history, visits
 *   admin_staff   — appointments, basic patient search
 *
 * Usage:
 *   <RoleGuard roles={["admin"]}>
 *     <AdminOnlyPanel />
 *   </RoleGuard>
 *
 *   <RoleGuard roles={["admin", "bhw"]} fallback={<p>No access</p>}>
 *     <SharedPanel />
 *   </RoleGuard>
 */

import type { ReactNode } from "react";
import { useCurrentUser } from "../../hooks/useAuth";

interface RoleGuardProps {
  /**
   * List of role strings that are allowed to see the children.
   * Matches the `role` field returned by GET /users/me.
   *
   * Allowed values: "admin" | "bhw" | "physician" | "admin_staff"
   */
  roles: string[];
  children: ReactNode;
  /**
   * Content to render when the role check fails.
   * If omitted, nothing is rendered (null).
   */
  fallback?: ReactNode;
}

export default function RoleGuard({
  roles,
  children,
  fallback = null,
}: RoleGuardProps): ReactNode {
  const { user, isLoading } = useCurrentUser();

  // While the user is being fetched, render nothing to avoid a flash of
  // unauthorised content.
  if (isLoading) return null;

  // Not authenticated — render fallback.
  if (!user) return fallback;

  // Role check — case-insensitive comparison for robustness.
  const allowed = roles.some(
    (r) => r.toLowerCase() === user.role.toLowerCase()
  );

  return allowed ? <>{children}</> : <>{fallback}</>;
}
