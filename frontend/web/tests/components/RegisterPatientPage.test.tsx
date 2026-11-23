import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewPatientPage from "@/app/(dashboard)/patients/new/page";

// Register New Patient (/patients/new):
// - no "Scan Government ID" card any more (removed with its OCR endpoint);
// - PhilHealth: "None" registers without a category or number (the empty
//   category <select> used to fail: "Invalid enum value ... received ''");
//   Member / Dependent need a 12-digit PhilHealth No.; Member needs a category;
// - the error list uses field names people read, not code names.

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

const createPatient = vi.fn();
vi.mock("@/hooks/usePatients", () => ({
  useCreatePatient: () => ({ createPatient, loading: false, error: null }),
}));
vi.mock("@/hooks/useAuth", () => ({ useCurrentUser: () => ({ user: { role: "bhw" } }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/app/(dashboard)/patients/_components/ProfilePhotoUploader", () => ({
  default: ({ patientId }: { patientId: string }) => <div>Photo panel for {patientId}</div>,
}));

beforeEach(() => {
  createPatient.mockReset();
  createPatient.mockResolvedValue({
    duplicateWarning: false,
    patient: { id: "p-1", firstName: "Ana", lastName: "Reyes", patientCode: "BHC-2030-000001" },
  });
  push.mockReset();
});

function field(container: HTMLElement, id: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`no #${id}`);
  return el;
}

function type(container: HTMLElement, id: string, value: string) {
  fireEvent.change(field(container, id), { target: { value } });
}

async function click(name: RegExp | string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

/** Fill steps 1 and 2 and land on step 3. */
async function toStep3() {
  const view = render(<NewPatientPage />);
  const { container } = view;
  await screen.findByRole("heading", { name: "Register New Patient" });
  type(container, "firstName", "Ana");
  type(container, "lastName", "Reyes");
  type(container, "birthDate", "1990-05-01");
  await act(async () => {
    fireEvent.click(screen.getByLabelText("Female"));
  });
  await click("Next");
  await waitFor(() => expect(container.querySelector("#emergencyContactName")).not.toBeNull());
  type(container, "emergencyContactName", "Bea Santos");
  type(container, "emergencyContactNumber", "09171234567");
  type(container, "address", "Purok 2, near the chapel");
  await click("Next");
  await waitFor(() => expect(container.querySelector("#philhealthNo")).not.toBeNull());
  return view;
}

async function consent() {
  await act(async () => {
    fireEvent.click(screen.getByRole("checkbox", { name: /consented/i }));
  });
}

describe("Register New Patient", () => {
  it("has no government ID scan", async () => {
    render(<NewPatientPage />);
    await screen.findByRole("heading", { name: "Register New Patient" });
    expect(screen.queryByText(/Scan Government ID/i)).toBeNull();
    expect(screen.queryByText(/pre-filled from scanned ID/i)).toBeNull();
  });

  it("registers a patient with PhilHealth None (no category, no number)", async () => {
    await toStep3();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("None"));
    });
    await consent();
    await click("Register Patient");

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    const payload = createPatient.mock.calls[0][0];
    expect(payload.philhealthCategory).toBeUndefined();
    expect(payload.philhealthNo).toBeUndefined();
    expect(payload.registrationDataSource).toBe("manual");
    expect(screen.queryByText(/Invalid enum value/)).toBeNull();
  });

  it("member needs a PhilHealth No. and a category, with readable messages", async () => {
    const { container } = await toStep3();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Member"));
    });
    await consent();
    await click("Register Patient");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/PhilHealth No\.: Enter the PhilHealth No\./)).toBeTruthy();
    expect(within(alert).getByText(/PhilHealth Category: Choose the PhilHealth category/)).toBeTruthy();
    expect(alert.textContent).not.toMatch(/philhealthCategory|philhealthNo/);
    expect(createPatient).not.toHaveBeenCalled();

    type(container, "philhealthNo", "12-3456789");
    fireEvent.change(field(container, "philhealthCategory"), { target: { value: "indigent" } });
    await click("Register Patient");
    // In the list at the top and under the field.
    expect(await screen.findAllByText(/PhilHealth No\. must have 12 digits/)).toHaveLength(2);
    expect(createPatient).not.toHaveBeenCalled();

    type(container, "philhealthNo", "12-345678901-2");
    await click("Register Patient");
    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    const payload = createPatient.mock.calls[0][0];
    expect(payload.philhealthMemberType).toBe("member");
    expect(payload.philhealthCategory).toBe("indigent");
    expect(payload.philhealthNo).toBe("12-345678901-2");
  });

  it("dependent needs a PhilHealth No. but not a category", async () => {
    const { container } = await toStep3();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Dependent"));
    });
    type(container, "philhealthNo", "12-345678901-2");
    await consent();
    await click("Register Patient");

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    expect(createPatient.mock.calls[0][0].philhealthMemberType).toBe("dependent");
  });

  it("switching back to None clears and locks the PhilHealth fields", async () => {
    const { container } = await toStep3();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Member"));
    });
    type(container, "philhealthNo", "12-345678901-2");
    fireEvent.change(field(container, "philhealthCategory"), { target: { value: "sponsored" } });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("None"));
    });

    expect(field(container, "philhealthNo").disabled).toBe(true);
    expect(field(container, "philhealthCategory").disabled).toBe(true);
    await consent();
    await click("Register Patient");
    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    const payload = createPatient.mock.calls[0][0];
    expect(payload.philhealthNo).toBeUndefined();
    expect(payload.philhealthCategory).toBeUndefined();
    expect(payload.philhealthMemberType).toBeUndefined();
  });

  it("after saving, shows the patient and the photo panel", async () => {
    await toStep3();
    await consent();
    await click("Register Patient");

    expect(await screen.findByText("Photo panel for p-1")).toBeTruthy();
    expect(screen.getByText(/Ana Reyes is registered/)).toBeTruthy();
  });
});
