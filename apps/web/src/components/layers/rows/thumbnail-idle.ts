interface Job {
  run: () => void | Promise<void>;
}
const pending = new Set<Job>();
let running = false;
let idle: number | undefined, timer: ReturnType<typeof setTimeout> | undefined;
const inputPending = () =>
  (
    navigator as Navigator & { scheduling?: { isInputPending?(): boolean } }
  ).scheduling?.isInputPending?.() ?? false;
function stop() {
  if (idle !== undefined) globalThis.cancelIdleCallback?.(idle);
  if (timer !== undefined) clearTimeout(timer);
  idle = undefined;
  timer = undefined;
  if (!pending.size) document.removeEventListener("visibilitychange", wake);
}
function pump(deadline?: IdleDeadline) {
  idle = undefined;
  timer = undefined;
  if (document.hidden) return;
  if ((deadline && deadline.timeRemaining() < 4) || inputPending()) {
    arm();
    return;
  }
  const job = pending.values().next().value;
  if (job) {
    pending.delete(job);
    running = true;
    try {
      const result = job.run();
      if (result)
        void result
          .catch(() => undefined)
          .finally(() => {
            running = false;
            arm();
          });
      else {
        running = false;
        arm();
      }
    } catch (error) {
      running = false;
      arm();
      throw error;
    }
  } else stop();
}
function arm() {
  if (!pending.size) {
    stop();
    return;
  }
  if (document.hidden || running || idle !== undefined || timer !== undefined) return;
  if (typeof requestIdleCallback === "function" && typeof cancelIdleCallback === "function")
    idle = requestIdleCallback(pump);
  else timer = setTimeout(() => pump(), 16);
}
function wake() {
  if (!document.hidden) arm();
}
/** One shared request slot prevents visible rows from flooding the bounded GPU preview queue. */
export function scheduleLayerThumbnail(run: () => void | Promise<void>): () => void {
  const job = { run };
  pending.add(job);
  if (pending.size === 1) document.addEventListener("visibilitychange", wake);
  arm();
  return () => {
    pending.delete(job);
    if (!pending.size) stop();
  };
}
