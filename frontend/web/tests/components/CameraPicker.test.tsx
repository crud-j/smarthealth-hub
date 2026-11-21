import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HealthCardVerifyPage from "@/app/(dashboard)/health-cards/verify/page";

// Health Cards → Verify → QR tab: when the computer has more than one
// camera (a webcam plus a phone-as-webcam camera such as Phone Link or
// DroidCam), the browser may pick the wrong one, which shows only a
// "no phone connected" picture. A Camera picker lets staff choose, and the
// choice is remembered on that computer.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/cards/NfcScanButton", () => ({ default: () => null }));

const STORAGE_KEY = "shh.qrCameraId";

function stream(deviceId: string) {
  const track = { stop: vi.fn(), getSettings: () => ({ deviceId }) };
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}

const camera = (deviceId: string, label: string) =>
  ({ kind: "videoinput", deviceId, label, groupId: "g" }) as MediaDeviceInfo;

let getUserMedia: ReturnType<typeof vi.fn>;

function devices(list: MediaDeviceInfo[], firstPick = list[0]?.deviceId ?? "") {
  getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
    const video = constraints.video as MediaTrackConstraints;
    const wanted = (video.deviceId as ConstrainDOMStringParameters | undefined)?.exact as string | undefined;
    return stream(wanted ?? firstPick);
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => [
        ...list,
        { kind: "audioinput", deviceId: "mic", label: "Microphone", groupId: "g" } as MediaDeviceInfo,
      ]),
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Verify Health Card: camera picker", () => {
  it("lists the cameras and switches to the chosen one, remembering it", async () => {
    devices([camera("phone", "Phone Link camera"), camera("webcam", "Integrated Webcam")]);
    render(<HealthCardVerifyPage />);

    const picker = await screen.findByLabelText("Camera");
    expect(picker).toHaveValue("phone");
    expect(screen.getByRole("option", { name: "Integrated Webcam" })).toBeInTheDocument();
    expect(screen.getByText(/crossed-out phone/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(picker, { target: { value: "webcam" } });
    });

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { exact: "webcam" } }, audio: false }),
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("webcam");
    await waitFor(() => expect(screen.getByLabelText("Camera")).toHaveValue("webcam"));
  });

  it("starts with the camera chosen last time", async () => {
    window.localStorage.setItem(STORAGE_KEY, "webcam");
    devices([camera("phone", "Phone Link camera"), camera("webcam", "Integrated Webcam")]);
    render(<HealthCardVerifyPage />);

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: "webcam" } }, audio: false }),
    );
    expect(await screen.findByLabelText("Camera")).toHaveValue("webcam");
  });

  it("falls back to the default camera when the remembered one is gone", async () => {
    window.localStorage.setItem(STORAGE_KEY, "unplugged");
    devices([camera("webcam", "Integrated Webcam")]);
    getUserMedia.mockImplementationOnce(async () => {
      throw new DOMException("not found", "OverconstrainedError");
    });
    render(<HealthCardVerifyPage />);

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith({ video: { facingMode: "environment" }, audio: false }),
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText("Camera feed for QR code scanning")).toHaveStyle({ display: "block" }),
    );
  });

  it("shows no picker when there is only one camera", async () => {
    devices([camera("webcam", "Integrated Webcam")]);
    render(<HealthCardVerifyPage />);

    await waitFor(() =>
      expect(screen.getByLabelText("Camera feed for QR code scanning")).toHaveStyle({ display: "block" }),
    );
    expect(screen.queryByLabelText("Camera")).not.toBeInTheDocument();
  });
});
