"use client";

import { useLogout } from "@/hooks/useAuth";
import type { CurrentUser } from "@/hooks/useAuth";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  bhw: "BHW",
  physician: "Physician",
  admin_staff: "Admin Staff",
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconHamburger() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TopbarProps {
  user: CurrentUser | null;
  onMenuToggle: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Topbar({
  user,
  onMenuToggle,
  isCollapsed,
  onToggleCollapse,
}: TopbarProps) {
  const { performLogout, isLoading: logoutLoading } = useLogout();
  const role = user?.role?.toLowerCase() ?? "";
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <header
      data-theme="dark-shell"
      className="flex h-16 shrink-0 items-center justify-between px-4 lg:px-3 bg-[var(--shell-bg)] border-b border-[var(--shell-border)]"
    >
      {/* ── Left: hamburger (mobile) + sidebar toggle (desktop) ──── */}
      <div className="flex items-center gap-1">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] lg:hidden text-[var(--shell-text-muted)] hover:text-[var(--shell-accent)] hover:bg-[#252525]"
        >
          <IconHamburger />
        </button>

        {/* Sidebar collapse/expand toggle — desktop only */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] text-[var(--shell-text-muted)] hover:text-[var(--shell-accent)] hover:bg-[#252525]"
          suppressHydrationWarning
        >
          {isCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* ── Right: user info + sign out ──────────────────────────── */}
      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="hidden h-5 w-px sm:block bg-[var(--shell-border)]" />

            <span className="hidden rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest sm:inline-block bg-[rgba(211,105,105,0.1)] text-[var(--shell-accent)] border border-[rgba(211,105,105,0.2)]">
              {roleLabel}
            </span>

            <span className="hidden text-sm font-medium sm:block text-[var(--shell-text-secondary)]">
              {user.full_name}
            </span>

            <div className="hidden h-5 w-px sm:block bg-[var(--shell-border)]" />
          </>
        )}

        {/* Sign out */}
        <button
          type="button"
          onClick={() => void performLogout()}
          disabled={logoutLoading}
          aria-label="Log out"
          className="flex min-h-[36px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] disabled:opacity-40 disabled:pointer-events-none text-[#888] border border-[#2e2e2e] hover:text-[var(--shell-accent)] hover:border-[rgba(211,105,105,0.35)] hover:bg-[rgba(211,105,105,0.06)]"
          suppressHydrationWarning
        >
          <IconSignOut />
          <span className="hidden sm:inline">
            {logoutLoading ? "Signing out…" : "Sign out"}
          </span>
        </button>
      </div>
    </header>
  );
}
