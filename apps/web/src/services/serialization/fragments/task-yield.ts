interface BackgroundScheduler {
  postTask(
    task: () => void,
    options: { priority: "background" | "user-visible"; signal: AbortSignal },
  ): Promise<void>;
}

/** A real task boundary lets input run between small structured-clone messages. */
export function yieldFragmentTask(signal: AbortSignal, foreground = false): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  const scheduler = (globalThis as typeof globalThis & { scheduler?: BackgroundScheduler })
    .scheduler;
  if (scheduler)
    return scheduler.postTask(() => {}, {
      priority: foreground ? "user-visible" : "background",
      signal,
    });
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 0);
    signal.addEventListener("abort", abort, { once: true });
  });
}
