import { renderHook, waitFor } from "@testing-library/react";
import * as Comlink from "comlink";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWebWorker } from "@/hooks/useWebWorker";

// jsdom has no Worker, so pages always took the main-thread fallback in tests
// and nobody noticed that, in a real browser, the hook handed back a Promise
// instead of the worker: a Comlink proxy is a function, and React calls any
// function given to a state setter as an updater.

const workerApi = {
  add(a: number, b: number): number {
    return a + b;
  },
};
type WorkerApi = typeof workerApi;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWebWorker", () => {
  it("returns a working proxy to the worker, not a Promise", async () => {
    vi.stubGlobal("Worker", class {});
    // A MessageChannel stands in for the worker: Comlink talks to port2 via port1.
    const { port1, port2 } = new MessageChannel();
    Comlink.expose(workerApi, port2);
    const terminate = vi.fn();
    const fakeWorker = Object.assign(port1, { terminate }) as unknown as Worker;

    const { result, unmount } = renderHook(() => useWebWorker<WorkerApi>(() => fakeWorker));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current instanceof Promise).toBe(false);
    expect(typeof result.current?.add).toBe("function");
    await expect(result.current?.add(2, 3)).resolves.toBe(5);

    unmount();
    expect(terminate).toHaveBeenCalledTimes(1);
    port1.close();
    port2.close();
  });

  it("returns null when the browser has no Worker (callers use their fallback)", () => {
    vi.stubGlobal("Worker", undefined);
    const factory = vi.fn();

    const { result } = renderHook(() => useWebWorker<WorkerApi>(factory));

    expect(result.current).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });
});
