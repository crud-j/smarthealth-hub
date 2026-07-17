import type { Metadata } from "next";

export const metadata: Metadata = { title: "User Management" };

/**
 * User management page — Admin-only. Create and manage BHW, physician/nurse/midwife,
 * and admin staff accounts with RBAC role assignments.
 * Full implementation in Phase 1 (Foundation).
 */
export default function UsersPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        User Management
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Manage system users and role-based access control
      </p>
      {/* TODO: Implement UserList with role assignment in Phase 1 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
        User management — coming in Phase 1
      </p>
    </div>
  );
}
