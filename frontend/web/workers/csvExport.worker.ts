/**
 * csvExport.worker.ts — Browser Web Worker
 *
 * Formats large report datasets into CSV client-side off the main thread so
 * the "Export" button on /analytics/reports never appears to freeze the UI,
 * even for datasets with thousands of rows.
 *
 * Consumed via useWebWorker<CsvExportApi> in
 * app/(dashboard)/analytics/reports/page.tsx.
 */
import * as Comlink from "comlink";

const csvExportApi = {
  /**
   * Converts an array of plain objects to a CSV string.
   * Column order follows the keys of the first row.
   * Values are quoted and commas/newlines escaped.
   */
  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [
      headers.map(escape).join(","),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ];
    return lines.join("\r\n");
  },
};

export type CsvExportApi = typeof csvExportApi;
Comlink.expose(csvExportApi);
