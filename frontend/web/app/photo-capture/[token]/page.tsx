"use client";

/**
 * Phone page for a patient photo (public: the phone is not signed in).
 *
 * Opened by scanning the QR code on the staff screen. The link token is the
 * only permission: it can upload a photo for one patient for 15 minutes and
 * cannot read anything back. The page shows the patient's initials only, so
 * staff can check they have the right patient.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, CircleCheck, Hourglass, ImagePlus, LoaderCircle, RotateCcw, Send, UserRound } from "lucide-react";
import { getPhonePage, manilaClock, sendPhonePhoto, shrinkPhoto, type PhonePage } from "@/lib/photo-capture";

type View =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready" }
  | { kind: "preview"; blob: Blob; url: string }
  | { kind: "sending"; url: string }
  | { kind: "sent"; url: string; at: string };

export default function PhotoCapturePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [page, setPage] = useState<PhonePage | null>(null);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getPhonePage(token)
      .then((info) => {
        if (cancelled) return;
        setPage(info);
        setView({ kind: "ready" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setView({
          kind: "invalid",
          message:
            (err as { status?: number }).status === 404
              ? "This photo link has expired or was replaced. Ask for a new QR code on the computer."
              : "Could not open this link. Check the internet connection and try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function previewUrl(): string | null {
    return view.kind === "preview" || view.kind === "sending" || view.kind === "sent" ? view.url : null;
  }

  async function picked(file: File | undefined) {
    if (!file) return;
    setError(null);
    const old = previewUrl();
    if (old) URL.revokeObjectURL(old);
    const blob = await shrinkPhoto(file);
    setView({ kind: "preview", blob, url: URL.createObjectURL(blob) });
  }

  async function send() {
    if (view.kind !== "preview") return;
    const { blob, url } = view;
    setView({ kind: "sending", url });
    try {
      const result = await sendPhonePhoto(token, blob);
      setView({ kind: "sent", url, at: result.uploaded_at });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setView({ kind: "invalid", message: "This photo link has expired. Ask for a new QR code on the computer." });
        return;
      }
      setError(err instanceof Error ? err.message : "Could not send the photo. Please try again.");
      setView({ kind: "preview", blob, url });
    }
  }

  const shown = previewUrl();

  return (
    <main className="min-h-dvh bg-[radial-gradient(120%_70%_at_50%_0%,#fdf0eb_0%,#fbf6f2_55%,#f6ede8_100%)] px-4 pb-10 pt-6 text-[#2a1414]">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#b5343e]">SmartHealth Hub</p>
        <h1 className="mt-1 text-center font-display text-[1.9rem] leading-tight">Patient photo</h1>

        {view.kind === "loading" && (
          <p className="mt-16 flex items-center gap-2 text-sm text-[#7a5252]" role="status">
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> Opening…
          </p>
        )}

        {view.kind === "invalid" && (
          <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center" role="alert">
            <Hourglass size={30} className="text-amber-600" aria-hidden="true" />
            <p className="text-sm font-medium text-amber-900">{view.message}</p>
          </div>
        )}

        {page && view.kind !== "loading" && view.kind !== "invalid" && (
          <>
            <p className="mt-2 text-sm text-[#7a5252]">
              For patient <strong className="text-[#2a1414]">{page.patient_initials}</strong> · link works until{" "}
              {manilaClock(page.expires_at)}
            </p>

            {/* Viewfinder */}
            <div className="relative mt-6 aspect-[4/5] w-full max-w-[300px] rounded-[1.75rem] bg-[#2a1414] p-2 shadow-[0_24px_48px_-24px_rgba(90,20,20,0.55)]">
              <div className="relative h-full w-full overflow-hidden rounded-[1.4rem] bg-[#3a2020]">
                {shown ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- local preview */
                  <img src={shown} alt="Photo to send" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-[#d9b9ad]">
                    <UserRound size={72} strokeWidth={1.1} aria-hidden="true" />
                    <span className="px-6 text-center text-xs">Head and shoulders, face the camera, plain background</span>
                  </div>
                )}
                {(["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"] as const).map((pos) => (
                  <span key={pos} aria-hidden="true" className={`pointer-events-none absolute h-6 w-6 rounded-sm border-white/80 ${pos}`} />
                ))}
                {view.kind === "sent" && (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-emerald-600/90 py-2.5 text-sm font-semibold text-white">
                    <CircleCheck size={18} aria-hidden="true" /> Sent
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-800">
                {error}
              </p>
            )}

            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take photo with camera"
              onChange={(e) => void picked(e.target.files?.[0])}
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose photo from gallery"
              onChange={(e) => void picked(e.target.files?.[0])}
            />

            {view.kind === "ready" && (
              <div className="mt-8 flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  aria-label="Take photo"
                  className="group flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_-6px_rgba(181,52,62,0.55)] ring-4 ring-[#b5343e] transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b5343e]"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#b5343e] to-[#c94060] text-white">
                    <Camera size={26} aria-hidden="true" />
                  </span>
                </button>
                <span className="text-sm font-semibold">Take photo</span>
                <button
                  type="button"
                  onClick={() => galleryInput.current?.click()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#b5343e] underline-offset-4 hover:underline"
                >
                  <ImagePlus size={16} aria-hidden="true" /> Choose from gallery
                </button>
              </div>
            )}

            {(view.kind === "preview" || view.kind === "sending") && (
              <div className="mt-8 grid w-full grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={view.kind === "sending"}
                  onClick={() => cameraInput.current?.click()}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#e5d4cc] bg-white text-sm font-semibold disabled:opacity-50"
                >
                  <RotateCcw size={17} aria-hidden="true" /> Retake
                </button>
                <button
                  type="button"
                  disabled={view.kind === "sending"}
                  onClick={() => void send()}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#b5343e] to-[#c94060] text-sm font-bold text-white shadow-md disabled:opacity-60"
                >
                  {view.kind === "sending" ? (
                    <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Send size={17} aria-hidden="true" />
                  )}
                  {view.kind === "sending" ? "Sending…" : "Send photo"}
                </button>
              </div>
            )}

            {view.kind === "sent" && (
              <div className="mt-6 flex w-full flex-col items-center gap-3 text-center" role="status">
                <p className="text-base font-semibold text-emerald-700">Photo sent. It is on the computer now.</p>
                <p className="text-sm text-[#7a5252]">You can close this page, or take another one to replace it.</p>
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#e5d4cc] bg-white px-5 text-sm font-semibold"
                >
                  <RotateCcw size={17} aria-hidden="true" /> Take another
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
