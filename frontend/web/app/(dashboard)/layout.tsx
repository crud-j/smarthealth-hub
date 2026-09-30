/**
 * Dashboard layout — authenticated shell.
 *
 * isCollapsed is lifted here so both Sidebar (receives display state) and
 * Topbar (owns the toggle button) share a single source of truth.
 */
"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { useCurrentUser } from "@/hooks/useAuth";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useCurrentUser();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-canvas)]">
      <Sidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={isCollapsed}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:ml-0">
        <Topbar
          user={user}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed((v) => !v)}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
