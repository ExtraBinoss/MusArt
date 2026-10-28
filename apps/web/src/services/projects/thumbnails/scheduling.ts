/** An idle timeout is not permission to run a long renderer task without spare frame time. */
export function hasThumbnailBudget(deadline?: IdleDeadline): boolean {
  return (
    !deadline || (typeof deadline.timeRemaining === "function" && deadline.timeRemaining() >= 8)
  );
}
/** Yield to queued input before admitting a GPU frame; never yield between draw and native snapshot. */
export function yieldThumbnailInput(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const scheduler = (
    globalThis as typeof globalThis & {
      scheduler?: {
        postTask<T>(
          task: () => T,
          options: { priority: "user-visible"; signal: AbortSignal },
        ): Promise<T>;
      };
    }
  ).scheduler;
  if (scheduler?.postTask)
    return scheduler.postTask(() => undefined, { priority: "user-visible", signal });
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 0);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
