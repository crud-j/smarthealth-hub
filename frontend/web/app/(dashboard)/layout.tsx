/**
 * Dashboard layout — authenticated shell.
 *
 * This is a Client Component because it needs useState for the mobile
 * sidebar open/close toggle and useCurrentUser for role-aware sidebar links.
 *
 * Server-side auth guard: Next.js middleware (middleware.ts) checks the JWT
 * cookie and redirects unauthenticated users to /login before this renders.
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
  const { user } = useCurrentUser();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar — fixed on desktop, slide-in on mobile */}
      <Sidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col lg:ml-0">
        <Topbar
          user={user}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />

        {/* Page content — receives each dashboard page as children */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
