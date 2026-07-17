"use client";
// TODO: Phase 2 — generic sortable/filterable data table (base for PatientTable, SmsLog table, etc.)
import type { ReactNode } from "react";
export default function DataTable({ children }: { children?: ReactNode }) {
  return <table><tbody>{children}</tbody></table>;
}
