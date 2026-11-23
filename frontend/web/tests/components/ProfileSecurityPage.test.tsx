import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileSecurityPage from "@/app/(dashboard)/settings/profile/page";
import SecurityPage from "@/app/(dashboard)/settings/security/page";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { CurrentUser } from "@/hooks/useAuth";

// Profile & Security: one page for account details, password and passkeys.
// /settings/security redirects to its Passkeys section.

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

let me: CurrentUser;
vi.mock("@/hooks/useAuth", () => ({ useCurrentUser: () => ({ user: me, isLoading: false }) }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

const passkeyApi = vi.hoisted(() => ({
  listPasskeys: vi.fn(),
  passkeyRegisterBegin: vi.fn(),
  passkeyRegisterComplete: vi.fn(),
  revokePasskey: vi.fn(),
  startPasskeyRegistration: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  listPasskeys: passkeyApi.listPasskeys,
  passkeyRegisterBegin: passkeyApi.passkeyRegisterBegin,
  passkeyRegisterComplete: passkeyApi.passkeyRegisterComplete,
  revokePasskey: passkeyApi.revokePasskey,
}));
vi.mock("@/lib/passkey", () => ({
  isPasskeySupported: () => true,
  startPasskeyRegistration: passkeyApi.startPasskeyRegistration,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

const PASSKEY = {
  id: "pk-1",
  device_name: "Clinic PC",
  aaguid: null,
  created_at: "2026-11-20T02:00:00Z",
  last_used_at: null,
};

beforeEach(() => {
  me = {
    id: "u-1",
    full_name: "Ana Reyes",
    email: "ana@example.test",
    role: "bhw",
    is_active: true,
    mobile_number: "+639170000123",
    mfa_enabled: true,
    has_password: true,
    last_login_at: "2026-11-23T05:05:00Z",
    created_at: "2026-11-01T00:00:00Z",
  };
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ message: "ok" } as never);
  Object.values(passkeyApi).forEach((f) => f.mockReset());
  passkeyApi.listPasskeys.mockResolvedValue({ credentials: [PASSKEY] });
  Object.values(toast).forEach((f) => f.mockReset());
  redirect.mockReset();
});

function typeIn(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("Profile & Security page", () => {
  it("shows account, password and passkeys on one page", async () => {
    render(<ProfileSecurityPage />);

    expect(screen.getByRole("heading", { name: "Profile & Security" })).toBeTruthy();
    expect(screen.getAllByText("Ana Reyes").length).toBeGreaterThan(0);
    expect(screen.getByText("Barangay Health Worker")).toBeTruthy();
    expect(screen.getByText("+639170000123")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Password" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Passkeys" })).toBeTruthy();
    expect(await screen.findByText("Clinic PC")).toBeTruthy();
    expect(screen.getByText("1 saved")).toBeTruthy();
    expect(screen.getByText("Sign-in code by email")).toBeTruthy();
  });

  it("checks the password rules live and only then lets you save", async () => {
    render(<ProfileSecurityPage />);
    const save = screen.getByRole("button", { name: /Update password/ }) as HTMLButtonElement;

    typeIn("Current password", "Oldpass123");
    typeIn("New password", "newpass");
    const rules = screen.getByRole("list", { name: "Password rules" });
    expect(within(rules).getByText(/At least 8 characters/).textContent).toContain("not yet");
    expect(save.disabled).toBe(true);

    typeIn("New password", "Newpass456");
    typeIn("Confirm new password", "Newpass45");
    expect(screen.getByText("The two new passwords do not match.")).toBeTruthy();
    expect(save.disabled).toBe(true);

    typeIn("Confirm new password", "Newpass456");
    expect(save.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(save);
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: "Oldpass123", new_password: "Newpass456" }),
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
  });

  it("shows a wrong current password under the field", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("Current password is incorrect.", 422, "validation_error"));
    render(<ProfileSecurityPage />);

    typeIn("Current password", "Wrongpass1");
    typeIn("New password", "Newpass456");
    typeIn("Confirm new password", "Newpass456");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Update password/ }));
    });

    expect(await screen.findByText("Current password is incorrect.")).toBeTruthy();
    expect(screen.getByLabelText("Current password").getAttribute("aria-invalid")).toBe("true");
  });

  it("passkey-only accounts have no password form", async () => {
    me = { ...me, has_password: false };
    render(<ProfileSecurityPage />);

    expect(screen.getByText(/signs in with a passkey and has no password/)).toBeTruthy();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(screen.getByText("Not set (passkey only)")).toBeTruthy();
    await screen.findByText("Clinic PC");
  });

  it("adds a passkey with the name typed on the page (no browser prompt)", async () => {
    const prompt = vi.spyOn(window, "prompt");
    passkeyApi.passkeyRegisterBegin.mockResolvedValue({ options: { challenge: "c" } });
    passkeyApi.startPasskeyRegistration.mockResolvedValue({ id: "att" });
    passkeyApi.passkeyRegisterComplete.mockResolvedValue({});
    render(<ProfileSecurityPage />);
    await screen.findByText("Clinic PC");

    typeIn("Name the new passkey", "My phone");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Add passkey/ }));
    });

    expect(passkeyApi.passkeyRegisterBegin).toHaveBeenCalledWith("My phone");
    expect(passkeyApi.passkeyRegisterComplete).toHaveBeenCalledWith({ id: "att" }, "My phone");
    expect(passkeyApi.listPasskeys).toHaveBeenCalledTimes(2); // reloaded
    expect(prompt).not.toHaveBeenCalled();
  });

  it("removes a passkey after confirming", async () => {
    passkeyApi.revokePasskey.mockResolvedValue(undefined);
    render(<ProfileSecurityPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Clinic PC" }));

    const dialog = await screen.findByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    });

    expect(passkeyApi.revokePasskey).toHaveBeenCalledWith("pk-1");
    await waitFor(() => expect(screen.queryByText("Clinic PC")).toBeNull());
    expect(screen.getByText("No passkeys yet")).toBeTruthy();
  });

  it("the old Security address goes to the Passkeys section", () => {
    SecurityPage();
    expect(redirect).toHaveBeenCalledWith("/settings/profile#passkeys");
  });
});
