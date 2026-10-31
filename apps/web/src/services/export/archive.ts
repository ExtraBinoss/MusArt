/** Package already-encoded files away from the UI thread; one transferable request is bounded. */
export function createExportArchive(
  files: Record<string, Uint8Array>,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  if (Object.values(files).reduce((sum, file) => sum + file.byteLength, 0) > 128 * 1024 * 1024)
    throw new Error("The artboard archive exceeds the 128 MiB export limit.");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./archive.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      worker.onmessage = null;
      worker.onerror = null;
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
      cleanup();
      if (event.data.blob?.size) resolve(event.data.blob);
      else reject(new Error(event.data.error ?? "The archive produced no file."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else {
      try {
        worker.postMessage(
          files,
          Object.values(files).map((file) => file.buffer as ArrayBuffer),
        );
      } catch (error) {
        cleanup();
        reject(error);
      }
    }
  });
}
