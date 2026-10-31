import type { UiPresentationPort } from "./ui-presentation";

/** Optional work waits for real presentation holds, with no fixed loading delay. */
export async function waitForPresentation(
  port: UiPresentationPort | undefined,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (!port?.busy()) return;
  let cleanup = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        if (!port.busy()) resolve();
      };
      const abort = () => reject(signal.reason);
      const unsubscribe = port.subscribe(ready);
      signal.addEventListener("abort", abort, { once: true });
      cleanup = () => {
        unsubscribe();
        signal.removeEventListener("abort", abort);
      };
      if (signal.aborted) abort();
      else ready();
    });
  } finally {
    cleanup();
  }
}
