"use client";

import { useState } from "react";
import { downloadHealthCardPdf } from "@/lib/health-card-pdf";
import { toast } from "@/lib/toast";

interface DownloadCardPdfButtonProps {
  patientId: string;
  /** Called once the PDF has been handed to the browser (not on failure). */
  onDownloaded: (patientId: string) => void;
}

/**
 * "Download PDF" for a freshly generated card on the Health Cards list.
 *
 * The PDF is rendered on demand by the authenticated GET .../pdf endpoint,
 * which takes a moment, so the button shows "Downloading..." and ignores
 * repeat clicks.  On success the row goes back to "View / Print"
 * (onDownloaded); on failure it shows the error and stays for a retry.
 */
export default function DownloadCardPdfButton({ patientId, onDownloaded }: DownloadCardPdfButtonProps) {
  const [downloading, setDownloading] = useState(false);

  async function handleClick() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadHealthCardPdf(patientId, `health_card_${patientId}.pdf`);
      onDownloaded(patientId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to download PDF.");
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={downloading}
      aria-busy={downloading}
      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-all active:scale-[0.96] disabled:cursor-wait disabled:opacity-70"
    >
      {downloading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
      )}
      {downloading ? "Downloading..." : "Download PDF"}
    </button>
  );
}
