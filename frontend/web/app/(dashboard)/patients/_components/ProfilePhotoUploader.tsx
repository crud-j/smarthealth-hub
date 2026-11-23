"use client";

/**
 * Patient photo panel: the photo on file, and three ways to set it.
 *
 *   Phone   (first) a QR code for a 15-minute link; staff scan it with any
 *           phone, take the photo there, and it shows up here by itself
 *           (this panel polls the link). Most BHC PCs have no webcam.
 *   Upload  a JPEG / PNG / WebP file from this computer.
 *   Webcam  this computer's camera, when it has one.
 *
 * Photo URLs from the API are root-relative ("/api/v1/patients/{id}/photo?v=")
 * and are used as they are: same origin, so the login cookie goes along.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  CircleCheck,
  Hourglass,
  ImagePlus,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Smartphone,
  TriangleAlert,
  Upload,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IconBadge } from "@/components/dashboard/shared";
import { toast } from "@/lib/toast";
import {
  createPhotoLink,
  getPhotoLinkStatus,
  manilaClock,
  shrinkPhoto,
  uploadPatientPhoto,
  type PhotoLink,
} from "@/lib/photo-capture";

interface ProfilePhotoUploaderProps {
  patientId: string;
  /** Root-relative photo URL on file, if any. */
  currentPhotoUrl?: string | null;
  onPhotoSaved?: (photoUrl: string) => void;
  /** Make the phone QR code as soon as the panel opens (registration). */
  autoStartPhone?: boolean;
}

type Tab = "phone" | "upload" | "webcam";
type CameraState = "idle" | "loading" | "active" | "error";
type LinkState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ready"; link: PhotoLink; qr: string }
  | { kind: "expired" }
  | { kind: "error"; message: string };

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const POLL_MS = 3000;

const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "phone", label: "Phone", icon: Smartphone },
  { id: "upload", label: "Upload file", icon: Upload },
  { id: "webcam", label: "Webcam", icon: Camera },
];

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#b5343e] to-[#c94060] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5343e]";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] transition hover:bg-[#fdf5f0] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5343e]";

async function qrDataUrl(url: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: "#2a1414", light: "#ffffff" } });
}

/** Crop marks of an ID photo, drawn on the four corners of the parent. */
function CropMarks({ tone = "border-[#b5343e]" }: { tone?: string }) {
  const corner = `pointer-events-none absolute h-4 w-4 ${tone}`;
  return (
    <>
      <span aria-hidden="true" className={`${corner} -left-1.5 -top-1.5 border-l-2 border-t-2 rounded-tl-md`} />
      <span aria-hidden="true" className={`${corner} -right-1.5 -top-1.5 border-r-2 border-t-2 rounded-tr-md`} />
      <span aria-hidden="true" className={`${corner} -bottom-1.5 -left-1.5 border-b-2 border-l-2 rounded-bl-md`} />
      <span aria-hidden="true" className={`${corner} -bottom-1.5 -right-1.5 border-b-2 border-r-2 rounded-br-md`} />
    </>
  );
}

