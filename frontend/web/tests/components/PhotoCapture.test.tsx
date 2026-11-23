import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePhotoUploader from "@/app/(dashboard)/patients/_components/ProfilePhotoUploader";
import PhotoCapturePage from "@/app/photo-capture/[token]/page";
import { apiFetch, ApiError } from "@/lib/api-client";

// Patient photo from a phone: the staff panel shows a QR code for a 15-minute
// link and polls it; the phone page (not signed in) takes and sends the photo.
// Photo URLs stay root-relative (same origin, login cookie): the old panel
// showed "http://localhost:8000/..." after an upload, broken in production.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

vi.mock("qrcode", () => ({
  default: { toDataURL: async (url: string) => `data:image/png;qr,${url}` },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok-123" }) }));

const LINK = {
  token: "tok-123",
  capture_url: "https://hub.example/photo-capture/tok-123",
  expires_at: "2099-01-01T07:15:00Z",
};
const PHOTO = "/api/v1/patients/p1/photo?v=42";

let status: { expires_at: string; uploaded_at: string | null; photo_url: string | null } | ApiError;
const fetchMock = vi.fn();

beforeEach(() => {
  apiFetchMock.mockReset();
  status = { expires_at: LINK.expires_at, uploaded_at: null, photo_url: null };
  apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/patients/p1/photo-capture" && init?.method === "POST") return LINK as never;
    if (path === "/patients/p1/photo-capture/tok-123") {
      if (status instanceof ApiError) throw status;
      return status as never;
    }
    throw new Error(`unexpected ${path}`);
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const posts = () => apiFetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

describe("staff photo panel", () => {
  it("shows the phone QR code when it opens (registration) and the photo when the phone sends it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saved = vi.fn();
    render(<ProfilePhotoUploader patientId="p1" autoStartPhone onPhotoSaved={saved} />);

    const qr = await screen.findByAltText(/scan with a phone/i);
    expect(qr.getAttribute("src")).toBe(`data:image/png;qr,${LINK.capture_url}`);
    expect(screen.getByText(/Waiting for the phone/)).toBeTruthy();
    expect(posts()).toHaveLength(1);
    expect(screen.queryByAltText("Patient photo on file")).toBeNull();

    await waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0)); // polling started
    status = { expires_at: LINK.expires_at, uploaded_at: "2099-01-01T07:05:00Z", photo_url: PHOTO };
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });

    const photo = await screen.findByAltText("Patient photo on file");
    expect(photo.getAttribute("src")).toBe(PHOTO);
    expect(saved).toHaveBeenCalledWith(PHOTO);
    expect(posts()).toHaveLength(1); // polling never makes another link
  });

  it("on the profile, makes a QR code only when asked", async () => {
    render(<ProfilePhotoUploader patientId="p1" currentPhotoUrl={PHOTO} />);

    expect((await screen.findByAltText("Patient photo on file")).getAttribute("src")).toBe(PHOTO);
    expect(posts()).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Show QR code/ }));
    });
    expect(await screen.findByAltText(/scan with a phone/i)).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });

  it("an expired link offers a new QR code", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProfilePhotoUploader patientId="p1" autoStartPhone />);
    await screen.findByAltText(/scan with a phone/i);

    await waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0)); // polling started
    status = new ApiError("expired", 404, "not_found");
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });

    expect(await screen.findByText(/This QR code has expired/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /New QR code/ }));
    });
    expect(posts()).toHaveLength(2);
  });

  it("uploads a file from the computer and shows it from the same origin", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ photo_url: PHOTO }), { status: 200 }));
    render(<ProfilePhotoUploader patientId="p1" />);

    fireEvent.click(screen.getByRole("tab", { name: /Upload file/ }));
    const file = new File(["jpeg"], "face.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose patient photo file"), { target: { files: [file] } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save photo/ }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/patients/p1/photo");
    expect(init.credentials).toBe("include");
    const photo = await screen.findByAltText("Patient photo on file");
    expect(photo.getAttribute("src")).toBe(PHOTO);
    expect(photo.getAttribute("src")).not.toContain("localhost");
  });
});

describe("phone page", () => {
  const page = { patient_initials: "A. R.", expires_at: LINK.expires_at, uploaded_at: null };

  it("shows initials only, takes the photo and sends it", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ message: "ok", uploaded_at: "2099-01-01T07:05:00Z" }), { status: 200 });
      }
      return new Response(JSON.stringify(page), { status: 200 });
    });
    render(<PhotoCapturePage />);

    expect(await screen.findByText("A. R.")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/photo-capture/tok-123");

    const camera = screen.getByLabelText("Take photo with camera") as HTMLInputElement;
    expect(camera.getAttribute("capture")).toBe("environment");
    await act(async () => {
      fireEvent.change(camera, { target: { files: [new File(["jpeg"], "p.jpg", { type: "image/jpeg" })] } });
    });
    expect(await screen.findByAltText("Photo to send")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send photo/ }));
    });

    expect(await screen.findByText(/Photo sent/)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/v1/photo-capture/tok-123");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("photo")).toBeTruthy();
  });

  it("an expired link says so", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "gone" } }), { status: 404 }),
    );
    render(<PhotoCapturePage />);
    expect(await screen.findByText(/expired or was replaced/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take photo" })).toBeNull();
  });
});
