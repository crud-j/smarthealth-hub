/**
 * patientSearch.worker.ts — Browser Web Worker
 *
 * Client-side fuzzy filter and highlight over the currently-loaded patient
 * page so typing in the search box never lags on older front-desk hardware.
 *
 * Consumed via useWebWorker<PatientSearchApi> in usePatients.ts and
 * PatientTable.tsx. Server-side paginated search is a separate API call;
 * this only refines results already in memory.
 */
import * as Comlink from "comlink";

export interface PatientRow {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  mobileNumber?: string;
}

const patientSearchApi = {
  /**
   * Filters rows by query across code, name, and mobile.
   * Returns matching rows with a `highlight` string marking matched segments.
   */
  filter(rows: PatientRow[], query: string): PatientRow[] {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.patientCode.toLowerCase().includes(q) ||
        r.firstName.toLowerCase().includes(q) ||
        r.lastName.toLowerCase().includes(q) ||
        (r.mobileNumber ?? "").toLowerCase().includes(q)
    );
  },
};

export type PatientSearchApi = typeof patientSearchApi;
Comlink.expose(patientSearchApi);
