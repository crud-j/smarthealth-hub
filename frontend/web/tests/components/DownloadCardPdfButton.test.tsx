import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DownloadCardPdfButton from "@/components/cards/DownloadCardPdfButton";
import { downloadHealthCardPdf } from "@/lib/health-card-pdf";
import { toast } from "@/lib/toast";

// Health Cards list: after "Generate Card" the row offers "Download PDF".
// Once the download has been handed to the browser the row goes back to
// "View / Print" (onDownloaded); on failure it stays so staff can retry.

vi.mock("@/lib/health-card-pdf", () => ({ downloadHealthCardPdf: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const downloadMock = vi.mocked(downloadHealthCardPdf);

describe("DownloadCardPdfButton", () => {
  beforeEach(() => {
    downloadMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("downloads the patient's card, then calls onDownloaded", async () => {
    downloadMock.mockResolvedValue(undefined);
    const onDownloaded = vi.fn();
    render(<DownloadCardPdfButton patientId="p-1" onDownloaded={onDownloaded} />);

    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));

    await waitFor(() => expect(onDownloaded).toHaveBeenCalledWith("p-1"));
    expect(downloadMock).toHaveBeenCalledWith("p-1", "health_card_p-1.pdf");
  });

  it("shows Downloading... and ignores more clicks while the PDF renders", async () => {
    let finish: () => void = () => {};
    downloadMock.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const onDownloaded = vi.fn();
    render(<DownloadCardPdfButton patientId="p-1" onDownloaded={onDownloaded} />);

    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    const busy = await screen.findByRole("button", { name: /Downloading/ });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(onDownloaded).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(onDownloaded).toHaveBeenCalledTimes(1));
  });

  it("on failure shows the error, does not call onDownloaded, and can be retried", async () => {
    downloadMock.mockRejectedValueOnce(new Error("PDF download failed (HTTP 500)."));
    const onDownloaded = vi.fn();
    render(<DownloadCardPdfButton patientId="p-1" onDownloaded={onDownloaded} />);

    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("PDF download failed (HTTP 500)."));
    expect(onDownloaded).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Download PDF/ })).toBeEnabled();
  });
});
