"use client";

import { useEffect, useRef, useState } from "react";
import * as Comlink from "comlink";

/**
 * Generic factory hook — instantiates a Web Worker via the given factory,
 * wraps it with Comlink for typed RPC-style calls, and terminates it on
 * unmount.
 *
 * Returns null on environments without Worker support (very old or locked-down
 * BHW machines) so every consumer MUST have a synchronous main-thread fallback
 * path — never a hard dependency on Workers existing.
 *
 * IMPORTANT — why this takes a factory function, not a URL:
 * Bundlers (Turbopack, webpack, Vite) detect worker entry points by static
 * analysis of the literal `new Worker(new URL("./file.ts", import.meta.url))`
 * expression. That detection only fires when the expression appears directly
 * — it does NOT follow the URL through a function call boundary. An earlier
 * version of this hook accepted a pre-built `URL` from the caller and ran
 * `new Worker(workerUrl, ...)` in here instead; because the `new URL(...)`
 * literal and the `new Worker(...)` call were in two different files,
 * Turbopack never recognized the worker as an entry point and instead served
 * the raw, untranspiled .ts source (with bare-specifier `import` statements)
 * as a plain static asset. The worker script then failed to execute at all,
 * which surfaced later as a confusing "DataCloneError: #<Promise> could not
 * be cloned" the first time a method was called on the dead worker — not as
 * a script-load error, which made it look like a Comlink/postMessage bug.
 * Requiring callers to pass a factory keeps `new Worker(new URL(...))`
 * intact as one literal expression at each call site, where bundlers can see
 * and bundle it correctly.
 *
 * Usage:
 *   const qrScanner = useWebWorker<QrScannerApi>(() =>
 *     new Worker(new URL("../workers/qrScanner.worker.ts", import.meta.url), {
 *       type: "module",
 *     })
 *   );
 *   const result = qrScanner
 *     ? await qrScanner.decodeFrame(frame)
 *     : decodeFrameOnMainThread(frame); // synchronous fallback
 */
export function useWebWorker<T>(createWorker: () => Worker): Comlink.Remote<T> | null {
  const [api, setApi] = useState<Comlink.Remote<T> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const createWorkerRef = useRef(createWorker);
  createWorkerRef.current = createWorker;

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const worker = createWorkerRef.current();
    workerRef.current = worker;
    setApi(Comlink.wrap<T>(worker));
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // createWorker is captured via ref and intentionally excluded — it's a
    // fresh closure on every render, but the worker should only be created
    // once on mount (consumers pass an inline factory, not a stable ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return api;
}
