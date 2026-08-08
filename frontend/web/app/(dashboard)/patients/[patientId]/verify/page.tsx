"use client";

import Link from "next/link";
import { use } from "react";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";

interface PatientVerifySummaryApiResponse {
  id: string;
  patient_code: string;
  full_name: string;
  age: number;
  sex: "male" | "female";
  is_senior: boolean;
  is_pwd: boolean;
  is_pregnant: boolean;
  last_visit_date?: string | null;
  card_status?: string | null;
}

interface PatientVerifySummaryViewModel {
  id: string;
  patientCode: string;
  fullName: string;
  age: number;
  sex: "male" | "female";
  isSenior: boolean;
  isPwd: boolean;
  isPregnant: boolean;
  lastVisitDate: string | null;
  cardStatus: string | null;
}

type PageState =
  | { phase: "loading" }
  | { phase: "ready"; summary: PatientVerifySummaryViewModel }
  | { phase: "error"; message: string };

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapSummary(data: PatientVerifySummaryApiResponse): PatientVerifySummaryViewModel {
  return {
    id: data.id,
    patientCode: data.patient_code,
    fullName: data.full_name,
    age: data.age,
    sex: data.sex,
    isSenior: data.is_senior,
    isPwd: data.is_pwd,
    isPregnant: data.is_pregnant,
    lastVisitDate: data.last_visit_date ?? null,
    cardStatus: data.card_status ?? null,
  };
}

function FlagBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.25rem 0.75rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 700,
        background: color,
        color: "white",
        marginRight: "0.5rem",
      }}
    >
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid #f1e4db" }}>
      <span style={{ color: "#7c3f3f", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "#1f2937", fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function PatientVerifyPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
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

        setState({
          phase: "error",
          message: "Failed to load patient verification details. Please try again.",
        });
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [patientId]);

  if (state.phase === "loading") {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#7c3f3f" }}>
        <p>Loading verification details...</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        role="alert"
        style={{
          maxWidth: "560px",
          margin: "40px auto",
          padding: "24px",
          borderRadius: "16px",
          border: "1px solid #fecaca",
          background: "#fff7f7",
          boxShadow: "0 8px 24px rgba(92, 20, 20, 0.08)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", color: "#991b1b" }}>Verification Unavailable</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{state.message}</p>
        <div style={{ marginTop: "1rem" }}>
          <Link
            href="/patients"
            style={{
              display: "inline-block",
              padding: "0.6rem 1rem",
              borderRadius: "0.5rem",
              background: "linear-gradient(135deg, #b5343e, #c94060)",
              color: "white",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Back to Patients
          </Link>
        </div>
      </div>
    );
  }

  const { summary } = state;
  const isActiveCard = summary.cardStatus === "active" || summary.cardStatus === null;

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 20px 56px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#b5343e", marginBottom: "0.5rem" }}>
            Patient Verification
          </div>
          <h1 style={{ margin: 0, color: "#1f2937" }}>{summary.fullName}</h1>
          <p style={{ margin: "0.35rem 0 0", color: "#6b7280" }}>Authenticated summary from the patient verification endpoint.</p>
        </div>

        <Link
          href={`/patients/${patientId}`}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #e5d4cc",
            color: "#3d2222",
            textDecoration: "none",
            background: "white",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          Back to Profile
        </Link>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e5d4cc",
          borderRadius: "1rem",
          padding: "1.5rem",
          boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
        }}
      >
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ marginBottom: "0.75rem" }}>
            <FlagBadge label={isActiveCard ? "Card Active" : "Card Not Active"} color={isActiveCard ? "#16a34a" : "#d97706"} />
            {summary.isSenior && <FlagBadge label="Senior" color="#7c3aed" />}
            {summary.isPwd && <FlagBadge label="PWD" color="#0ea5e9" />}
            {summary.isPregnant && <FlagBadge label="Pregnant" color="#db2777" />}
          </div>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Patient code: <strong style={{ color: "#3d2222" }}>{summary.patientCode}</strong></div>
        </div>

        <div style={{ borderTop: "1px solid #f1e4db" }}>
          <InfoRow label="Age" value={`${summary.age} years`} />
          <InfoRow label="Sex" value={summary.sex} />
          <InfoRow label="Last Visit" value={formatDateTime(summary.lastVisitDate)} />
          <InfoRow label="Card Status" value={summary.cardStatus ?? "No card issued"} />
        </div>
      </div>
    </div>
  );
}