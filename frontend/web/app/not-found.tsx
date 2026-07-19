import Link from "next/link";

/**
 * 404 Not Found page.
 *
 * Accessible, branded page shown when the requested route does not exist.
 * Links back to the Dashboard so authenticated BHW staff can continue working.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      {/* Brand header */}
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="white" aria-hidden="true">
            <rect x="6" y="1" width="4" height="14" rx="1" />
            <rect x="1" y="6" width="14" height="4" rx="1" />
          </svg>
        </div>
        <span className="font-bold text-teal-700">SmartHealth Hub</span>
      </div>

      {/* 404 content */}
      <div className="mb-2 text-7xl font-black text-slate-200" aria-hidden="true">
        404
      </div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mb-8 max-w-sm text-sm text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          Return to Dashboard
        </Link>
        <Link
          href="/patients"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          View Patients
        </Link>
      </div>
    </main>
  );
}
