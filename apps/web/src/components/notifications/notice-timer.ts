type PauseReason = "hover" | "focus" | "copy";

/** One timeout, no animation loop. Remaining reading time is retained across independent pauses. */
export function createNoticeTimer(onExpire: () => void) {
  const pauses = new Set<PauseReason>();
  let handle: ReturnType<typeof setTimeout> | null = null,
    remaining = 0,
    started = 0,
    generation = 0,
    active = false;
  function stop(accountElapsed: boolean) {
    if (handle === null) return;
    clearTimeout(handle);
    handle = null;
    if (accountElapsed) remaining = Math.max(0, remaining - (performance.now() - started));
  }
  function schedule() {
    if (!active || pauses.size || handle !== null) return;
    const token = generation;
    started = performance.now();
    handle = setTimeout(() => {
      handle = null;
      if (!active || token !== generation) return;
      active = false;
      onExpire();
    }, remaining);
  }
  return {
    setOnExpire(callback: () => void) {
      onExpire = callback;
    },
    restart(duration: number) {
      if (!Number.isFinite(duration) || duration < 0) throw RangeError("Invalid notice duration.");
      stop(false);
      generation++;
      remaining = duration;
      active = true;
      schedule();
    },
    pause(reason: PauseReason, paused: boolean) {
      if (paused) {
        if (!pauses.has(reason)) {
          pauses.add(reason);
          stop(true);
        }
      } else if (pauses.delete(reason)) schedule();
    },
    clear() {
      active = false;
      generation++;
      stop(false);
    },
    dispose() {
      active = false;
      generation++;
      stop(false);
      pauses.clear();
    },
  };
}
