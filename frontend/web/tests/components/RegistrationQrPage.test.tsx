import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RegistrationQrPage from "@/app/(dashboard)/settings/registration-qr/page";
import { apiFetch, ApiError } from "@/lib/api-client";

// The QR code and its pre-visit link are ready when the page opens. The page
// reuses the user's link that a patient can still use, so opening the page
// again does not make a new link each time; "New link" makes one.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

vi.mock("qrcode", () => ({
  default: {
    toDataURL: async (url: string) => `data:image/png;qr,${url}`,
    toString: async () => "<svg/>",
  },
}));

vi.mock("sweetalert2", () => ({ default: { fire: vi.fn(async () => ({})) } }));

const INFO = {
  registration_url: "https://hub.example/intake",
  qr_base_url: "https://hub.example/",
  bhc_name: "Test Health Center",
};
const token = (id: string) => ({ token: id, intake_url: `https://api.example/intake/${id}`, expires_at: "2026-11-24T14:00:00Z" });

let current: ReturnType<typeof token> | null | Error = null;
let created: string[] = [];

beforeEach(() => {
  apiFetchMock.mockReset();
  current = null;
  created = [];
  apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/system/registration-url") return INFO as never;
    if (path === "/patients/intake-token/current") {
      if (current instanceof Error) throw current;
      return current as never;
    }
    if (path === "/patients/intake-token" && init?.method === "POST") {
      const id = `new-${created.length + 1}`;
      created.push(id);
      return token(id) as never;
    }
    throw new Error(`unexpected ${path}`);
  });
});

async function renderPage() {
  await act(async () => {
    render(<RegistrationQrPage />);
  });
}

describe("Registration QR page", () => {
  it("shows the link the user already has, without making a new one", async () => {
    current = token("tok-1");
    await renderPage();

    expect(await screen.findByTestId("active-link")).toHaveTextContent("https://hub.example/intake/tok-1");
    expect(screen.getByRole("img", { name: "QR code for the pre-visit form" })).toHaveAttribute(
      "src",
      "data:image/png;qr,https://hub.example/intake/tok-1",
    );
    expect(screen.getByText(/Ready · one patient · until/)).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it("makes a link right away when there is none", async () => {
    await renderPage();

    expect(await screen.findByTestId("active-link")).toHaveTextContent("https://hub.example/intake/new-1");
    expect(created).toEqual(["new-1"]);
  });

  it("makes a new link for the next patient", async () => {
    current = token("tok-1");
    await renderPage();
    await screen.findByTestId("active-link");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /New link/ }));
    });

    await waitFor(() => expect(screen.getByTestId("active-link")).toHaveTextContent("https://hub.example/intake/new-1"));
    expect(created).toEqual(["new-1"]);
  });

  it("still makes a link with a backend that has no /current yet", async () => {
    current = new ApiError("Not Found", 404, "not_found");
    await renderPage();

    expect(await screen.findByTestId("active-link")).toHaveTextContent("/intake/new-1");
  });

  it("explains a failure and offers to try again", async () => {
    current = new ApiError("Too many requests. Please wait.", 429, "rate_limited");
    await renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests. Please wait.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it("shows the permanent public sign-up link", async () => {
    current = token("tok-1");
    await renderPage();
    expect(await screen.findByText("https://hub.example/intake")).toBeInTheDocument();
  });
});
