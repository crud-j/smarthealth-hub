/**
 * Patient photo: upload, and the phone QR link.
 *
 * Staff screen (signed in):
 *   createPhotoLink(patientId)          POST /patients/{id}/photo-capture
 *   getPhotoLinkStatus(patientId, tok)  GET  /patients/{id}/photo-capture/{tok}  (polled)
 *   uploadPatientPhoto(patientId, file) POST /patients/{id}/photo
 * Phone page (not signed in, the link token is the permission):
 *   getPhonePage(token)                 GET  /photo-capture/{token}
 *   sendPhonePhoto(token, blob)         POST /photo-capture/{token}
 *
 * All calls go to the same-origin /api/v1 (Next.js rewrites it to the API),
 * so the login cookie goes along and photo URLs from the API (root-relative,
 * "/api/v1/patients/{id}/photo?v=...") are used as they are in <img src>.
 */

import { apiFetch, ApiError } from "@/lib/api-client";

export interface PhotoLink {
  token: string;
  capture_url: string;
  expires_at: string;
}

export interface PhotoLinkStatus {
  expires_at: string;
  uploaded_at: string | null;
  photo_url: string | null;
}

export interface PhonePage {
  patient_initials: string;
  expires_at: string;
  uploaded_at: string | null;
}

const API = "/api/v1";

export function createPhotoLink(patientId: string): Promise<PhotoLink> {
  return apiFetch<PhotoLink>(`/patients/${patientId}/photo-capture`, { method: "POST" });
}

export function getPhotoLinkStatus(patientId: string, token: string): Promise<PhotoLinkStatus> {
  return apiFetch<PhotoLinkStatus>(`/patients/${patientId}/photo-capture/${encodeURIComponent(token)}`);
}

/** Message from the API's error envelope ({error: {message}}) or FastAPI's {detail}. */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; detail?: unknown };
    if (body?.error?.message) return body.error.message;
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    /* not JSON */
  }
  return fallback;
}

async function postPhoto<T>(path: string, photo: Blob, filename: string): Promise<T> {
  const form = new FormData();
  form.append("photo", photo, filename);
  // Raw fetch: the browser must set the multipart boundary itself.
  const response = await fetch(`${API}${path}`, { method: "POST", credentials: "include", body: form });
  if (!response.ok) {
    throw new ApiError(
      await errorMessage(response, `Upload failed (HTTP ${response.status}).`),
      response.status,
      "upload_failed",
    );
  }
  return (await response.json()) as T;
}

export function uploadPatientPhoto(patientId: string, photo: Blob, filename = "photo.jpg") {
  return postPhoto<{ photo_url: string }>(`/patients/${patientId}/photo`, photo, filename);
}

export async function getPhonePage(token: string): Promise<PhonePage> {
  const response = await fetch(`${API}/photo-capture/${encodeURIComponent(token)}`);
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, "This link does not work."), response.status, "link");
  }
  return (await response.json()) as PhonePage;
}

export function sendPhonePhoto(token: string, photo: Blob) {
  return postPhoto<{ message: string; uploaded_at: string }>(
    `/photo-capture/${encodeURIComponent(token)}`,
    photo,
    "phone.jpg",
  );
}

/** Longest side of an uploaded photo; the card prints it at a few cm. */
export const PHOTO_MAX_SIDE = 1280;

/**
 * Shrink a camera photo to at most PHOTO_MAX_SIDE px as JPEG before upload.
 * Phone photos are often 3-8 MB (the server takes 5 MB). Falls back to the
 * original file where the browser cannot draw it (old browsers, tests).
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** "3:45 PM" on the Manila clock. */
export function manilaClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}
