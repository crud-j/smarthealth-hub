"use client";

import { useEffect, useRef, useState } from "react";
import * as Comlink from "comlink";

/**
 * Generic factory hook — instantiates a Web Worker from a given URL, wraps it
 * with Comlink for typed RPC-style calls, and terminates it on unmount.
 *
 * Returns null on environments without Worker support (very old or locked-down
 * BHW machines) so every consumer MUST have a synchronous main-thread fallback
 * path — never a hard dependency on Workers existing.
 *
 * Usage:
 *   const qrScanner = useWebWorker<QrScannerApi>(
 *     new URL("../workers/qrScanner.worker.ts", import.meta.url)
 *   );
 *   const result = qrScanner
 *     ? await qrScanner.decodeFrame(frame)
 *     : decodeFrameOnMainThread(frame); // synchronous fallback
 */
export function useWebWorker<T>(workerUrl: URL): Comlink.Remote<T> | null {
  const [api, setApi] = useState<Comlink.Remote<T> | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const worker = new Worker(workerUrl, { type: "module" });
    workerRef.current = worker;
    setApi(Comlink.wrap<T>(worker));
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // workerUrl is a URL object — intentionally only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return api;
}