export default function ProfilePhotoUploader({
  patientId,
  currentPhotoUrl,
  onPhotoSaved,
  autoStartPhone = false,
}: ProfilePhotoUploaderProps) {
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<Tab>("phone");
  const [photoUrl, setPhotoUrl] = useState<string | null>(currentPhotoUrl ?? null);
  const [justArrived, setJustArrived] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (currentPhotoUrl) setPhotoUrl(currentPhotoUrl);
  }, [currentPhotoUrl]);

  const photoSaved = useCallback(
    (url: string, message: string) => {
      setPhotoUrl(url);
      setJustArrived(true);
      setTimeout(() => setJustArrived(false), 2400);
      onPhotoSaved?.(url);
      toast.success(message);
    },
    [onPhotoSaved],
  );

  // ── Phone link ────────────────────────────────────────────────────────────
  const [linkState, setLinkState] = useState<LinkState>({ kind: "none" });
  const lastUpload = useRef<string | null>(null);
  const started = useRef(false);

  const makeLink = useCallback(async () => {
    setLinkState({ kind: "loading" });
    try {
      const link = await createPhotoLink(patientId);
      lastUpload.current = null;
      setLinkState({ kind: "ready", link, qr: await qrDataUrl(link.capture_url) });
    } catch (err) {
      setLinkState({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not make a QR code. Please try again.",
      });
    }
  }, [patientId]);

  useEffect(() => {
    if (autoStartPhone && !started.current) {
      started.current = true; // React dev runs effects twice; one link is enough
      void makeLink();
    }
  }, [autoStartPhone, makeLink]);

  const readyLink = linkState.kind === "ready" ? linkState.link : null;
  useEffect(() => {
    if (!readyLink) return;
    let stopped = false;
    const tick = async () => {
      if (new Date(readyLink.expires_at).getTime() <= Date.now()) {
        setLinkState({ kind: "expired" });
        return;
      }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const status = await getPhotoLinkStatus(patientId, readyLink.token);
        if (stopped) return;
        if (status.uploaded_at && status.photo_url && status.uploaded_at !== lastUpload.current) {
          lastUpload.current = status.uploaded_at;
          photoSaved(status.photo_url, "Photo received from the phone.");
        }
      } catch (err) {
        if (!stopped && (err as { status?: number }).status === 404) setLinkState({ kind: "expired" });
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [readyLink, patientId, photoSaved]);

  // ── Upload a file ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.split(",").includes(file.type)) {
      toast.error("Choose a JPEG, PNG or WebP photo.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES * 3) {
      toast.error("That file is too large. Choose a photo under 15 MB.");
      return;
    }
    if (filePreview) URL.revokeObjectURL(filePreview);
    setPendingFile(file);
    setFilePreview(URL.createObjectURL(file));
  }

  function clearFile() {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setPendingFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function upload(blob: Blob, filename: string, after: () => void) {
    setUploading(true);
    try {
      const small = await shrinkPhoto(blob);
      if (small.size > MAX_SIZE_BYTES) throw new Error("The photo is still over 5 MB. Try a smaller one.");
      const result = await uploadPatientPhoto(patientId, small, filename);
      photoSaved(result.photo_url, "Photo saved.");
      after();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // ── Webcam ────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState((s) => (s === "error" ? s : "idle"));
  }, []);

  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => {
    if (activeTab !== "webcam") stopCamera();
  }, [activeTab, stopCamera]);

  // Attach the stream once the <video> is on screen (it is only rendered
  // while the camera is on).
  useEffect(() => {
    const video = videoRef.current;
    if (cameraState === "active" && video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    }
  }, [cameraState]);

  async function startCamera() {
    setCameraError(null);
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser cannot use a camera here. Use the Phone tab instead.");
      setCameraState("error");
      return;
    }
    setCameraState("loading");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" },
      });
      setCameraState("active");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setCameraError(
        name === "NotFoundError" || name === "OverconstrainedError"
          ? "No camera was found on this computer. Use the Phone tab instead."
          : name === "NotAllowedError"
            ? "Camera permission was blocked. Allow it in the browser's address bar, or use the Phone tab."
            : "The camera could not start. Use the Phone tab instead.",
      );
      setCameraState("error");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Could not take the photo. Please try again.");
          return;
        }
        setShot({ blob, url: URL.createObjectURL(blob) });
        stopCamera();
      },
      "image/jpeg",
      0.9,
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section
      aria-labelledby={`${tabsId}-title`}
      className="mb-4 overflow-hidden rounded-2xl border border-[#eadbd3] bg-white shadow-[0_1px_2px_rgba(60,20,20,0.04),0_8px_24px_-12px_rgba(120,40,40,0.12)]"
    >
      <header className="flex items-center gap-3 border-b border-[#f0e4dd] bg-gradient-to-br from-[#fdf0eb] to-white px-5 py-4">
        <IconBadge icon={Camera} tone="rose" size="sm" />
        <div>
          <h2 id={`${tabsId}-title`} className="text-sm font-bold text-[#1a0808]">
            Patient photo
          </h2>
          <p className="text-xs text-[#8a6a6a]">Shown on the profile and printed on the health card.</p>
        </div>
      </header>

      <div className="grid gap-6 p-5 md:grid-cols-[176px_1fr]">
        {/* The photo on file, in an ID-photo frame */}
        <div className="flex flex-col items-center gap-3 md:items-start">
          <div
            className={`relative h-[208px] w-[176px] rounded-xl bg-[#f7ece7] transition-shadow duration-500 ${
              justArrived ? "shadow-[0_0_0_4px_rgba(20,160,120,0.35)]" : ""
            }`}
          >
            <CropMarks tone={photoUrl ? "border-[#b5343e]" : "border-[#d9b9ad]"} />
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */
              <img
                src={photoUrl}
                alt="Patient photo on file"
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e0c8be] text-[#b08a80]">
                <UserRound size={44} strokeWidth={1.4} aria-hidden="true" />
                <span className="text-xs font-semibold">No photo yet</span>
              </div>
            )}
          </div>
          <p className="text-center text-xs text-[#8a6a6a] md:text-left" aria-live="polite">
            {justArrived ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <CircleCheck size={14} aria-hidden="true" /> Photo updated
              </span>
            ) : photoUrl ? (
              "Photo on file. A new one replaces it."
            ) : (
              "Head and shoulders, plain background."
            )}
          </p>
        </div>

        {/* Ways to set it */}
        <div className="min-w-0">
          <div role="tablist" aria-label="How to add the photo" className="mb-4 inline-flex rounded-xl bg-[#f7ece7] p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`${tabsId}-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e] ${
                  activeTab === id ? "bg-white text-[#b5343e] shadow-sm" : "text-[#7a5252] hover:text-[#3d2222]"
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {activeTab === "phone" && (
            <div role="tabpanel" id={`${tabsId}-panel-phone`} aria-labelledby={`${tabsId}-tab-phone`}>
              <PhonePanel state={linkState} onMake={() => void makeLink()} />
            </div>
          )}

          {activeTab === "upload" && (
            <div role="tabpanel" id={`${tabsId}-panel-upload`} aria-labelledby={`${tabsId}-tab-upload`}>
              {filePreview ? (
                <div className="flex flex-wrap items-end gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img src={filePreview} alt="Chosen photo preview" className="h-40 w-32 rounded-xl border border-[#e5d4cc] object-cover" />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploading || !pendingFile}
                      onClick={() => pendingFile && void upload(pendingFile, pendingFile.name, clearFile)}
                      className={primaryBtn}
                    >
                      {uploading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
                      {uploading ? "Saving…" : "Save photo"}
                    </button>
                    <button type="button" disabled={uploading} onClick={clearFile} className={secondaryBtn}>
                      Choose another
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pickFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition focus-within:outline focus-within:outline-2 focus-within:outline-[#b5343e] ${
                    dragging ? "border-[#b5343e] bg-[#fdf0eb]" : "border-[#e5d4cc] bg-[#fffaf7] hover:border-[#d9a9a0]"
                  }`}
                >
                  <ImagePlus size={28} className="text-[#b5343e]" aria-hidden="true" />
                  <span className="text-sm font-semibold text-[#3d2222]">Choose a photo or drop it here</span>
                  <span className="text-xs text-[#8a6a6a]">JPEG, PNG or WebP. Large photos are made smaller before upload.</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    onChange={(e) => pickFile(e.target.files?.[0])}
                    className="sr-only"
                    aria-label="Choose patient photo file"
                  />
                </label>
              )}
            </div>
          )}

          {activeTab === "webcam" && (
            <div role="tabpanel" id={`${tabsId}-panel-webcam`} aria-labelledby={`${tabsId}-tab-webcam`}>
              {shot ? (
                <div className="flex flex-wrap items-end gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img src={shot.url} alt="Webcam photo preview" className="h-40 w-52 rounded-xl border border-[#e5d4cc] object-cover" />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() =>
                        void upload(shot.blob, `webcam_${patientId}.jpg`, () => {
                          URL.revokeObjectURL(shot.url);
                          setShot(null);
                        })
                      }
                      className={primaryBtn}
                    >
                      {uploading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
                      {uploading ? "Saving…" : "Use this photo"}
                    </button>
                    <button type="button" disabled={uploading} onClick={() => void startCamera()} className={secondaryBtn}>
                      <RefreshCw size={15} aria-hidden="true" /> Retake
                    </button>
                  </div>
                </div>
              ) : cameraState === "active" ? (
                <div>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Live camera preview"
                    className="mb-3 block w-full max-w-[420px] rounded-xl border border-[#e5d4cc] bg-[#1a0808]"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={capture} className={primaryBtn}>
                      <Camera size={16} aria-hidden="true" /> Take photo
                    </button>
                    <button type="button" onClick={stopCamera} className={secondaryBtn}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {cameraState === "error" && cameraError && (
                    <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {cameraError}
                    </p>
                  )}
                  <p className="text-sm text-[#7a5252]">Uses this computer&apos;s camera. The browser asks for permission first.</p>
                  <button type="button" disabled={cameraState === "loading"} onClick={() => void startCamera()} className={primaryBtn}>
                    {cameraState === "loading" ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                    {cameraState === "loading" ? "Opening camera…" : "Start webcam"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PhonePanel({ state, onMake }: { state: LinkState; onMake: () => void }) {
  if (state.kind === "none") {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#f0e4dd] bg-[#fffaf7] p-4">
        <IconBadge icon={QrCode} tone="rose" />
        <p className="min-w-[200px] flex-1 text-sm text-[#5a3a3a]">
          Take the photo with a phone: show a QR code, scan it, and the photo appears here.
        </p>
        <button type="button" onClick={onMake} className={primaryBtn}>
          <QrCode size={16} aria-hidden="true" /> Show QR code
        </button>
      </div>
    );
  }
  if (state.kind === "loading") {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-[#7a5252]" role="status">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Making a QR code…
      </p>
    );
  }
  if (state.kind === "error" || state.kind === "expired") {
    const expired = state.kind === "expired";
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="alert">
        <IconBadge icon={expired ? Hourglass : TriangleAlert} tone="amber" />
        <p className="min-w-[200px] flex-1 text-sm text-amber-900">
          {expired ? "This QR code has expired (15 minutes). Make a new one to take another photo." : state.message}
        </p>
        <button type="button" onClick={onMake} className={secondaryBtn}>
          <RefreshCw size={15} aria-hidden="true" /> {expired ? "New QR code" : "Try again"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="relative rounded-2xl bg-white p-3 ring-1 ring-[#eadbd3]">
        <CropMarks />
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src={state.qr} alt="QR code: scan with a phone to take the patient's photo" className="h-44 w-44" />
      </div>
      <div className="min-w-[220px] flex-1">
        <ol className="space-y-2.5 text-sm text-[#3d2222]">
          {[
            "Open the camera on any phone and scan this code.",
            "Take the patient's photo and tap Send.",
            "It appears here by itself. Retake on the phone if needed.",
          ].map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fdf0eb] text-xs font-bold text-[#b5343e]">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-center gap-2 text-sm font-medium text-[#5a3a3a]" role="status">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Waiting for the phone · works until {manilaClock(state.link.expires_at)}
        </p>
        <button type="button" onClick={onMake} className={`${secondaryBtn} mt-3`}>
          <RefreshCw size={15} aria-hidden="true" /> New QR code
        </button>
      </div>
    </div>
  );
}
