interface Clock {
  now: () => number;
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}
/** Two animation frames bound the first actual paint without delaying focus or dialog mounting. */
export class SearchOpenTiming {
  private started: number | null = null;
  private frame: number | null = null;
  private generation = 0;
  constructor(private readonly clock: Clock) {}
  request() {
    this.cancel();
    this.started = this.clock.now();
  }
  mounted(report: (milliseconds: number) => void) {
    if (this.started === null || this.frame !== null) return;
    const generation = this.generation;
    this.frame = this.clock.request(() => {
      if (generation !== this.generation) return;
      this.frame = this.clock.request(() => {
        if (generation !== this.generation || this.started === null) return;
        this.frame = null;
        const elapsed = this.clock.now() - this.started;
        this.started = null;
        report(elapsed);
      });
    });
  }
  cancel() {
    this.generation++;
    if (this.frame !== null) this.clock.cancel(this.frame);
    this.frame = null;
    this.started = null;
  }
}
export function browserSearchTiming() {
  const nativeFrames = typeof window.requestAnimationFrame === "function";
  return new SearchOpenTiming({
    now: () => performance.now(),
    request: (callback) =>
      nativeFrames
        ? window.requestAnimationFrame(callback)
        : window.setTimeout(() => callback(performance.now()), 0),
    cancel: (handle) =>
      nativeFrames ? window.cancelAnimationFrame(handle) : window.clearTimeout(handle),
  });
}
