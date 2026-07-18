import type { Metadata } from "next";
import { Suspense } from "react";
import PatientListClient from "./_components/PatientListClient";

export const metadata: Metadata = { title: "Patients — SmartHealth Hub" };

/**
 * Patient list page.
 *
 * This is a Server Component shell that renders the page title and delegates
 * the interactive list/search/filter UI to the ``PatientListClient`` Client
 * Component island.
 *
 * SSR note: The initial patient list fetch happens client-side in the hook
 * (usePatientList) so the auth cookie is available for the API call.
 * This is correct because this route is behind JWT middleware and the
 * cookie is only available in a browser context.
 */
export default function PatientsPage() {
  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: "0.25rem",
            }}
          >
            Patients
          </h1>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
            Search and manage patient records
          </p>
        </div>
      </div>

      {/* Interactive list — client component */}
      <Suspense
        fallback={
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "#94a3b8",
              fontSize: "0.875rem",
            }}
          >
            Loading patients...
          </div>
        }
      >
        <PatientListClient />
      </Suspense>
    </div>
  );
}
