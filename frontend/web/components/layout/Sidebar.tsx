"use client";

/**
 * Sidebar — authenticated shell navigation.
 *
 * isCollapsed is controlled by the parent (DashboardLayout) and toggled via
 * the button in Topbar, so no collapse/expand button lives here.
 *
 * Which links each role sees lives in `lib/navigation.ts` (pinned per role by
 * `tests/lib/navigation.test.ts`); this file only renders it.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/hooks/useAuth";
import { activeNavHref, visibleNavGroups, type NavIcon } from "@/lib/navigation";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconPatients() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconCards() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IconAppointments() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}
function IconSms() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconAudit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function IconProfile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconSecurity() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function IconQrCode() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h3v3"/><path d="M17 21v-3h3"/><path d="M14 21h3"/>
    </svg>
  );
}
function IconInbox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
function IconImmunization() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" />
    </svg>
  );
}
function IconActivity() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconInactive() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4" />
      <circle cx="17.5" cy="17.5" r="4" /><line x1="14.7" y1="20.3" x2="20.3" y2="14.7" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

const NAV_ICONS: Record<NavIcon, () => React.ReactElement> = {
  dashboard: IconDashboard,
  patients: IconPatients,
  appointments: IconAppointments,
  immunization: IconImmunization,
  cards: IconCards,
  archive: IconArchive,
  inactive: IconInactive,
  inbox: IconInbox,
  qr: IconQrCode,
  analytics: IconAnalytics,
  sms: IconSms,
  users: IconUsers,
  audit: IconAudit,
  activity: IconActivity,
  settings: IconSettings,
  profile: IconProfile,
  security: IconSecurity,
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  bhw: "Barangay Health Worker",
  physician: "Physician / Nurse",
  admin_staff: "Admin Staff",
};

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

// ---------------------------------------------------------------------------
// Tooltip — shown beside icon when sidebar is collapsed
// ---------------------------------------------------------------------------

function NavTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="
        pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2
        rounded-md px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap
        shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150
        bg-[#1e1e1e] border border-[#353535]
      "
    >
      {/* Caret — CSS border triangle, border-color trick cannot be expressed without inline */}
      <span
        className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent"
        style={{ borderRightColor: "#353535" }}
        aria-hidden="true"
      />
      <span
        className="absolute right-full top-1/2 -translate-y-1/2 translate-x-px border-[4px] border-transparent"
        style={{ borderRightColor: "#1e1e1e" }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarProps {
  user: CurrentUser | null;
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
}

export default function Sidebar({ user, isOpen, onClose, isCollapsed }: SidebarProps) {
  const pathname = usePathname();

  const role = user?.role?.toLowerCase() ?? "";
  const initials = user?.full_name ? getInitials(user.full_name) : "?";

  const visibleGroups = visibleNavGroups(role);
  const activeHref = activeNavHref(
    pathname,
    visibleGroups.flatMap((group) => group.items)
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        data-theme="dark-shell"
        className={[
          "fixed inset-y-0 left-0 z-30 flex flex-col",
          "bg-[var(--shell-bg)] border-r border-[var(--shell-border)]",
          "transition-all duration-300 ease-in-out",
          "lg:static lg:h-full lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-16" : "w-64",
        ].join(" ")}
        aria-label="Main navigation"
      >

        {/* ── Brand / Logo ─────────────────────────────────────────────── */}
        <div
          className={[
            "flex h-16 shrink-0 items-center gap-3 px-3 border-b border-[var(--shell-border)]",
            isCollapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <div className={["flex items-center gap-3 min-w-0", isCollapsed ? "justify-center" : ""].join(" ")}>
            <Image
              src="/BHCFINALLOGO.png"
              alt="BHC Logo"
              width={34}
              height={34}
              className="shrink-0 object-contain"
              priority
            />
            {!isCollapsed && (
              <div className="min-w-0 overflow-hidden">
                <p className="truncate text-sm font-bold leading-tight text-white">
                  SmartHealth Hub
                </p>
                <p className="truncate text-[11px] font-medium leading-tight mt-0.5 text-[var(--shell-accent)]">
                  Barangay Health Center
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Navigation ───────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto px-2 py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          role="navigation"
        >
          <ul className="space-y-5" role="list">
            {visibleGroups.map((group) => (
              <li key={group.label}>
                {!isCollapsed && (
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    {group.label}
                  </p>
                )}
                {isCollapsed && (
                  <div className="mb-2 mx-3 h-px bg-[var(--shell-border)]" />
                )}

                <ul className="space-y-0.5" role="list">
                  {group.items.map((item) => {
                    const isActive = item.href === activeHref;
                    const Icon = NAV_ICONS[item.icon];

                    return (
                      <li key={item.href} className={isCollapsed ? "relative group" : ""}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => {
                            if (typeof window !== "undefined" && window.innerWidth < 1024) {
                              onClose();
                            }
                          }}
                          className={[
                            "relative flex min-h-[40px] items-center gap-3 rounded-lg text-sm font-medium",
                            "transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]",
                            isCollapsed
                              ? "justify-center px-0 py-2 mx-1"
                              : "px-3 py-2",
                            isActive
                              ? "text-white shadow-sm bg-[var(--shell-accent-subtle)]"
                              : "text-gray-400 hover:text-gray-200 hover:bg-[#242424]",
                          ].join(" ")}
                        >
                          {isActive && !isCollapsed && (
                            <span
                              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--shell-accent)]"
                              aria-hidden="true"
                            />
                          )}

                          <span className={["shrink-0", isActive ? "text-[var(--shell-accent)]" : ""].join(" ")}>
                            <Icon />
                          </span>

                          {!isCollapsed && (
                            <span className="truncate">{item.label}</span>
                          )}
                        </Link>

                        {isCollapsed && <NavTooltip label={item.label} />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── User footer ──────────────────────────────────────────────── */}
        {user && (
          <div
            className={[
              "shrink-0 px-3 py-3 border-t border-[var(--shell-border)]",
              isCollapsed ? "relative group" : "",
            ].join(" ")}
          >
            <div
              className={[
                "flex items-center gap-3 rounded-xl p-2 transition-colors duration-150",
                "hover:bg-white/5 cursor-default",
                isCollapsed ? "justify-center" : "",
              ].join(" ")}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold border bg-[#353535] text-[var(--shell-accent)] border-[#444]"
                aria-hidden="true"
              >
                {initials}
              </div>

              {!isCollapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold leading-tight text-white">
                      {user.full_name}
                    </p>
                    <p className="truncate text-[10px] leading-tight text-gray-400 mt-0.5">
                      {ROLE_LABELS[role] ?? role}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border bg-[rgba(211,105,105,0.1)] text-[var(--shell-accent)] border-[rgba(211,105,105,0.2)]">
                    {role}
                  </span>
                </>
              )}
            </div>

            {isCollapsed && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded-md px-2.5 py-2 text-xs whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#1e1e1e] border border-[#353535]"
              >
                <span
                  className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent"
                  style={{ borderRightColor: "#353535" }}
                  aria-hidden="true"
                />
                <span
                  className="absolute right-full top-1/2 -translate-y-1/2 translate-x-px border-[4px] border-transparent"
                  style={{ borderRightColor: "#1e1e1e" }}
                  aria-hidden="true"
                />
                <span className="block font-semibold text-white">{user.full_name}</span>
                <span className="block text-gray-400 text-[10px] mt-0.5">{ROLE_LABELS[role] ?? role}</span>
              </span>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
