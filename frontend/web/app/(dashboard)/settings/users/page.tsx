"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import CreateUserModal from "@/components/modals/CreateUserModal";
import EditUserModal from "@/components/modals/EditUserModal";

export interface StaffUser {
  id: string; full_name: string; email: string; mobile_number: string;
  role: string; is_active: boolean; mfa_enabled: boolean;
  has_password: boolean;
  last_login_at: string | null; created_at: string;
}

interface PaginatedUsers { items: StaffUser[]; total: number; page: number; page_size: number; }

const ROLE_LABELS: Record<string, string> = { admin: "Admin", bhw: "BHW", physician: "Physician", admin_staff: "Admin Staff" };

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700 border border-violet-200",
  bhw: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  physician: "bg-blue-100 text-blue-700 border border-blue-200",
  admin_staff: "bg-stone-100 text-stone-600 border border-stone-200",
};

const PAGE_SIZE = 20;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function SettingsUsersPage() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string>("");
  const lastFetchErrorRef = useRef<string>("");

  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [showInactive, setShowInactive] = useState(false);

  type ModalMode = "create" | "edit" | null;
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true); setFetchError("");
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (roleFilter) qs.set("role", roleFilter);
      if (!showInactive) qs.set("is_active", "true");
      const result = await apiFetch<PaginatedUsers>(`/users?${qs.toString()}`);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.status === 403 ? "You don't have permission to view this page." : err.message || "Failed to load users.");
      } else {
        setFetchError("Network error. Failed to load staff accounts.");
      }
    } finally { setLoading(false); }
  }, [page, roleFilter, showInactive]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (fetchError && fetchError !== lastFetchErrorRef.current) {
      lastFetchErrorRef.current = fetchError;
      toast.error(fetchError, "Failed to load users");
    }
    if (!fetchError) lastFetchErrorRef.current = "";
  }, [fetchError]);

  function handleDelete(user: StaffUser) {
    setDeleteTarget(user);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`${deleteTarget.full_name} has been permanently deleted.`);
      setDeleteTarget(null);
      void fetchUsers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete user.");
    } finally { setDeleting(false); }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const inputCls = "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Users</h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">Manage staff accounts and role assignments</p>
        </div>
        <button type="button" onClick={() => { setModalMode("create"); setEditTarget(null); }}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add User
        </button>
      </div>

      {/* Filters */}
      <div
        className="mb-4 overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
          <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#1a0808]">Filters</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[160px]">
            <label htmlFor="role-filter" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">Role</label>
            <select id="role-filter" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className={inputCls}>
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="bhw">BHW</option>
              <option value="physician">Physician</option>
              <option value="admin_staff">Admin Staff</option>
            </select>
          </div>
          <div>
            <button type="button" onClick={() => { setShowInactive((prev) => !prev); setPage(1); }}
              className={`min-h-[40px] rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e] ${showInactive ? "border-[#e5d4cc] bg-[#fdf5f0] text-[#7a5252]" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {showInactive ? "Show all" : "Active only"}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Staff users table">
            <thead>
              <tr className="border-b-2 border-[#e5d4cc]" style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}>
                {["Name", "Email", "Role", "Status", "Last Login", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f0e4dd]">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-[#e8d5cc]" /></td>
                  ))}
                </tr>
              ))}

              {!loading && (data?.items ?? []).length === 0 && !fetchError && (
                <tr>
                  <td colSpan={6}>
                    <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 text-[#c08080]">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#9b6e6e]">No staff accounts found.</p>
                      <p className="mt-1 text-xs text-[#c08080]">Add the first staff account using the button above.</p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && (data?.items ?? []).map((u) => (
                <tr key={u.id} className="border-b border-[#f0e4dd] last:border-0 hover:bg-[#fdf5f0] transition-colors duration-150">
                  <td className="px-4 py-3 text-sm font-semibold text-[#1a0808]">{u.full_name}</td>
                  <td className="px-4 py-3 text-sm text-[#7a5252]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE[u.role] ?? "bg-stone-100 text-stone-600 border border-stone-200"}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.is_active ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-stone-100 text-stone-500 border border-stone-200"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#9b6e6e]">{formatDate(u.last_login_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { setEditTarget(u); setModalMode("edit"); }}
                        className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-xs font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                        aria-label={`Edit ${u.full_name}`}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(u)} disabled={deleting}
                        className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-1.5 text-xs font-semibold text-[#dc2626] hover:bg-[#fee2e2] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dc2626]"
                        aria-label={`Delete ${u.full_name}`}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-[#e5d4cc] px-5 py-3">
            <p className="text-xs font-medium text-[#9b6e6e]">{data.total} total staff account{data.total !== 1 ? "s" : ""}</p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                aria-label="Previous page">
                Previous
              </button>
              <span className="text-xs text-[#9b6e6e]">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                aria-label="Next page">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateUserModal
        open={modalMode === "create"}
        onClose={() => setModalMode(null)}
        onCreated={(credentialMode) => {
          setModalMode(null);
          const msg =
            credentialMode === "passkey"
              ? "Account created. The user will register their passkey on first login."
              : "Account created. Password sent to the user via SMS.";
          toast.success(msg);
          void fetchUsers();
        }}
      />
      <EditUserModal
        open={modalMode === "edit"}
        user={editTarget}
        onClose={() => { setModalMode(null); setEditTarget(null); }}
        onUpdated={() => { setModalMode(null); setEditTarget(null); toast.success("User updated successfully."); void fetchUsers(); }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete ${deleteTarget.full_name}?` : "Delete user?"}
        description="This action is permanent and cannot be undone. The user account will be removed from the database."
        confirmLabel="Delete User"
        isDangerous
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
