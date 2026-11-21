import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HealthCardVerifyPage from "@/app/(dashboard)/health-cards/verify/page";

// Health Cards → Verify → QR tab: the camera starts, then a frame loop reads
// QR codes. Browsers fire the video's "play" event BEFORE `video.play()`
// resolves, so a loop that waits for "play" after the await never starts.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/cards/NfcScanButton", () => ({ default: () => null }));

const requestFrame = vi.fn((_cb: FrameRequestCallback) => 1);

beforeEach(() => {
  requestFrame.mockClear();
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  });
  // Browser order: the "play" event fires, then the play() promise resolves.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Verify Health Card: QR camera", () => {
  it("starts reading camera frames once the camera is playing", async () => {
    render(<HealthCardVerifyPage />);

    const video = screen.getByLabelText("Camera feed for QR code scanning");
    await waitFor(() => expect(video).toHaveStyle({ display: "block" }));

    await waitFor(() => expect(requestFrame).toHaveBeenCalled());
  });

  it("stops the frame loop once the camera is switched off", async () => {
    render(<HealthCardVerifyPage />);
    const video = screen.getByLabelText("Camera feed for QR code scanning");
    await waitFor(() => expect(video).toHaveStyle({ display: "block" }));
    await waitFor(() => expect(requestFrame).toHaveBeenCalled());

    // Switch to the NFC tab (stops the camera), then run the frame that was
    // already queued: it must not queue another one.
    fireEvent.click(screen.getByRole("tab", { name: "NFC Card" }));
    const queued = requestFrame.mock.calls[0][0];
    requestFrame.mockClear();
    queued(0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestFrame).not.toHaveBeenCalled();
  });
});
