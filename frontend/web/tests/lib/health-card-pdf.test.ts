import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadHealthCardPdf } from "@/lib/health-card-pdf";

/**
 * Card PDFs used to be linked as public /media/health_cards/<card_id>.pdf
 * files (no login). The download must go through the authenticated
 * /api/v1/health-cards/{patientId}/pdf endpoint with the session cookie.
 */
describe("downloadHealthCardPdf", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("downloads from the authenticated endpoint with the session cookie", async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(["%PDF"]), { status: 200 }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadHealthCardPdf("p-123", "health_card_SH-2026-000001.pdf");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/health-cards/p-123/pdf", {
      credentials: "include",
    });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/media/");
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card");
    click.mockRestore();
  });

  it("throws the backend's error message when the download fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "No active health card found." } }), {
        status: 404,
      }),
    );

    await expect(downloadHealthCardPdf("p-123", "card.pdf")).rejects.toThrow(
      "No active health card found.",
    );
  });

  it("throws a generic message with the HTTP status when the body has none", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));

    await expect(downloadHealthCardPdf("p-123", "card.pdf")).rejects.toThrow("HTTP 500");
  });
});
