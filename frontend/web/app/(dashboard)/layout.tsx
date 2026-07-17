import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Dashboard layout — wraps all authenticated pages.
 * Will include: sidebar navigation, top header, and main content area.
 * Sidebar and header components will be added in Phase 1.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar placeholder — will be replaced by <AppSidebar /> in Phase 1 */}
      <aside
        style={{
          width: 260,
          background: "#0f172a",
          color: "white",
          padding: "1.5rem 1rem",
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "2rem", color: "#14b8a6" }}>
          SmartHealth Hub
        </div>
        <nav aria-label="Main navigation">
          {/* TODO: Replace with NavLink components in Phase 1 */}
          <p style={{ fontSize: "0.75rem", color: "#64748b" }}>Navigation — Phase 1</p>
        </nav>
      </aside>

      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header placeholder */}
        <header
          style={{
            height: 64,
            background: "white",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            padding: "0 1.5rem",
            flexShrink: 0,
          }}
        >
          {/* TODO: Replace with <AppHeader /> in Phase 1 */}
          <span style={{ fontSize: "0.875rem", color: "#64748b" }}>Header — Phase 1</span>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: "1.5rem", background: "#f8fafc" }}>{children}</main>
      </div>
    </div>
  );
}
