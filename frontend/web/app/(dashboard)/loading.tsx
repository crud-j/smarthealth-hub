/**
 * Dashboard loading.tsx — App Router Suspense fallback for the dashboard group.
 *
 * Shown while a Server Component page is streaming or any segment is pending.
 * Uses the established warm rose palette skeleton pattern.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading page content">
      {/* Heading skeleton */}
      <div className="mb-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[#e8d5cc]" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-[#e8d5cc]" />
      </div>

      {/* 4 metric card skeletons */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-[#e5d4cc] bg-white p-5"
            style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
          >
            <div className="mb-4 h-10 w-10 animate-pulse rounded-xl bg-[#e8d5cc]" />
            <div className="mb-2 h-10 w-20 animate-pulse rounded-lg bg-[#e8d5cc]" />
            <div className="h-3 w-28 animate-pulse rounded bg-[#e8d5cc]" />
          </div>
        ))}
      </div>

      {/* Table panel skeleton */}
      <div
        className="overflow-hidden rounded-xl border border-[#e5d4cc] bg-white"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        {/* Panel header skeleton */}
        <div className="flex items-center gap-2.5 border-b border-[#edd9d0] bg-gradient-to-br from-[#fdf0eb] to-white px-5 py-4">
          <div className="h-4 w-1 rounded-full bg-[#e8d5cc]" />
          <div className="h-4 w-40 animate-pulse rounded bg-[#e8d5cc]" />
        </div>
        {/* Row skeletons */}
        <div className="divide-y divide-[#f0e4dd]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-9 w-9 animate-pulse rounded-full bg-[#e8d5cc]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-[#e8d5cc]" />
                <div className="h-3 w-24 animate-pulse rounded bg-[#e8d5cc]" />
              </div>
              <div className="h-5 w-20 animate-pulse rounded-full bg-[#e8d5cc]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
