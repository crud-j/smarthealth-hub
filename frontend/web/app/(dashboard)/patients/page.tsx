import type { Metadata } from "next";
import { Suspense } from "react";
import PatientListClient from "./_components/PatientListClient";

export const metadata: Metadata = { 
  title: "Patients — SmartHealth Hub" 
}; //[cite: 2]

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function PatientListSkeleton() {
  return (
    <div 
      className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      aria-busy="true"
      aria-label="Loading patient records"
    >
      <ul role="list" className="divide-y divide-slate-100">
        {Array.from({ length: 6 }).map((_, i) => ( //[cite: 2]
          <li key={i} className="flex items-center gap-4 px-6 py-4">
            {/* Avatar Skeleton */}
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-100" />
            
            {/* Text Skeleton */}
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-24 animate-pulse rounded-sm bg-slate-50" />
            </div>

            {/* Desktop-only secondary column skeleton */}
            <div className="hidden sm:block">
              <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Layout
// ---------------------------------------------------------------------------

export default function PatientsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Patients
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Search and manage patient records.
        </p>
      </header>

      {/* Data Boundary */}
      <Suspense fallback={<PatientListSkeleton />}>
        <PatientListClient />
      </Suspense>
    </main>
  );
}