"use client";
/**
 * ProfilePhotoUploader — patient profile photo component.
 *
 * Two input modes:
 *  1. Upload Photo  — standard <input type="file"> for picking an image from disk.
 *  2. Take Photo    — opens the device camera via getUserMedia, shows a live
 *                     video preview, and lets the user snap a still frame.
 *
 * After upload or capture:
 *  - Calls POST /patients/{patientId}/photo (multipart/form-data).
 *  - Shows a preview of the saved photo using the returned URL.
 *  - Emits onPhotoSaved(url) so the parent page can refresh its UI.
 *  - Shows success/error toasts via the lightweight built-in toast state.
 *
 * Security note: the camera stream is released (all tracks stopped) as soon as
 * the user navigates away from the "Take Photo" tab or the component unmounts.
 *
 * TypeScript strict-mode compatible — no `any` usage.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhotoUploadResponse {
  patient_id: string;
  photo_url: string;
  message: string;
}

interface ProfilePhotoUploaderProps {
  /** UUID of the patient whose photo will be uploaded. */
  patientId: string;
  /** Current photo URL (if any) — used to show the existing photo on mount. */
  currentPhotoUrl?: string | null;
  /**
   * Called after a photo is successfully saved.
   * Receives the root-relative URL path returned by the API, e.g.
   * "/media/patient_photos/<uuid>.jpg".
   */
  onPhotoSaved?: (photoUrl: string) => void;
}

type Tab = "upload" | "camera";
type CameraState = "idle" | "loading" | "active" | "error";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB

// ---------------------------------------------------------------------------
// Inline toast (avoids external dependency)
// ---------------------------------------------------------------------------

