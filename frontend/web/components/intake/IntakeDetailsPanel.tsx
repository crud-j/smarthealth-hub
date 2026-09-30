"use client";
import { useState } from "react";
import { PurposeDetailsReadonlyView } from "@/components/intake/PurposeDetailsReadonlyView";

interface Props {
  visitPurpose: string | null;
  purposeDetails: Record<string, unknown> | null;
  draftSubmittedAt?: string | null;
  patientNameFromDraft?: string | null;
}

export function IntakeDetailsPanel({
  visitPurpose,
  purposeDetails,
  draftSubmittedAt,
  patientNameFromDraft,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!visitPurpose && !purposeDetails) return null;

  return (
    <div
      style={{
        borderRadius: "0.75rem",
        border: "1px solid #e5d4cc",
        background: "#fff",
        overflow: "hidden",
        marginTop: "1rem",
      }}
    >
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.875rem 1.25rem",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            color: "#1a0808",
          }}
        >
          Intake Submission Details
        </span>
        {/* Chevron icon — rotates when open */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            color: "#b09090",
          }}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Collapsible body */}
      {open && (
        <div
          style={{
            padding: "0 1.25rem 1.25rem",
            borderTop: "1px solid #f0e6e0",
          }}
        >
          {/* Visit Purpose */}
          {visitPurpose && (
            <div style={{ marginBottom: "0.75rem", marginTop: "0.75rem" }}>
              <p
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#b09090",
                  marginBottom: "0.125rem",
                }}
              >
                Visit Purpose
              </p>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#b5343e" }}>
                {visitPurpose}
              </p>
            </div>
          )}

          {/* Patient name from draft */}
          {patientNameFromDraft && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#b09090",
                  marginBottom: "0.125rem",
                }}
              >
                Patient Name (from draft)
              </p>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#1a0808" }}>
                {patientNameFromDraft}
              </p>
            </div>
          )}

          {/* Submitted at */}
          {draftSubmittedAt && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#b09090",
                  marginBottom: "0.125rem",
                }}
              >
                Submitted
              </p>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#1a0808" }}>
                {new Date(draftSubmittedAt).toLocaleString()}
              </p>
            </div>
          )}

          {/* Purpose-specific details */}
          {purposeDetails && (
            <div style={{ marginTop: "0.5rem" }}>
              <p
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#b09090",
                  marginBottom: "0.5rem",
                }}
              >
                Visit Details
              </p>
              <PurposeDetailsReadonlyView
                visitPurpose={visitPurpose}
                purposeDetails={purposeDetails}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
