import type { ManagedImageOptions } from "./model";

export interface PrintEncodingRequest {
  blob: Blob;
  options: ManagedImageOptions;
  width: number;
  height: number;
  name: string;
  creator?: string;
  proof?: boolean;
}
/** Only native-encoded files cross this boundary; GPU pixels never enter JavaScript. */
export function encodeManagedImage(
  request: PrintEncodingRequest,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./print.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
      cleanup();
      if (event.data.blob?.size) resolve(event.data.blob);
      else reject(new Error(event.data.error ?? "The print encoder produced no file."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("The print encoder response could not be decoded."));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else {
      try {
        worker.postMessage(request);
      } catch (error) {
        cleanup();
        reject(error);
      }
    }
  });
}
