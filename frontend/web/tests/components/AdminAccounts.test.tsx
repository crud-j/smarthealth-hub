import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateUserModal from "@/components/modals/CreateUserModal";
import EditUserModal from "@/components/modals/EditUserModal";
import type { StaffUser } from "@/app/(dashboard)/settings/users/page";
import { apiFetch } from "@/lib/api-client";

// Users page: an admin can create another System Administrator from
// "Add Staff Account". Admin is listed last and never pre-selected.
// Edit Staff Account shows an admin's role read-only and never sends a role:
// it used to pre-select another role and demote the admin on every save.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const apiFetchMock = vi.mocked(apiFetch);

// Alphabetical, as the API returns them.
const ALL_ROLES = [
  { id: "r-admin", name: "admin" },
  { id: "r-admin-staff", name: "admin_staff" },
  { id: "r-bhw", name: "bhw" },
  { id: "r-physician", name: "physician" },
];
const STAFF_ROLES = ALL_ROLES.filter((r) => r.name !== "admin");

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path === "/users/roles?include_admin=true") return ALL_ROLES as never;
    if (path === "/users/roles") return STAFF_ROLES as never;
    return {} as never;
  });
});

function sentBody(path: string): Record<string, unknown> {
  const call = apiFetchMock.mock.calls.find(([p, init]) => p === path && init?.method);
  if (!call) throw new Error(`no request to ${path}`);
  return JSON.parse(String(call[1]?.body));
}

describe("Add Staff Account", () => {
  async function openModal() {
    const onCreated = vi.fn();
    render(<CreateUserModal open onClose={vi.fn()} onCreated={onCreated} />);
    await screen.findByRole("option", { name: "System Administrator (Admin)" });
    return onCreated;
  }

  it("lists System Administrator last and does not pre-select it", async () => {
    await openModal();

    expect(apiFetchMock).toHaveBeenCalledWith("/users/roles?include_admin=true");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Admin Staff", "BHW", "Physician", "System Administrator (Admin)"]);
    expect((screen.getByLabelText(/Role/) as HTMLSelectElement).value).toBe("r-admin-staff");
    expect(screen.queryByText(/seed script/)).toBeNull();
    expect(screen.queryByText(/Full system access/)).toBeNull();
  });

  it("creates a System Administrator, with a warning first", async () => {
    const onCreated = await openModal();

    fireEvent.change(screen.getByLabelText(/Role/), { target: { value: "r-admin" } });
    expect(screen.getByRole("note").textContent).toMatch(/Full system access/);

    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Second Administrator" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "second.admin@example.test" } });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "+639170000123" } });
    fireEvent.change(document.getElementById("cu-password")!, { target: { value: "Secondadmin1" } });
    fireEvent.change(document.getElementById("cu-confirm-password")!, { target: { value: "Secondadmin1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    });

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const body = sentBody("/users");
    expect(body.role_id).toBe("r-admin");
    expect(body.email).toBe("second.admin@example.test");
    expect(body.credential_mode).toBe("password");
  });
});

describe("Edit Staff Account", () => {
  const staff = (role: string): StaffUser => ({
    id: "u-1",
    full_name: "Old Name",
    email: "someone@example.test",
    mobile_number: "+639170000999",
    role,
    is_active: true,
    mfa_enabled: true,
    has_password: true,
    last_login_at: null,
    created_at: "2026-11-01T00:00:00Z",
  });

  async function openEdit(role: string) {
    const onUpdated = vi.fn();
    render(<EditUserModal open user={staff(role)} onClose={vi.fn()} onUpdated={onUpdated} />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/users/roles"));
    return onUpdated;
  }

  it("keeps an administrator's role when saving (used to demote them)", async () => {
    const onUpdated = await openEdit("admin");

    expect(screen.getByText("System Administrator (Admin)")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.change(screen.getByDisplayValue("Old Name"), { target: { value: "New Name" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    });

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(sentBody("/users/u-1")).toEqual({ full_name: "New Name" });
  });

  it("still changes a staff member's role", async () => {
    const onUpdated = await openEdit("bhw");
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("r-bhw"));
    expect(screen.queryByRole("option", { name: /System Administrator/ })).toBeNull();

    fireEvent.change(select, { target: { value: "r-physician" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    });

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(sentBody("/users/u-1")).toEqual({ role_id: "r-physician" });
  });
});
