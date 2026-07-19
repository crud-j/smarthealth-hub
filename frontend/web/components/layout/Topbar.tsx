"use client";

/**
 * Topbar — authenticated shell top navigation bar.
 *
 * Displays the current user name + role badge and a logout button.
 * On mobile (< lg breakpoint), shows a hamburger button to open the sidebar.
 *
 * WCAG 2.1 AA: logout and hamburger buttons are ≥44px touch targets.
 */

import { useLogout } from "@/hooks/useAuth";
import type { CurrentUser } from "@/hooks/useAuth";

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
  admin_staff: "bg-slate-100 text-slate-700",
};

interface TopbarProps {
  user: CurrentUser | null;
  onMenuToggle: () => void;
}

export default function Topbar({ user, onMenuToggle }: TopbarProps) {
  const { performLogout, isLoading: logoutLoading } = useLogout();

  const role = user?.role?.toLowerCase() ?? "";
  const roleLabel = ROLE_LABELS[role] ?? role;
  const roleColor = ROLE_COLORS[role] ?? "bg-slate-100 text-slate-700";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
      {/* Left: hamburger (mobile only) */}
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Spacer on desktop */}
      <div className="hidden lg:flex lg:flex-1" />

      {/* Right: user info + logout */}
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2">
            {/* Role badge */}
            <span
              className={`hidden rounded-full px-2.5 py-0.5 text-xs font-semibold sm:inline-block ${roleColor}`}
            >
              {roleLabel}
            </span>
            {/* Name */}
            <span className="hidden text-sm font-medium text-slate-700 sm:block">
              {user.full_name}
            </span>
          </div>
        )}

        {/* Logout button */}
        <button
          type="button"
          onClick={() => void performLogout()}
          disabled={logoutLoading}
          aria-label="Log out"
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="hidden sm:inline">
            {logoutLoading ? "Signing out…" : "Sign out"}
          </span>
        </button>
      </div>
    </header>
  );
}
