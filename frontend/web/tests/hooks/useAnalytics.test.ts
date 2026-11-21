import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnalyticsExport, useIllnessTrends, useNoShowRate } from "@/hooks/useAnalytics";
import { apiFetch } from "@/lib/api-client";

// The analytics API (backend/app/api/v1/endpoints/analytics.py) reads the date
// range from `from_date` / `to_date`. Unknown names such as `from` / `to` are
// silently ignored and the backend falls back to the last 30 days, so these
// tests pin the exact query string each hook sends.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

/** Query parameters of the n-th apiFetch call (0-based). */
function sentParams(call = 0): URLSearchParams {
  const path = apiFetchMock.mock.calls[call][0];
  return new URLSearchParams(path.split("?")[1] ?? "");
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("useIllnessTrends", () => {
  it("sends the chosen dates as from_date and to_date", async () => {
    apiFetchMock.mockResolvedValue({
      group_by: "week",
      from_date: "2026-10-01",
      to_date: "2026-11-21",
      items: [],
    });

    renderHook(() => useIllnessTrends("2026-10-01", "2026-11-21", "week"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock.mock.calls[0][0]).toMatch(/^\/analytics\/illness-trends\?/);
    const qs = sentParams();
    expect(qs.get("from_date")).toBe("2026-10-01");
    expect(qs.get("to_date")).toBe("2026-11-21");
    expect(qs.get("group_by")).toBe("week");
    expect(qs.has("from")).toBe(false);
    expect(qs.has("to")).toBe(false);
  });
});

describe("useNoShowRate", () => {
  it("sends the chosen dates as from_date and to_date", async () => {
    apiFetchMock.mockResolvedValue({ from_date: "2026-10-01", to_date: "2026-11-21", items: [] });

    renderHook(() => useNoShowRate("2026-10-01", "2026-11-21"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock.mock.calls[0][0]).toMatch(/^\/analytics\/appointments\/no-show-rate\?/);
    const qs = sentParams();
    expect(qs.get("from_date")).toBe("2026-10-01");
    expect(qs.get("to_date")).toBe("2026-11-21");
    expect(qs.has("from")).toBe(false);
    expect(qs.has("to")).toBe(false);
  });
});

describe("useAnalyticsExport", () => {
  it("sends the chosen dates as from_date and to_date", async () => {
    apiFetchMock.mockResolvedValue([{ patient_code: "P-1" }]);
    const { result } = renderHook(() => useAnalyticsExport());

    await act(async () => {
      await result.current.fetchExportData({
        reportType: "immunizations",
        from: "2026-11-01",
        to: "2026-11-21",
      });
    });

    const qs = sentParams();
    expect(qs.get("report_type")).toBe("immunizations");
    expect(qs.get("from_date")).toBe("2026-11-01");
    expect(qs.get("to_date")).toBe("2026-11-21");
    expect(qs.has("from")).toBe(false);
    expect(qs.has("to")).toBe(false);
  });

  it("leaves the dates out when none are chosen (backend default range)", async () => {
    apiFetchMock.mockResolvedValue([]);
    const { result } = renderHook(() => useAnalyticsExport());

    await act(async () => {
      await result.current.fetchExportData({ reportType: "patients" });
    });

    const qs = sentParams();
    expect(qs.has("from_date")).toBe(false);
    expect(qs.has("to_date")).toBe(false);
  });

  it("always asks the API for JSON rows; the page builds the CSV itself", async () => {
    // With format=csv the API answers text/csv, which apiFetch does not parse
    // (it returns undefined), so the CSV download used to fail every time.
    const rows = [{ patient_code: "P-1", full_name: "Test Patient" }];
    apiFetchMock.mockResolvedValue(rows);
    const { result } = renderHook(() => useAnalyticsExport());

    let received: Record<string, unknown>[] = [];
    await act(async () => {
      received = await result.current.fetchExportData({ reportType: "patients" });
    });

    expect(sentParams().get("format")).toBe("json");
    expect(received).toEqual(rows);
  });
});
