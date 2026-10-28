import type { ModelDownloadEvent } from "./contract";
import { modelFile } from "./manifest";

/** Latest progress per known file; no timers and no download-chunk message flood. */
export function modelProgressSink(
  send: (event: ModelDownloadEvent) => void,
  now = () => performance.now(),
) {
  const pending = new Map<string, ModelDownloadEvent>();
  let emittedAt = -Infinity;
  const flush = () => {
    emittedAt = now();
    for (const event of pending.values()) send(event);
    pending.clear();
  };
  return {
    note: (event: ModelDownloadEvent) => {
      const file = modelFile(event.file);
      if (!file) return;
      pending.set(file, {
        file,
        status: event.status,
        ...(event.status === "progress" ? { loaded: event.loaded, total: event.total } : {}),
      });
      if (event.status === "done" || now() - emittedAt >= 75) flush();
    },
    flush,
  };
}
