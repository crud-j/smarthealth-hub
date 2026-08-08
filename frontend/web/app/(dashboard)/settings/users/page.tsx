"use client";

/**
 * Settings / Users page — Admin only.
 *
 * Full CRUD interface for staff accounts:
 * - Table with Name, Email, Role badge, Status badge, Last Login, Actions.
 * - Role filter dropdown + active/inactive toggle above the table.
 * - "Add User" button opens CreateUserModal.
 * - Per-row "Edit" button opens EditUserModal.
 * - Per-row "Deactivate" button with confirm dialog (Admin only).
 * - Pagination controls (Previous / Page N of M / Next).
 *
 * Backend endpoints:
 *   GET /users   — list paginated staff accounts
 *   DELETE /users/{id} — deactivate a staff account
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import CreateUserModal from "@/components/modals/CreateUserModal";
import EditUserModal from "@/components/modals/EditUserModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaffUser {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  role: string;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface PaginatedUsers {
  items: StaffUser[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  bhw: "BHW",
  physician: "Physician",
  admin_staff: "Admin Staff",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  bhw: "bg-teal-100 text-teal-700",
  physician: "bg-blue-100 text-blue-700",
  admin_staff: "bg-slate-100 text-slate-600",
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Confirm dialog component (inline, avoids external dependency)
// ---------------------------------------------------------------------------

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  confirmClass = "bg-red-600 hover:bg-red-700 text-white",
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  confirmClass?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success / Info banner
// ---------------------------------------------------------------------------

function SuccessBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="mt-0.5 shrink-0 text-green-600"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <p className="text-sm text-green-800">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-auto shrink-0 text-green-600 hover:text-green-800"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsUsersPage() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Filters and pagination
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  type ModalMode = "create" | "edit" | null;
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);

  // Deactivate confirm dialog
  const [deactivateTarget, setDeactivateTarget] = useState<StaffUser | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (roleFilter) qs.set("role", roleFilter);
      if (!showInactive) {
        // When not showing inactive, only fetch active users
        qs.set("is_active", "true");
      }
      const result = await apiFetch<PaginatedUsers>(`/users?${qs.toString()}`);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError("You don't have permission to view this page.");
        } else {
          setError(err.message || "Failed to load users.");
        }
      } else {
        setError("Network error. Failed to load staff accounts.");
      }
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, showInactive]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  // ---------------------------------------------------------------------------
  // Deactivate handler
  // ---------------------------------------------------------------------------

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await apiFetch(`/users/${deactivateTarget.id}`, { method: "DELETE" });
      setDeactivateTarget(null);
      setSuccessMsg(
        `${deactivateTarget.full_name} has been deactivated successfully.`
      );
      void fetchUsers();
    } catch (err) {
      setDeactivateTarget(null);
      if (err instanceof ApiError) {
        setError(err.message || "Failed to deactivate user.");
      } else {
        setError("Network error. Failed to deactivate user.");
      }
    } finally {
      setDeactivating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage staff accounts and role assignments
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setModalMode("create");
            setEditTarget(null);
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Role filter */}
          <div className="min-w-[160px]">
            <label
              htmlFor="role-filter"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Role
            </label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="bhw">BHW</option>
              <option value="physician">Physician</option>
              <option value="admin_staff">Admin Staff</option>
            </select>
          </div>

          {/* Active/inactive toggle */}
          <div className="flex items-end pb-0.5">
            <button
              type="button"
              onClick={() => {
                setShowInactive((prev) => !prev);
                setPage(1);
              }}
              className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                showInactive
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-teal-200 bg-teal-50 text-teal-700"
              }`}
            >
              {showInactive ? "Show all" : "Active only"}
            </button>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {successMsg && (
        <SuccessBanner message={successMsg} onDismiss={() => setSuccessMsg("")} />
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            aria-label="Staff users table"
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Last Login</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Skeleton rows while loading */}
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))}

              {/* Empty state */}
              {!loading && (data?.items ?? []).length === 0 && !error && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No staff accounts found.
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!loading &&
                (data?.items ?? []).map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.full_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          u.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(u.last_login_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarget(u);
                            setModalMode("edit");
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          aria-label={`Edit ${u.full_name}`}
                        >
                          Edit
                        </button>

                        {/* Deactivate (only for active users) */}
                        {u.is_active && (
                          <button
                            type="button"
                            onClick={() => setDeactivateTarget(u)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                            aria-label={`Deactivate ${u.full_name}`}
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              {data.total} total staff account{data.total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40"
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <CreateUserModal
        open={modalMode === "create"}
        onClose={() => setModalMode(null)}
        onCreated={() => {
          setModalMode(null);
          setSuccessMsg(
            "User created. Temporary password has been logged to the server console."
          );
          void fetchUsers();
        }}
      />

      {/* Edit User Modal */}
      <EditUserModal
        open={modalMode === "edit"}
        user={editTarget}
        onClose={() => {
          setModalMode(null);
          setEditTarget(null);
        }}
        onUpdated={() => {
          setModalMode(null);
          setEditTarget(null);
          setSuccessMsg("User updated successfully.");
          void fetchUsers();
        }}
      />

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        open={deactivateTarget !== null && !deactivating}
        title="Deactivate staff account?"
        message={`This will mark ${deactivateTarget?.full_name ?? "this user"} as inactive. They will no longer be able to log in. This action can be reversed by editing the account. Continue?`}
        confirmLabel="Deactivate"
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
