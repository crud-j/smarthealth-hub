"use client";

/**
 * Dashboard error.tsx — App Router error boundary for the dashboard group.
 *
 * Shown when an unhandled exception bubbles up from a dashboard page or component.
 * The `reset` function re-renders the page segment, clearing the error state.
 *
 * Per Next.js 15: must be a Client Component and receive `error` + `reset` props.
 */

import { useEffect } from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to console in development; in production connect to an error tracking service.
    console.error("[SmartHealth Hub] Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      {/* Error icon */}
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h1 className="mb-2 text-xl font-bold text-slate-900">Something went wrong</h1>
      <p className="mb-1 text-sm text-slate-500">
        An unexpected error occurred while loading this page.
      </p>
      {error.digest && (
        <p className="mb-6 font-mono text-xs text-slate-400">
          Error ID: {error.digest}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-[44px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