interface ToastState {
  message: string;
  kind: "success" | "error";
}

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        padding: "0.75rem 1.25rem",
        borderRadius: "0.5rem",
        fontSize: "0.875rem",
        fontWeight: 500,
        color: "white",
        background: toast.kind === "success" ? "#16a34a" : "#dc2626",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        maxWidth: 320,
      }}
    >
      {toast.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProfilePhotoUploader({
  patientId,
  currentPhotoUrl,
  onPhotoSaved,
}: ProfilePhotoUploaderProps) {
  // ── Shared state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(
    currentPhotoUrl ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // ── Upload-mode state ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // ── Camera-mode state ─────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  // ── Cleanup camera on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopCamera();
    };
    // stopCamera is stable (no deps) — safe to reference without listing it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop camera when switching away from the camera tab
  useEffect(() => {
    if (activeTab !== "camera") {
      stopCamera();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showToast(message: string, kind: "success" | "error") {
    setToast({ message, kind });
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState("idle");
    setCameraError(null);
  }

  // ── Upload-mode handlers ──────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      showToast("File too large. Maximum allowed size is 5 MiB.", "error");
      return;
    }

    setPendingFile(file);
    const objectUrl = URL.createObjectURL(file);
    setUploadPreview(objectUrl);
    setCapturedBlob(null);
    setCapturedPreview(null);
  }

  // ── Camera-mode handlers ──────────────────────────────────────────────────

  async function startCamera() {
    setCameraState("loading");
    setCameraError(null);
    setCapturedBlob(null);
    setCapturedPreview(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user", // front camera preferred; falls back to any
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("active");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Camera access denied or unavailable.";
      setCameraError(message);
      setCameraState("error");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Size canvas to match actual video dimensions
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    // Convert canvas to JPEG blob
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast("Failed to capture photo from camera.", "error");
          return;
        }
        setCapturedBlob(blob);
        const previewUrl = URL.createObjectURL(blob);
        setCapturedPreview(previewUrl);
        // Stop video stream after capture to release camera
        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }

  function retakePhoto() {
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedBlob(null);
    setCapturedPreview(null);
    void startCamera();
  }

  // ── Upload to API ─────────────────────────────────────────────────────────

  const uploadToApi = useCallback(
    async (fileOrBlob: File | Blob, filename: string) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("photo", fileOrBlob, filename);

        // Use raw fetch (not apiFetch) because multipart/form-data requires
        // the browser to set the Content-Type boundary automatically.
        const response = await fetch(
          `${API_BASE_URL}/patients/${patientId}/photo`,
          {
            method: "POST",
            credentials: "include", // send auth cookie
            body: formData,
            // Do NOT set Content-Type header — browser sets it with boundary
          }
        );

        if (!response.ok) {
          let errorMessage = `Upload failed (HTTP ${response.status})`;
          try {
            const body = (await response.json()) as {
              error?: { message?: string };
            };
            if (body?.error?.message) {
              errorMessage = body.error.message;
            }
          } catch {
            // Response body not JSON — use generic message
          }
          throw new Error(errorMessage);
        }

        const result = (await response.json()) as PhotoUploadResponse;
        const fullUrl = `http://localhost:8000${result.photo_url}`;
        setSavedPhotoUrl(fullUrl);
        onPhotoSaved?.(result.photo_url);
        showToast("Profile photo saved successfully.", "success");

        // Reset pending state
        setPendingFile(null);
        setUploadPreview(null);
        setCapturedBlob(null);
        setCapturedPreview(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Upload failed. Please try again.";
        showToast(message, "error");
      } finally {
        setUploading(false);
      }
    },
    [patientId, onPhotoSaved]
  );

  function handleUploadSubmit() {
    if (!pendingFile) return;
    void uploadToApi(pendingFile, pendingFile.name);
  }

  function handleCaptureSubmit() {
    if (!capturedBlob) return;
    void uploadToApi(capturedBlob, `capture_${patientId}.jpg`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const sectionStyle: React.CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "0.5rem",
    padding: "1.5rem",
    marginBottom: "1.25rem",
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: "1rem",
    paddingBottom: "0.5rem",
    borderBottom: "1px solid #f1f5f9",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const tabBarStyle: React.CSSProperties = {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1rem",
    borderBottom: "1px solid #e2e8f0",
  };

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      padding: "0.5rem 1rem",
      fontSize: "0.875rem",
      fontWeight: active ? 600 : 400,
      color: active ? "#0d7c6e" : "#64748b",
      background: "none",
      border: "none",
      borderBottom: active ? "2px solid #0d7c6e" : "2px solid transparent",
      cursor: "pointer",
      marginBottom: "-1px",
    };
  }

  const buttonStyle = (
    variant: "primary" | "secondary" | "danger" = "primary"
  ): React.CSSProperties => {
    const colors = {
      primary: { bg: "#0d7c6e", color: "white", border: "none" },
      secondary: { bg: "white", color: "#374151", border: "1px solid #d1d5db" },
      danger: { bg: "#dc2626", color: "white", border: "none" },
    }[variant];
    return {
      padding: "0.5rem 1rem",
      borderRadius: "0.375rem",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: uploading ? "not-allowed" : "pointer",
      opacity: uploading ? 0.6 : 1,
      background: colors.bg,
      color: colors.color,
      border: colors.border,
    };
  };

  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>Profile Photo</div>

      {/* Current saved photo preview */}
      {savedPhotoUrl && (
        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <img
            src={savedPhotoUrl}
            alt="Current patient photo"
            style={{
              width: 80,
              height: 80,
              objectFit: "cover",
              borderRadius: "0.375rem",
              border: "1px solid #e2e8f0",
            }}
          />
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500 }}>
              Current photo on file
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.125rem" }}>
              This photo will appear on the printed health card.
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={tabBarStyle}>
        <button
          style={tabStyle(activeTab === "upload")}
          onClick={() => setActiveTab("upload")}
          type="button"
        >
          Upload Photo
        </button>
        <button
          style={tabStyle(activeTab === "camera")}
          onClick={() => setActiveTab("camera")}
          type="button"
        >
          Take Photo
        </button>
      </div>

      {/* ── Upload tab ─────────────────────────────────────────────────── */}
      {activeTab === "upload" && (
        <div>
          <p style={{ fontSize: "0.8125rem", color: "#475569", marginBottom: "0.75rem" }}>
            Select a JPEG, PNG, or WebP image (max 5 MiB). The image will be
            converted to JPEG and used on the patient&apos;s health card.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            style={{ display: "block", marginBottom: "1rem", fontSize: "0.875rem" }}
            aria-label="Select patient photo file"
          />

          {/* Preview of selected file */}
          {uploadPreview && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>
                Preview
              </div>
              <img
                src={uploadPreview}
                alt="Selected photo preview"
                style={{
                  width: 120,
                  height: 120,
                  objectFit: "cover",
                  borderRadius: "0.375rem",
                  border: "1px solid #e2e8f0",
                }}
              />
            </div>
          )}

          <button
            type="button"
            style={buttonStyle("primary")}
            disabled={!pendingFile || uploading}
            onClick={handleUploadSubmit}
          >
            {uploading ? "Uploading..." : "Save Photo"}
          </button>
        </div>
      )}

      {/* ── Camera tab ─────────────────────────────────────────────────── */}
      {activeTab === "camera" && (
        <div>
          {/* Hidden canvas used to snapshot the video frame */}
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {cameraState === "idle" && !capturedPreview && (
            <div>
              <p style={{ fontSize: "0.8125rem", color: "#475569", marginBottom: "0.75rem" }}>
                Click &quot;Start Camera&quot; to open your webcam and take a photo.
                Your browser will ask for camera permission.
              </p>
              <button
                type="button"
                style={buttonStyle("primary")}
                onClick={() => void startCamera()}
              >
                Start Camera
              </button>
            </div>
          )}

          {cameraState === "loading" && (
            <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
              Opening camera...
            </p>
          )}

          {cameraState === "error" && (
            <div
              style={{
                padding: "0.75rem",
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: "0.375rem",
                color: "#dc2626",
                fontSize: "0.875rem",
                marginBottom: "0.75rem",
              }}
            >
              <strong>Camera unavailable:</strong> {cameraError}
              <div style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  style={buttonStyle("secondary")}
                  onClick={() => void startCamera()}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {cameraState === "active" && (
            <div>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  maxWidth: 480,
                  borderRadius: "0.375rem",
                  border: "1px solid #e2e8f0",
                  display: "block",
                  marginBottom: "0.75rem",
                  background: "#0f172a",
                }}
                aria-label="Live camera preview"
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  style={buttonStyle("primary")}
                  onClick={capturePhoto}
                >
                  Capture
                </button>
                <button
                  type="button"
                  style={buttonStyle("secondary")}
                  onClick={stopCamera}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Post-capture preview */}
          {capturedPreview && cameraState === "idle" && (
            <div>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>
                Captured photo
              </div>
              <img
                src={capturedPreview}
                alt="Captured photo preview"
                style={{
                  width: 200,
                  height: 200,
                  objectFit: "cover",
                  borderRadius: "0.375rem",
                  border: "1px solid #e2e8f0",
                  marginBottom: "0.75rem",
                  display: "block",
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  style={buttonStyle("primary")}
                  disabled={uploading}
                  onClick={handleCaptureSubmit}
                >
                  {uploading ? "Uploading..." : "Use This Photo"}
                </button>
                <button
                  type="button"
                  style={buttonStyle("secondary")}
                  disabled={uploading}
                  onClick={retakePhoto}
                >
                  Retake
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
