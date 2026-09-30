"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[SmartHealth Hub] Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      {/* Error icon */}
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#fcc] bg-[#fef2f2]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.12)" }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h1 className="mb-2 text-2xl leading-tight text-[#1a0808] font-display">Something went wrong</h1>
      <p className="mb-1 text-sm font-medium text-[#7a5252]">
        An unexpected error occurred while loading this page.
      </p>
      {error.digest && (
        <p className="mb-6 font-mono text-xs text-[#c08080]">Error ID: {error.digest}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-[44px] rounded-lg px-5 py-2 text-sm font-bold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="flex min-h-[44px] items-center rounded-lg border border-[#e5d4cc] bg-white px-5 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
