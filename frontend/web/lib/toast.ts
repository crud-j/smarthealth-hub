/**
 * Global toast notification system — drop-in replacement for SweetAlert2 toasts.
 *
 * Usage:
 *   import { toast } from "@/lib/toast";
 *   toast.success("Patient registered successfully.");
 *   toast.error("Something went wrong.");
 *   toast.info("Processing…");
 *
 * The ToastContainer component (components/ui/toast-container.tsx) must be
 * rendered once at the root layout level to display toasts.
 */

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration: number;
}

type ToastListener = (msg: ToastMessage) => void;

const listeners = new Set<ToastListener>();

function emit(msg: ToastMessage): void {
  listeners.forEach((fn) => fn(msg));
}

function subscribe(fn: ToastListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function show(
  type: ToastType,
  message: string,
  title?: string,
  duration?: number,
): void {
  const defaults: Record<ToastType, { title: string; duration: number }> = {
    success: { title: "Success",              duration: 3500 },
    error:   { title: "Something went wrong", duration: 5000 },
    info:    { title: "Info",                 duration: 4000 },
  };
  emit({
    id:       `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title:    title ?? defaults[type].title,
    message,
    duration: duration ?? defaults[type].duration,
  });
}

/** Top-level toast API — mirrors the old swSuccess / swError / swInfo helpers. */
export const toast = {
  success: (message: string, title?: string) => show("success", message, title),
  error:   (message: string, title?: string) => show("error",   message, title),
  info:    (message: string, title?: string) => show("info",    message, title),

  /** Internal — used by ToastContainer to subscribe to events. */
  _subscribe: subscribe,
};
