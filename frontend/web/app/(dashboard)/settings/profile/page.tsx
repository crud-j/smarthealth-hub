"use client";

/**
 * Settings / Profile page — all authenticated roles.
 *
 * Shows:
 *  - Current user info (name, email, role)
 *  - Change Password form (current password + new + confirm)
 *    → POST /auth/change-password
 */

import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api-client";
import { swSuccess, swError } from "@/lib/swal";

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

export default function SettingsProfilePage() {
  const { user, isLoading } = useCurrentUser();

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword.length < 8) {
      void swError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      void swError("New password and confirmation do not match.");
      return;
    }

    setPwLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      void swSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      void swError(
        err instanceof ApiError
          ? err.message
          : "Failed to change password. Please try again."
      );
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-dm-serif, Georgia, serif)", fontWeight: 400, color: "#1a0808" }}>Profile</h1>
        <p className="mt-0.5 text-sm" style={{ color: "#7a5252" }}>Your account information and security settings</p>
      </div>

      {/* User info card */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm" style={{ border: "1px solid #e5d4cc", boxShadow: "0 2px 10px rgba(160,80,80,0.06)" }}>
        <h2 className="mb-4 font-semibold" style={{ color: "#1a0808", borderLeft: "3px solid #b5343e", paddingLeft: "0.75rem" }}>Account Information</h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-5 w-full animate-pulse rounded" style={{ background: "#edd9d0" }} />
            ))}
          </div>
        ) : (
          <dl className="space-y-4">
            <div className="flex">
              <dt className="w-28 shrink-0 text-sm font-medium" style={{ color: "#9b6e6e" }}>Full Name</dt>
              <dd className="text-sm text-slate-900">{user?.full_name ?? "—"}</dd>
            </div>
            <div className="flex">
              <dt className="w-28 shrink-0 text-sm font-medium" style={{ color: "#9b6e6e" }}>Email</dt>
              <dd className="text-sm text-slate-900">{user?.email ?? "—"}</dd>
            </div>
            <div className="flex items-center">
              <dt className="w-28 shrink-0 text-sm font-medium" style={{ color: "#9b6e6e" }}>Role</dt>
              <dd>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[user?.role ?? ""] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? "—"}
                </span>
              </dd>
            </div>
            <div className="flex">
              <dt className="w-28 shrink-0 text-sm font-medium" style={{ color: "#9b6e6e" }}>Status</dt>
              <dd>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${user?.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {user?.is_active ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Change password */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold" style={{ color: "#1a0808", borderLeft: "3px solid #b5343e", paddingLeft: "0.75rem" }}>Change Password</h2>

        <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Current Password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="mt-1 text-xs text-slate-400">Minimum 8 characters</p>
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={pwLoading}
            className="flex min-h-[44px] w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
          >
            {pwLoading ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
