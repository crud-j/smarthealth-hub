"use client";
// TODO: Phase 1 — wraps children and renders null (or redirect) if role insufficient
// Combined with middleware.ts for defense-in-depth RBAC
import type { ReactNode } from "react";

interface RoleGuardProps {
  allowedRoles: string[];
  children: ReactNode;
}

export default function RoleGuard({ children }: RoleGuardProps) {
  // TODO: read role from auth context/cookie and enforce
  return <>{children}</>;
}
