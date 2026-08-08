import Swal from "sweetalert2";
import type { SweetAlertResult } from "sweetalert2";

const SwalInstance = Swal.mixin({
  confirmButtonColor: "#0d9488",   // teal-600
  cancelButtonColor: "#64748b",    // slate-500
  // NOTE: focusConfirm must NOT be set here — it is incompatible with toasts
  // and SweetAlert2 logs a warning when toast:true inherits it from a mixin.
  // It is set explicitly only in swConfirm below.
  customClass: {
    popup: "rounded-xl shadow-xl text-sm",
    title: "text-base font-semibold text-slate-900",
    htmlContainer: "text-sm text-slate-600",
    confirmButton: "rounded-lg px-4 py-2 text-sm font-semibold",
    cancelButton: "rounded-lg px-4 py-2 text-sm font-medium",
  },
});

/** Top-right auto-dismissing toast for successful mutations */
export async function swSuccess(message: string, title = "Success"): Promise<void> {
  await SwalInstance.fire({
    icon: "success",
    title,
    text: message,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
  });
}

/** Top-right auto-dismissing toast for API/network errors */
export async function swError(message: string, title = "Something went wrong"): Promise<void> {
  await SwalInstance.fire({
    icon: "error",
    title,
    text: message,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 5000,
    timerProgressBar: true,
  });
}

/** Top-right auto-dismissing toast for neutral information */
export async function swInfo(message: string, title = "Info"): Promise<void> {
  await SwalInstance.fire({
    icon: "info",
    title,
    text: message,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 4000,
    timerProgressBar: true,
  });
}

/** Centered confirmation dialog for destructive or significant actions */
export async function swConfirm(options: {
  title: string;
  text: string;
  confirmLabel?: string;
  isDangerous?: boolean;
}): Promise<SweetAlertResult> {
  return SwalInstance.fire({
    icon: options.isDangerous ? "warning" : "question",
    title: options.title,
    text: options.text,
    showCancelButton: true,
    confirmButtonText: options.confirmLabel ?? "Confirm",
    cancelButtonText: "Cancel",
    confirmButtonColor: options.isDangerous ? "#dc2626" : "#0d9488",
    reverseButtons: true,
    focusConfirm: false,   // safe here — this is a modal, not a toast
  });
}

export { SwalInstance as swSwal };
