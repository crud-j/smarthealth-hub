"use client";

import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  bhw: "BHW",
  physician: "Physician",
  admin_staff: "Admin Staff",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/80",
  bhw: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80",
  physician: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/80",
  admin_staff: "bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-200/80",
};

function SectionPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mb-6 overflow-hidden rounded-2xl bg-white"
      style={{
        boxShadow:
          "0 1px 2px rgba(160,80,80,0.04), 0 4px 12px rgba(160,80,80,0.06)",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#f0e4de]">
        <span
          className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]"
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold tracking-tight text-[#1a0808]">
          {title}
        </h2>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

export default function SettingsProfilePage() {
  const { user, isLoading } = useCurrentUser();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
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
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Failed to change password. Please try again."
      );
    } finally {
      setPwLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-[#e8d9d2] bg-white px-3.5 py-2.5 text-sm text-[#1a0808] " +
    "placeholder:text-[#c4a9a0] " +
    "transition-[border-color,box-shadow] duration-150 " +
    "hover:border-[#dcc4ba] " +
    "focus-visible:outline-none focus-visible:border-[#b5343e]/70 " +
    "focus-visible:ring-2 focus-visible:ring-[#b5343e]/20";

  const labelCls = "mb-1.5 block text-sm font-medium text-[#4a2c2c]";

  return (
    <div className="mx-auto max-w-xl">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display leading-tight tracking-tight text-[#1a0808]">
          Profile
        </h1>
        <p className="mt-1.5 text-sm text-[#8a6060]">
          Your account information and security settings
        </p>
      </div>

      {/* Account Information */}
      <SectionPanel title="Account Information">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-20 shrink-0 animate-pulse rounded-md bg-[#f0e4de]" />
                <div className="h-4 flex-1 animate-pulse rounded-md bg-[#f0e4de]" />
              </div>
            ))}
          </div>
        ) : (
          <dl className="space-y-5">
            {[
              { label: "Full Name", value: user?.full_name ?? "—" },
              { label: "Email", value: user?.email ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-4">
                <dt className="w-28 shrink-0 text-sm font-medium text-[#9b6e6e]">
                  {label}
                </dt>
                <dd className="text-sm font-medium text-[#1a0808]">{value}</dd>
              </div>
            ))}

            <div className="flex items-center gap-4">
              <dt className="w-28 shrink-0 text-sm font-medium text-[#9b6e6e]">
                Role
              </dt>
              <dd>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${
                    ROLE_BADGE[user?.role ?? ""] ??
                    "bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-200/80"
                  }`}
                >
                  {ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? "—"}
                </span>
              </dd>
            </div>

            <div className="flex items-center gap-4">
              <dt className="w-28 shrink-0 text-sm font-medium text-[#9b6e6e]">
                Status
              </dt>
              <dd>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${
                    user?.is_active
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80"
                      : "bg-stone-50 text-stone-500 ring-1 ring-inset ring-stone-200/80"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      user?.is_active ? "bg-emerald-500" : "bg-stone-400"
                    }`}
                    aria-hidden="true"
                  />
                  {user?.is_active ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </SectionPanel>

      {/* Change Password */}
      <SectionPanel title="Change Password">
        <form
          onSubmit={(e) => void handleChangePassword(e)}
          className="space-y-5"
        >
          <div>
            <label htmlFor="current-password" className={labelCls}>
              Current Password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="new-password" className={labelCls}>
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
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-[#9b6e6e]">
              Minimum 8 characters
            </p>
          </div>

          <div>
            <label htmlFor="confirm-password" className={labelCls}>
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className={inputCls}
            />
          </div>

          <button
            type="submit"
            disabled={pwLoading}
            className="
              group relative flex min-h-[44px] w-full items-center justify-center
              rounded-xl px-4 py-2.5 text-sm font-semibold text-white
              transition-[transform,opacity,background] duration-150
              enabled:hover:brightness-[1.03]
              enabled:active:scale-[0.97]
              disabled:cursor-not-allowed disabled:opacity-60
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5343e]/40 focus-visible:ring-offset-2
            "
            style={{
              background: pwLoading
                ? "#d4a0a0"
                : "linear-gradient(135deg, #b5343e 0%, #c94060 100%)",
              boxShadow: pwLoading
                ? "none"
                : "0 1px 2px rgba(181,52,62,0.2), 0 4px 12px rgba(181,52,62,0.18)",
            }}
          >
            {pwLoading ? "Updating…" : "Update Password"}
          </button>
        </form>
      </SectionPanel>
    </div>
  );
}