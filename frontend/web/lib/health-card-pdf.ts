/**
 * Download a patient's health card PDF through the authenticated endpoint.
 *
 * Never link to /media/... files: those were served without login. The
 * /pdf endpoint checks the session cookie and renders the card on demand,
 * so it always shows current data (e.g. allergies edited after "Generate").
 *
 * Throws an Error with the backend's message (or the HTTP status) on failure.
 */
export async function downloadHealthCardPdf(patientId: string, filename: string): Promise<void> {
  const response = await fetch(`/api/v1/health-cards/${patientId}/pdf`, {
    credentials: "include",
  });
  if (!response.ok) {
    let message = `PDF download failed (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* body is not JSON: keep the generic message */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
