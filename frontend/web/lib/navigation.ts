/**
 * Sidebar navigation: which links each role sees, and which link is active.
 *
 * Hiding a link is not access control. The backend `require_role(...)` guard
 * on each page's API is authoritative; every `roles` list below mirrors the
 * guard named in its comment so staff never see a link to a page that would
 * only answer "forbidden". `roles: []` means every signed-in role.
 *
 * Admin role model B: the Administration group is admin-only and holds
 * system pages (users, audit log, health, configuration), never clinical PHI.
 */

export type NavIcon =
  | "dashboard"
  | "patients"
  | "appointments"
  | "immunization"
  | "cards"
  | "archive"
  | "inbox"
  | "qr"
  | "analytics"
  | "sms"
  | "users"
  | "audit"
  | "activity"
  | "settings"
  | "profile"
  | "security"

export interface NavItem {
  href: string
  label: string
  icon: NavIcon
  /** Roles that see the link; empty = everyone signed in. */
  roles: readonly string[]
  /** Other pages that belong to this link (highlight it there too). */
  alsoActiveOn?: readonly string[]
}

export interface NavGroup {
  label: string
  items: readonly NavItem[]
}

const ADMIN = ["admin"] as const

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: [] }],
  },
  {
    label: "Patient Care",
    items: [
      { href: "/patients", label: "Patients", icon: "patients", roles: [] },
      { href: "/appointments", label: "Appointments", icon: "appointments", roles: [] },
      { href: "/immunizations", label: "Immunizations", icon: "immunization", roles: [] },
      { href: "/health-cards", label: "Health Cards", icon: "cards", roles: [] },
      // GET /patients/archived: require_role("admin", "physician")
      { href: "/patients/archived", label: "Patient Archive", icon: "archive", roles: ["admin", "physician"] },
    ],
  },
  {
    label: "Registrations",
    items: [
      // Pre-visit drafts (all staff); the Online tab and the full list are admin-only
      // (intake_applications.py _ADMIN_ONLY), checked inside the pages.
      {
        href: "/registrations",
        label: "Registration Inbox",
        icon: "inbox",
        roles: [],
        alsoActiveOn: ["/settings/intake-applications"],
      },
      // POST /patients/intake-token is BHW+, but the poster is a front-desk task.
      { href: "/settings/registration-qr", label: "Registration QR", icon: "qr", roles: ["admin", "bhw", "admin_staff"] },
    ],
  },
  {
    label: "Insights",
    items: [
      // Most analytics routes accept any staff; admin staff has no reporting duty.
      { href: "/analytics", label: "Analytics", icon: "analytics", roles: ["admin", "bhw", "physician"] },
      // GET /sms/logs: sms.py _logs_role = require_role("admin", "bhw")
      { href: "/sms-logs", label: "SMS Logs", icon: "sms", roles: ["admin", "bhw"] },
    ],
  },
  {
    label: "Administration",
    items: [
      // users.py / audit.py / system_config.py: AdminOnly = require_role("admin")
      { href: "/settings/users", label: "Users", icon: "users", roles: ADMIN },
      { href: "/settings/audit-log", label: "Audit Log", icon: "audit", roles: ADMIN },
      { href: "/settings/system-health", label: "System Health", icon: "activity", roles: ADMIN },
      { href: "/settings", label: "System Configuration", icon: "settings", roles: ADMIN },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings/profile", label: "Profile", icon: "profile", roles: [] },
      { href: "/settings/security", label: "Security", icon: "security", roles: [] },
    ],
  },
]

/** Groups and links the given role may see; empty groups are dropped. */
export function visibleNavGroups(role: string | null | undefined): NavGroup[] {
  const r = (role ?? "").toLowerCase()
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.length === 0 || item.roles.includes(r)),
  })).filter((group) => group.items.length > 0)
}

function covers(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * The href of the single link to highlight: the one whose path (or one of its
 * `alsoActiveOn` paths) is the longest whole-segment prefix of `pathname`.
 */
export function activeNavHref(pathname: string, items: readonly NavItem[]): string | null {
  let best: string | null = null
  let bestLength = -1
  for (const item of items) {
    for (const prefix of [item.href, ...(item.alsoActiveOn ?? [])]) {
      if (covers(prefix, pathname) && prefix.length > bestLength) {
        best = item.href
        bestLength = prefix.length
      }
    }
  }
  return best
}
