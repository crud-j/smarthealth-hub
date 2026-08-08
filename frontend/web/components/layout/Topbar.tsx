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
// Shared button style helpers
// ---------------------------------------------------------------------------

function onDarkHover(e: React.MouseEvent<HTMLButtonElement>, active = true) {
  if (!active) return;
  (e.currentTarget as HTMLButtonElement).style.color = "#D36969";
  (e.currentTarget as HTMLButtonElement).style.background = "#252525";
}
function onDarkLeave(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLButtonElement).style.color = "#666";
  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
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
      className="flex h-16 shrink-0 items-center justify-between px-4 lg:px-3"
      style={{ background: "#1a1a1a", borderBottom: "1px solid #2a2a2a" }}
    >
      {/* ── Left: hamburger (mobile) + sidebar toggle (desktop) ──── */}
      <div className="flex items-center gap-1">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D36969] lg:hidden"
          style={{ color: "#666", background: "transparent" }}
          onMouseEnter={(e) => onDarkHover(e)}
          onMouseLeave={(e) => onDarkLeave(e)}
        >
          <IconHamburger />
        </button>

        {/* Sidebar collapse/expand toggle — desktop only */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D36969]"
          style={{ color: "#666", background: "transparent" }}
          onMouseEnter={(e) => onDarkHover(e)}
          onMouseLeave={(e) => onDarkLeave(e)}
          suppressHydrationWarning
        >
          {isCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* ── Right: user info + sign out ──────────────────────────── */}
      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="hidden h-5 w-px sm:block" style={{ background: "#2a2a2a" }} />

            <span
              className="hidden rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest sm:inline-block"
              style={{
                background: "rgba(211,105,105,0.1)",
                color: "#D36969",
                border: "1px solid rgba(211,105,105,0.2)",
              }}
            >
              {roleLabel}
            </span>

            <span
              className="hidden text-sm font-medium sm:block"
              style={{ color: "#c0c0c0" }}
            >
              {user.full_name}
            </span>

            <div className="hidden h-5 w-px sm:block" style={{ background: "#2a2a2a" }} />
          </>
        )}

        {/* Sign out */}
        <button
          type="button"
          onClick={() => void performLogout()}
          disabled={logoutLoading}
          aria-label="Log out"
          className="flex min-h-[36px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D36969] disabled:opacity-40"
          style={{ color: "#888", border: "1px solid #2e2e2e", background: "transparent" }}
          suppressHydrationWarning
          onMouseEnter={(e) => {
            if (!logoutLoading) {
              (e.currentTarget as HTMLButtonElement).style.color = "#D36969";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(211,105,105,0.35)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(211,105,105,0.06)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#888";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#2e2e2e";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
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
