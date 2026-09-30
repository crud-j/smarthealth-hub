"use client";

/**
 * ToastContainer — renders global toast notifications.
 *
 * Mount this once in the root layout. Toasts are emitted via `toast` from
 * "@/lib/toast" and appear in the top-right corner, auto-dismissing after
 * their configured duration.
 */

import { useEffect, useState, useCallback } from "react";
import { toast as toastBus, type ToastMessage } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SuccessIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-emerald-600"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-red-600"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-blue-600"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles per toast type
// ---------------------------------------------------------------------------

const TOAST_STYLES: Record<
  ToastMessage["type"],
  { wrapper: string; bar: string }
> = {
  success: {
    wrapper:
      "border-l-4 border-emerald-500 bg-white shadow-lg ring-1 ring-black/5",
    bar: "bg-emerald-500",
  },
  error: {
    wrapper:
      "border-l-4 border-red-500 bg-white shadow-lg ring-1 ring-black/5",
    bar: "bg-red-500",
  },
  info: {
    wrapper:
      "border-l-4 border-blue-500 bg-white shadow-lg ring-1 ring-black/5",
    bar: "bg-blue-500",
  },
};

// ---------------------------------------------------------------------------
// Single Toast
// ---------------------------------------------------------------------------

interface ActiveToast extends ToastMessage {
  exiting: boolean;
}

function Toast({
  t,
  onDismiss,
}: {
  t: ActiveToast;
  onDismiss: (id: string) => void;
}) {
  const styles = TOAST_STYLES[t.type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "pointer-events-auto relative w-80 overflow-hidden rounded-xl",
        styles.wrapper,
        t.exiting
          ? "animate-[fadeOut_200ms_ease-in_forwards]"
          : "animate-[fadeIn_200ms_ease-out]",
      ].join(" ")}
    >
      {/* Content */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        {t.type === "success" && <SuccessIcon />}
        {t.type === "error"   && <ErrorIcon />}
        {t.type === "info"    && <InfoIcon />}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{t.title}</p>
          {t.message && (
            <p className="mt-0.5 text-sm text-slate-600">{t.message}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(t.id)}
          aria-label="Dismiss notification"
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div
        className={["h-1 w-full", styles.bar].join(" ")}
        style={{
          animation: `shrinkWidth ${t.duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  useEffect(() => {
    return toastBus._subscribe((msg) => {
      const active: ActiveToast = { ...msg, exiting: false };
      setToasts((prev) => [...prev, active]);
      setTimeout(() => dismiss(msg.id), msg.duration);
    });
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <>
      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(1rem); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(1rem); }
        }
        @keyframes shrinkWidth {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      <div
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-3"
      >
        {toasts.map((t) => (
          <Toast key={t.id} t={t} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
