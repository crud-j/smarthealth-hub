"use client";

/**
 * AlertDialog — accessible confirmation dialog for destructive or significant
 * actions. Replaces SweetAlert2's swConfirm() pattern.
 *
 * Usage:
 *   <AlertDialog
 *     open={showDialog}
 *     title="Delete patient?"
 *     description="This action cannot be undone."
 *     confirmLabel="Delete"
 *     isDangerous
 *     onConfirm={handleDelete}
 *     onCancel={() => setShowDialog(false)}
 *   />
 *
 * Or use the imperative helper (useConfirmDialog hook) for one-off confirmations
 * without managing state manually.
 */

import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// AlertDialog component
// ---------------------------------------------------------------------------

export interface AlertDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  /** Called when the user clicks the confirm button. */
  onConfirm: () => void;
  /** Called when the user clicks Cancel or presses Escape. */
  onCancel: () => void;
  /** Whether the confirm action is in progress (shows a spinner / disables buttons). */
  loading?: boolean;
}

export function AlertDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDangerous = false,
  onConfirm,
  onCancel,
  loading = false,
}: AlertDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button when dialog opens (safe default for destructive actions)
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmBtnCls = isDangerous
    ? "min-w-[100px] rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
    : "min-w-[100px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600";

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 p-4"
      aria-hidden={!open}
    >
      {/* Trap clicks on backdrop */}
      <div
        className="absolute inset-0"
        onClick={() => { if (!loading) onCancel(); }}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        {/* Icon */}
        <div className="flex flex-col items-center px-6 pt-6 pb-2 text-center">
          {isDangerous ? (
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-red-600"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          ) : (
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-teal-600"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          )}

          <h2
            id="alert-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            {title}
          </h2>
          <p
            id="alert-dialog-description"
            className="mt-2 text-sm text-slate-600"
          >
            {description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={confirmBtnCls}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useConfirmDialog — hook that provides state management for a single dialog
// ---------------------------------------------------------------------------

export type { AlertDialogProps as UseConfirmDialogOptions };
