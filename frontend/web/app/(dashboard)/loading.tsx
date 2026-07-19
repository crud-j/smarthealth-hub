/**
 * Dashboard loading.tsx — App Router Suspense fallback for the dashboard group.
 *
 * Shown while a Server Component page is streaming or any segment is pending.
 * Renders a skeleton grid that matches the general dashboard layout:
 *  - 4 metric card skeletons
 *  - A table-like rows skeleton
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading page content">
      {/* Heading skeleton */}
      <div className="mb-6">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-slate-200" />
      </div>

      {/* 4 metric card skeletons */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
                <div className="h-9 w-20 animate-pulse rounded-lg bg-slate-200" />
              </div>
              <div className="h-11 w-11 animate-pulse rounded-lg bg-slate-200" />
            </div>
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
