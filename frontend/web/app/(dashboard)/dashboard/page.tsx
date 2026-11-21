"use client";

/**
 * Dashboard: different content per role, decided by the server
 * (GET /dashboard/me). Until the backend has that route (404, Vercel deploys
 * before deploy.sh) the older one-size dashboard is shown instead.
 */

import AdminDashboard from "@/components/dashboard/AdminDashboard";
import AdminStaffDashboard from "@/components/dashboard/AdminStaffDashboard";
import BhwDashboard from "@/components/dashboard/BhwDashboard";
import GenericDashboard from "@/components/dashboard/GenericDashboard";
import PhysicianDashboard from "@/components/dashboard/PhysicianDashboard";
import { useRoleDashboard } from "@/hooks/useRoleDashboard";

export default function DashboardPage() {
  const state = useRoleDashboard();

  if (state.status === "unavailable") return <GenericDashboard />;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {state.status === "loading" && (
        <div aria-busy="true" aria-label="Loading dashboard" className="space-y-4">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          Could not load the dashboard: {state.message}
        </div>
      )}

      {state.status === "ready" && state.data.role === "physician" && <PhysicianDashboard data={state.data} />}
      {state.status === "ready" && state.data.role === "bhw" && <BhwDashboard data={state.data} />}
      {state.status === "ready" && state.data.role === "admin" && <AdminDashboard data={state.data} />}
      {state.status === "ready" && state.data.role === "admin_staff" && <AdminStaffDashboard data={state.data} />}
    </main>
  );
}
