"use client";
/**
 * Deactivate / reactivate a patient (Admin only on the server).
 *
 * Deactivate = switch the patient off for now: hidden from the patient list
 * and search, no SMS reminders, cannot be booked. Nothing is deleted, and an
 * Admin can switch them back on from the Inactive Patients page.
 * Archive is different: it stores an old record away (moved, duplicate...).
 */

import Link from "next/link";
import { useId, useState } from "react";

const MIN_REASON = 5;

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium" });
}

export function DeactivatePatientDialog({
  patientName,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  patientName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
  error?: string | null;
}) {
  const [reason, setReason] = useState("");
  const titleId = useId();
  const reasonId = useId();
  const ready = reason.trim().length >= MIN_REASON;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-[#eadbd3] bg-white p-6 shadow-2xl"
      >
        <h2 id={titleId} className="mb-2 text-xl text-[#2a1414] font-display">
          Deactivate {patientName}?
        </h2>
        <p className="mb-2 text-sm text-[#5a3a3a]">
          <strong>Nothing is deleted.</strong> The patient leaves the patient list and search, gets no SMS
          reminders and can&apos;t be booked until they are switched back on.
        </p>
        <p className="mb-4 text-sm text-[#5a3a3a]">
          You can reactivate them any time from <strong>Inactive Patients</strong>.
        </p>

        <label htmlFor={reasonId} className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#3d2222]">
          Reason *
        </label>
        <textarea
          id={reasonId}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Test record, registered twice by mistake, patient asked to stop for now"
          className="w-full rounded-lg border border-[#e5d4cc] px-3 py-2 text-sm text-[#1a0808] focus:outline-none focus:ring-2 focus:ring-[#b5343e]"
        />
        <p className="mt-1 text-xs text-[#8a6a6a]">
          At least {MIN_REASON} characters. Storing an old record away instead (moved away, transferred)? Use{" "}
          <strong>Archive</strong>.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!ready || loading}
            className="rounded-lg bg-[#b5343e] px-5 py-2 text-sm font-bold text-white hover:bg-[#9c2a33] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Deactivating..." : "Deactivate patient"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#e5d4cc] px-5 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function InactivePatientBanner({
  deactivatedAt,
  deactivatedByName,
  deactivationReason,
  canReactivate,
  onReactivate,
  reactivating,
}: {
  deactivatedAt: string | null | undefined;
  deactivatedByName: string | null | undefined;
  deactivationReason: string | null | undefined;
  canReactivate: boolean;
  onReactivate: () => void;
  reactivating: boolean;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-300 bg-stone-50 px-5 py-4"
    >
      <div className="min-w-0">
        <h2 id={titleId} className="text-sm font-bold text-stone-800">
          This patient is inactive
          {deactivatedAt && <span className="font-semibold"> since {formatDay(deactivatedAt)}</span>}
          {deactivatedByName && <span className="font-semibold"> (by {deactivatedByName})</span>}
        </h2>
        {deactivationReason && <p className="mt-0.5 text-xs text-stone-700">Reason: {deactivationReason}</p>}
        <p className="mt-1 text-xs text-stone-600">
          Nothing was deleted. Inactive patients are hidden from the patient list and search and get no SMS
          reminders.
          {canReactivate && (
            <>
              {" "}
              <Link href="/patients/inactive" className="font-semibold text-stone-800 underline">
                All inactive patients
              </Link>
            </>
          )}
        </p>
      </div>
      {canReactivate && (
        <button
          type="button"
          onClick={onReactivate}
          disabled={reactivating}
          className="shrink-0 rounded-lg bg-[#b5343e] px-4 py-2 text-sm font-bold text-white hover:bg-[#9c2a33] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {reactivating ? "Reactivating..." : "Reactivate patient"}
        </button>
      )}
    </section>
  );
}
