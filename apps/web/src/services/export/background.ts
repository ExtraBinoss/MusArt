import { ThumbnailActivity } from "../projects/thumbnails/activity";

/** Yield between frames and wait for live gestures; hidden tabs can continue encoding. */
export function backgroundExportGate(signal: AbortSignal) {
  const activity = new ThumbnailActivity(100);
  return {
    dispose: () => activity.dispose(),
    beforeFrame: async () => {
      signal.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
      if (document.hidden || !activity.interacting()) return;
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          stop();
          signal.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          stop();
          signal.removeEventListener("abort", cancel);
          reject(signal.reason);
        };
        const check = () => {
          if (document.hidden || !activity.interacting()) finish();
        };
        const stop = activity.subscribe(check);
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
        else check();
      });
      signal.throwIfAborted();
    },
  };
}
