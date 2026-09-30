"use client";

import Link from "next/link";
import { use } from "react";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";

interface PatientVerifySummaryApiResponse {
  id: string; patient_code: string; full_name: string; age: number;
  sex: "male" | "female"; is_senior: boolean; is_pwd: boolean; is_pregnant: boolean;
  last_visit_date?: string | null; card_status?: string | null;
}

interface PatientVerifySummaryViewModel {
  id: string; patientCode: string; fullName: string; age: number;
  sex: "male" | "female"; isSenior: boolean; isPwd: boolean; isPregnant: boolean;
  lastVisitDate: string | null; cardStatus: string | null;
}

type PageState =
  | { phase: "loading" }
  | { phase: "ready"; summary: PatientVerifySummaryViewModel }
  | { phase: "error"; message: string };

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function mapSummary(data: PatientVerifySummaryApiResponse): PatientVerifySummaryViewModel {
  return {
    id: data.id, patientCode: data.patient_code, fullName: data.full_name, age: data.age,
    sex: data.sex, isSenior: data.is_senior, isPwd: data.is_pwd, isPregnant: data.is_pregnant,
    lastVisitDate: data.last_visit_date ?? null, cardStatus: data.card_status ?? null,
  };
}

const FLAG_COLORS: Record<string, string> = {
  "Card Active": "bg-emerald-100 text-emerald-700 border border-emerald-200",
  "Card Not Active": "bg-amber-100 text-amber-700 border border-amber-200",
  "Senior": "bg-violet-100 text-violet-700 border border-violet-200",
  "PWD": "bg-sky-100 text-sky-700 border border-sky-200",
  "Pregnant": "bg-pink-100 text-pink-700 border border-pink-200",
};

function FlagBadge({ label }: { label: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${FLAG_COLORS[label] ?? "bg-stone-100 text-stone-600 border border-stone-200"}`}>
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#f0e4dd] py-3">
      <span className="text-sm font-semibold text-[#7a5252]">{label}</span>
      <span className="text-sm font-bold text-[#1a0808]">{value}</span>
    </div>
  );
}

export default function PatientVerifyPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = use(params);
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        const summary = await apiFetch<PatientVerifySummaryApiResponse>(`/patients/${patientId}/verify`);
        if (!active) return;
        setState({ phase: "ready", summary: mapSummary(summary) });
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ phase: "error", message: "Patient not found or inactive." });
          return;
        }
        setState({ phase: "error", message: "Failed to load patient verification details. Please try again." });
      }
    }
    void loadSummary();
    return () => { active = false; };
  }, [patientId]);

  if (state.phase === "loading") {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-8">
        <div className="mb-6 space-y-3">
          <div className="h-6 w-40 animate-pulse rounded bg-[#e8d5cc]" />
          <div className="h-8 w-64 animate-pulse rounded-lg bg-[#e8d5cc]" />
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-[#e8d5cc]" />
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-10">
        <div
          role="alert"
          className="overflow-hidden rounded-xl border border-[#fcc] bg-[#fef2f2]"
          style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fef2f2] to-white border-b border-[#fcc]">
            <span className="inline-block h-4 w-1 rounded-full bg-[#dc2626]" aria-hidden="true" />
            <h1 className="text-sm font-bold text-[#b91c1c]">Verification Unavailable</h1>
          </div>
          <div className="p-5">
            <p className="mb-4 text-sm text-[#7a5252]">{state.message}</p>
            <Link
              href="/patients"
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
              style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
            >
              Back to Patients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { summary } = state;
  const isActiveCard = summary.cardStatus === "active" || summary.cardStatus === null;

  return (
    <div className="mx-auto max-w-[760px] px-4 py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#b5343e]">Patient Verification</p>
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">{summary.fullName}</h1>
          <p className="mt-1 text-sm text-[#7a5252]">Authenticated summary from the patient verification endpoint.</p>
        </div>
        <Link
          href={`/patients/${patientId}`}
          className="rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
        >
          Back to Profile
        </Link>
      </div>

      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
          <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#1a0808]">Verification Summary</h2>
        </div>

        <div className="p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <FlagBadge label={isActiveCard ? "Card Active" : "Card Not Active"} />
            {summary.isSenior && <FlagBadge label="Senior" />}
            {summary.isPwd && <FlagBadge label="PWD" />}
            {summary.isPregnant && <FlagBadge label="Pregnant" />}
          </div>

          <p className="mb-4 text-sm text-[#7a5252]">
            Patient code: <strong className="font-mono text-[#3d2222]">{summary.patientCode}</strong>
          </p>

          <div>
            <InfoRow label="Age" value={`${summary.age} years`} />
            <InfoRow label="Sex" value={summary.sex.charAt(0).toUpperCase() + summary.sex.slice(1)} />
            <InfoRow label="Last Visit" value={formatDateTime(summary.lastVisitDate)} />
            <InfoRow label="Card Status" value={summary.cardStatus ?? "No card issued"} />
          </div>
        </div>
      </div>
    </div>
  );
}
