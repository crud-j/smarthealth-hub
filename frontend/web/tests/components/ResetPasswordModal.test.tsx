import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordModal from "@/components/modals/ResetPasswordModal";
import { apiFetch, ApiError } from "@/lib/api-client";

// Users page → "Reset password": the admin types (or generates) a temporary
// password, optionally texts it, and the account is signed out everywhere.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

const USER = { id: "u-1", full_name: "Test Staff", mobile_number: "+639170000001" };

function renderModal(onDone = vi.fn()) {
  render(<ResetPasswordModal open user={USER} onClose={vi.fn()} onDone={onDone} />);
  return onDone;
}

const passwordInput = () => screen.getByLabelText(/Temporary password/);
const submitButton = () => screen.getByRole("button", { name: /Reset password/ });

describe("ResetPasswordModal", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("names the user and starts with Reset disabled", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: /Reset password for Test Staff/ })).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it("lists what a weak password is missing", () => {
    renderModal();
    fireEvent.change(passwordInput(), { target: { value: "weak" } });
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument();
    expect(screen.getByText(/One uppercase letter/)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it("Generate fills in a valid password", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Generate/ }));
    expect((passwordInput() as HTMLInputElement).value).toHaveLength(12);
    expect(submitButton()).toBeEnabled();
  });

  it("sends the password without SMS by default, then calls onDone", async () => {
    apiFetchMock.mockResolvedValue({ message: "ok", trusted_devices_removed: 2 });
    const onDone = renderModal();
    fireEvent.change(passwordInput(), { target: { value: "NewTemp123" } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ message: "ok", trusted_devices_removed: 2 }, false));
    expect(apiFetchMock).toHaveBeenCalledWith("/users/u-1/reset-password", {
      method: "POST",
      body: JSON.stringify({ new_password: "NewTemp123", send_sms: false }),
    });
  });

  it("texts the password when the box is ticked", async () => {
    apiFetchMock.mockResolvedValue({ message: "ok", trusted_devices_removed: 0 });
    const onDone = renderModal();
    fireEvent.change(passwordInput(), { target: { value: "NewTemp123" } });
    fireEvent.click(screen.getByLabelText(/Also text it to \+639170000001/));
    fireEvent.click(submitButton());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(apiFetchMock.mock.calls[0][1]).toEqual({
      method: "POST",
      body: JSON.stringify({ new_password: "NewTemp123", send_sms: true }),
    });
    expect(onDone.mock.calls[0][1]).toBe(true);
  });

  it("shows the server's error and stays open", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("User not found.", 404, "NOT_FOUND"));
    const onDone = renderModal();
    fireEvent.change(passwordInput(), { target: { value: "NewTemp123" } });
    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("User not found.");
    expect(onDone).not.toHaveBeenCalled();
  });
});
