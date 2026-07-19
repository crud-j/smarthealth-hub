"use client";

/**
 * Sidebar — authenticated shell navigation.
 *
 * Role-aware: links not accessible to the current user's role are hidden.
 * Collapsible on mobile via the `isOpen` prop (toggled by Topbar hamburger).
 * Uses inline SVG icons — no icon library required (low bandwidth, no extra deps).
 *
 * WCAG 2.1 AA: all nav links are ≥44px tall, keyboard-navigable, with aria-current.
 *
 * Role matrix (SDP §10.3):
 *   admin        — full access
 *   bhw          — patients, appointments, health-cards, sms-logs, analytics
 *   physician    — patients, appointments, health-cards, analytics
 *   admin_staff  — patients, appointments, health-cards
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// SVG icon helpers (inline, no external dependency)
// ---------------------------------------------------------------------------

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function IconPatients() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconCards() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IconAppointments() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}
function IconSms() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconAudit() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10,9 9,9 8,9" />
    </svg>
  );
}
function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Nav link definition
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Roles allowed to see this link. Empty = all authenticated roles. */
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <IconDashboard />,
    roles: [],
  },
  {
    href: "/patients",
    label: "Patients",
    icon: <IconPatients />,
    roles: [],
  },
  {
    href: "/health-cards",
    label: "Health Cards",
    icon: <IconCards />,
    roles: [],
  },
  {
    href: "/appointments",
    label: "Appointments",
    icon: <IconAppointments />,
    roles: [],
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: <IconAnalytics />,
    roles: ["admin", "bhw", "physician"],
  },
  {
    href: "/sms-logs",
    label: "SMS Logs",
    icon: <IconSms />,
    roles: ["admin", "bhw"],
  },
  {
    href: "/settings/users",
    label: "Users",
    icon: <IconUsers />,
    roles: ["admin"],
  },
  {
    href: "/settings/audit-log",
    label: "Audit Log",
    icon: <IconAudit />,
    roles: ["admin"],
  },
  {
    href: "/settings/profile",
    label: "Profile",
    icon: <IconProfile />,
    roles: [],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarProps {
  user: CurrentUser | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const role = user?.role?.toLowerCase() ?? "";

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || item.roles.includes(role)
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-white transition-transform duration-300",
          "lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-label="Main navigation"
      >
        {/* Logo / brand */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-700 px-5">
          {/* Simple health cross icon */}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white" aria-hidden="true">
              <rect x="6" y="1" width="4" height="14" rx="1" />
              <rect x="1" y="6" width="14" height="4" rx="1" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-teal-400">SmartHealth Hub</p>
            <p className="text-xs leading-tight text-slate-400">Barangay Health Center</p>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" role="navigation">
          <ul className="space-y-1" role="list">
            {visibleItems.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      // Close mobile sidebar on navigation
                      if (typeof window !== "undefined" && window.innerWidth < 1024) {
                        onClose();
                      }
                    }}
                    className={[
                      "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400",
                      isActive
                        ? "bg-teal-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white",
                    ].join(" ")}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer — current user info */}
        {user && (
          <div className="border-t border-slate-700 px-4 py-3">
            <p className="truncate text-xs font-medium text-slate-200">
              {user.full_name}
            </p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
        )}
      </aside>
    </>
  );
}
