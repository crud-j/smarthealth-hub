"use client";
/**
 * Hook for calling the backend OCR extraction endpoint.
 *
 * POST /api/v1/patients/ocr-extract — multipart/form-data with a single "image" field.
 *
 * Uses raw fetch (not apiFetch) because multipart/form-data requires that the
 * browser set the Content-Type boundary automatically, which apiFetch prevents
 * by hardcoding Content-Type: application/json.
 *
 * Exports:
 *   useOcrExtract() → { extract, loading, error, result, clearResult }
 */

import { useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// Response types mirroring OcrExtractResponse / OcrFieldValue Pydantic schemas
// ---------------------------------------------------------------------------

export interface OcrFieldValue {
  value: string | null;
  confidence: number; // 0.0–1.0
}

export interface OcrExtractResponse {
  first_name: OcrFieldValue;
  middle_name: OcrFieldValue;
  last_name: OcrFieldValue;
  birth_date: OcrFieldValue;   // ISO 8601 YYYY-MM-DD or raw string
  sex: OcrFieldValue;           // "male" | "female" | null
  address_line: OcrFieldValue;
  philhealth_no: OcrFieldValue;
  blood_type: OcrFieldValue;
  raw_text: string;
  provider: string;
}

// ---------------------------------------------------------------------------
// Client-side image resize helper
// ---------------------------------------------------------------------------

/**
 * Resize an image File to max 2400px on the longest edge at 0.92 JPEG quality.
 * Returns a new Blob. If the image is already within bounds, returns it unchanged.
 *
 * The limit is set to 2400px (not 1600px) to preserve enough resolution for
 * Tesseract OCR accuracy — the backend upscales to 1800px minimum, so sending
 * a 1600px image and then upscaling introduces LANCZOS blur that hurts OCR.
 * Keeping the client cap at 2400px means typical ID card photos (1800–2000px)
 * are uploaded at their native resolution.
 *
 * Very large photos (4K+) are shrunk to 2400px to stay under the 10 MB backend
 * limit while remaining well above the OCR quality threshold.
 */
async function resizeImageForUpload(file: File): Promise<Blob> {
  const MAX_DIM = 2400;
  const JPEG_QUALITY = 0.92;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;

      if (w <= MAX_DIM && h <= MAX_DIM) {
        // Already small enough — return original
        resolve(file);
        return;
      }

      const scale = MAX_DIM / Math.max(w, h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file); // canvas unsupported — send original
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => resolve(file); // load failed — send original
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOcrExtract() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrExtractResponse | null>(null);

  const extract = useCallback(async (file: File): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Resize client-side to reduce upload size on low-bandwidth connections
      const resized = await resizeImageForUpload(file);

      const formData = new FormData();
      formData.append("image", resized, file.name);

      const apiBase =
        typeof window !== "undefined"
          ? "/api/v1"
          : `${process.env.SERVER_SIDE_API_URL ?? "http://localhost:8000"}/api/v1`;

      const response = await fetch(`${apiBase}/patients/ocr-extract`, {
        method: "POST",
        credentials: "include",
        // DO NOT set Content-Type — let the browser set it with boundary
        body: formData,
      });

      if (!response.ok) {
        let message = `OCR failed (HTTP ${response.status})`;
        try {
          const body = (await response.json()) as { detail?: string; error?: { message?: string } };
          message = body.detail ?? body.error?.message ?? message;
        } catch {
          // non-JSON error body
        }
        setError(message);
        return;
      }

      const data = (await response.json()) as OcrExtractResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR extraction failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { extract, loading, error, result, clearResult };
}
