import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VerifyPage from "@/app/verify/page";

// Public card check (/verify?pid&v&sig): what anyone sees after scanning a
// health card QR with a phone camera. Same look as the rest of the system
// (rose theme, BHC logo, display font); only name + patient code, no PHI.

const PID = "3f1c2b9e-0000-4000-8000-000000000001";

async function renderPage(params: Record<string, string>, body?: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body }) as Response),
  );
  const ui = await VerifyPage({ searchParams: Promise.resolve(params) });
  return render(ui);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Public card verification page", () => {
  it("shows a verified active card in the system's theme", async () => {
    const { container } = await renderPage(
      { pid: PID, v: "1", sig: "abc" },
      { valid: true, full_name: "Ana Reyes", patient_code: "BHC-2026-000015", card_status: "active" },
    );

    expect(container.querySelector('[data-theme="rose"]')).not.toBeNull();
    expect(screen.getByRole("img", { name: "Barangay Health Center logo" })).toHaveAttribute("src", "/BHCFINALLOGO.png");
    expect(screen.getByRole("heading", { level: 1, name: "Card verified" })).toHaveClass("font-display");
    expect(screen.getByText("Ana Reyes")).toBeInTheDocument();
    expect(screen.getByText("BHC-2026-000015")).toBeInTheDocument();
    expect(screen.getByText("Active card")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in to view the full record/ })).toHaveAttribute(
      "href",
      `/login?next=/patients/${PID}`,
    );
    // No teal-on-grey leftovers from the old standalone styling.
    expect(container.innerHTML).not.toContain("#0d9488");
  });

  it("says when a real card is not active", async () => {
    await renderPage(
      { pid: PID, v: "1", sig: "abc" },
      { valid: true, full_name: "Ana Reyes", patient_code: "BHC-2026-000015", card_status: "lost" },
    );

    expect(screen.getByRole("heading", { level: 1, name: "Card not active" })).toBeInTheDocument();
    expect(screen.getByText(/Lost/)).toBeInTheDocument();
  });

  it("explains a card that cannot be verified, with a next step", async () => {
    await renderPage({ pid: PID, v: "1", sig: "bad" }, { valid: false });

    expect(screen.getByRole("heading", { level: 1, name: "We couldn't verify this card" })).toBeInTheDocument();
    expect(screen.getByText(/Signature invalid or card has been revoked/)).toBeInTheDocument();
    expect(screen.getByText(/bring the card to your Barangay Health Center/)).toBeInTheDocument();
  });

  it("handles a QR code with missing parts", async () => {
    await renderPage({ pid: PID });

    expect(screen.getByRole("heading", { level: 1, name: "We couldn't verify this card" })).toBeInTheDocument();
    expect(screen.getByText(/missing required parameters/)).toBeInTheDocument();
  });
});
