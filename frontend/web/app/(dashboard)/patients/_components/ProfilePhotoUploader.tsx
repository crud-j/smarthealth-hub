"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface PhotoUploadResponse { patient_id: string; photo_url: string; message: string; }

interface ProfilePhotoUploaderProps {
  patientId: string;
  currentPhotoUrl?: string | null;
  onPhotoSaved?: (photoUrl: string) => void;
}

type Tab = "upload" | "camera";
type CameraState = "idle" | "loading" | "active" | "error";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface ToastState { message: string; kind: "success" | "error"; }

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onDismiss, 4000); return () => window.clearTimeout(timer); }, [onDismiss]);
  return (
    <div role="status" aria-live="polite"
      className={`fixed bottom-6 right-6 z-[9999] max-w-xs rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${toast.kind === "success" ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}>
      {toast.message}
    </div>
  );
}

export default function ProfilePhotoUploader({ patientId, currentPhotoUrl, onPhotoSaved }: ProfilePhotoUploaderProps) {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(currentPhotoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  useEffect(() => { return () => { stopCamera(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab !== "camera") { stopCamera(); } }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(message: string, kind: "success" | "error") { setToast({ message, kind }); }

  function stopCamera() {
    if (streamRef.current) { streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setCameraState("idle"); setCameraError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE_BYTES) { showToast("File too large. Maximum allowed size is 5 MiB.", "error"); return; }
    setPendingFile(file);
    const objectUrl = URL.createObjectURL(file);
    setUploadPreview(objectUrl);
    setCapturedBlob(null); setCapturedPreview(null);
  }

  async function startCamera() {
    setCameraState("loading"); setCameraError(null); setCapturedBlob(null); setCapturedPreview(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraState("active");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Camera access denied or unavailable.";
      setCameraError(message); setCameraState("error");
    }
  }

  function capturePhoto() {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 640; const h = video.videoHeight || 480;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) { showToast("Failed to capture photo from camera.", "error"); return; }
      setCapturedBlob(blob);
      setCapturedPreview(URL.createObjectURL(blob));
      stopCamera();
    }, "image/jpeg", 0.9);
  }

  function retakePhoto() {
    if (capturedPreview) { URL.revokeObjectURL(capturedPreview); }
    setCapturedBlob(null); setCapturedPreview(null);
    void startCamera();
  }

  const uploadToApi = useCallback(async (fileOrBlob: File | Blob, filename: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", fileOrBlob, filename);
      const response = await fetch(`${API_BASE_URL}/patients/${patientId}/photo`, { method: "POST", credentials: "include", body: formData });
      if (!response.ok) {
        let errorMessage = `Upload failed (HTTP ${response.status})`;
        try { const body = (await response.json()) as { error?: { message?: string } }; if (body?.error?.message) { errorMessage = body.error.message; } } catch { /* ignore */ }
        throw new Error(errorMessage);
      }
      const result = (await response.json()) as PhotoUploadResponse;
      const fullUrl = `http://localhost:8000${result.photo_url}`;
      setSavedPhotoUrl(fullUrl);
      onPhotoSaved?.(result.photo_url);
      showToast("Profile photo saved successfully.", "success");
      setPendingFile(null); setUploadPreview(null); setCapturedBlob(null); setCapturedPreview(null);
      if (fileInputRef.current) { fileInputRef.current.value = ""; }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Upload failed. Please try again.", "error");
    } finally { setUploading(false); }
  }, [patientId, onPhotoSaved]);

  function handleUploadSubmit() { if (!pendingFile) return; void uploadToApi(pendingFile, pendingFile.name); }
  function handleCaptureSubmit() { if (!capturedBlob) return; void uploadToApi(capturedBlob, `capture_${patientId}.jpg`); }

  const tabBtnCls = (active: boolean) =>
    `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${active ? "border-[#b5343e] text-[#b5343e]" : "border-transparent text-[#9b6e6e] hover:text-[#3d2222]"}`;

  const primaryBtnCls = `rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e] ${uploading ? "cursor-not-allowed opacity-60" : ""}`;
  const secondaryBtnCls = "rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";

  return (
    <div
      className="mb-4 overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
      style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
    >
      {/* Panel header */}
      <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
        <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
        <h2 className="text-sm font-bold text-[#1a0808]">Profile Photo</h2>
      </div>

      <div className="p-5">
        {/* Current photo */}
        {savedPhotoUrl && (
          <div className="mb-4 flex items-center gap-4">
            <img src={savedPhotoUrl} alt="Current patient photo" className="h-20 w-20 rounded-xl border border-[#e5d4cc] bg-[#f0e4dd] object-cover" />
            <div>
              <p className="text-xs font-semibold text-[#7a5252]">Current photo on file</p>
              <p className="mt-0.5 text-xs text-[#c08080]">This photo will appear on the printed health card.</p>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="mb-4 flex border-b border-[#e5d4cc]">
          <button type="button" onClick={() => setActiveTab("upload")} className={tabBtnCls(activeTab === "upload")}>Upload Photo</button>
          <button type="button" onClick={() => setActiveTab("camera")} className={tabBtnCls(activeTab === "camera")}>Take Photo</button>
        </div>

        {/* Upload tab */}
        {activeTab === "upload" && (
          <div>
            <p className="mb-3 text-sm text-[#7a5252]">
              Select a JPEG, PNG, or WebP image (max 5 MiB). The image will be converted to JPEG and used on the patient's health card.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileChange}
              className="mb-4 block text-sm text-[#3d2222]"
              aria-label="Select patient photo file"
            />
            {uploadPreview && (
              <div className="mb-4">
                <p className="mb-1 text-xs font-semibold text-[#7a5252]">Preview</p>
                <img src={uploadPreview} alt="Selected photo preview" className="h-32 w-32 rounded-xl border border-[#e5d4cc] bg-[#f0e4dd] object-cover" />
              </div>
            )}
            <button type="button" disabled={!pendingFile || uploading} onClick={handleUploadSubmit}
              className={`${primaryBtnCls} ${(!pendingFile || uploading) ? "bg-[#d4a0a0]" : ""}`}
              style={{ background: !pendingFile || uploading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}>
              {uploading ? "Uploading..." : "Save Photo"}
            </button>
          </div>
        )}

        {/* Camera tab */}
        {activeTab === "camera" && (
          <div>
            <canvas ref={canvasRef} className="hidden" />
            {cameraState === "idle" && !capturedPreview && (
              <div>
                <p className="mb-3 text-sm text-[#7a5252]">Click "Start Camera" to open your webcam and take a photo. Your browser will ask for camera permission.</p>
                <button type="button" onClick={() => void startCamera()}
                  className={primaryBtnCls}
                  style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
                  Start Camera
                </button>
              </div>
            )}
            {cameraState === "loading" && <p className="text-sm text-[#7a5252]">Opening camera...</p>}
            {cameraState === "error" && (
              <div className="mb-3 rounded-xl border border-[#fcc] bg-[#fef2f2] p-4 text-sm font-medium text-[#b91c1c]">
                <strong>Camera unavailable:</strong> {cameraError}
                <div className="mt-3">
                  <button type="button" onClick={() => void startCamera()} className={secondaryBtnCls}>Try Again</button>
                </div>
              </div>
            )}
            {cameraState === "active" && (
              <div>
                <video ref={videoRef} autoPlay playsInline muted
                  className="mb-3 block w-full max-w-[480px] rounded-xl border border-[#e5d4cc] bg-[#1a0808]"
                  aria-label="Live camera preview" />
                <div className="flex gap-3">
                  <button type="button" onClick={capturePhoto}
                    className={primaryBtnCls}
                    style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
                    Capture
                  </button>
                  <button type="button" onClick={stopCamera} className={secondaryBtnCls}>Cancel</button>
                </div>
              </div>
            )}
            {capturedPreview && cameraState === "idle" && (
              <div>
                <p className="mb-2 text-xs font-semibold text-[#7a5252]">Captured photo</p>
                <img src={capturedPreview} alt="Captured photo preview" className="mb-4 block h-48 w-48 rounded-xl border border-[#e5d4cc] bg-[#f0e4dd] object-cover" />
                <div className="flex gap-3">
                  <button type="button" disabled={uploading} onClick={handleCaptureSubmit}
                    className={`${primaryBtnCls} ${uploading ? "bg-[#d4a0a0]" : ""}`}
                    style={{ background: uploading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}>
                    {uploading ? "Uploading..." : "Use This Photo"}
                  </button>
                  <button type="button" disabled={uploading} onClick={retakePhoto} className={secondaryBtnCls}>Retake</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
