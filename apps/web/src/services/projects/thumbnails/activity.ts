export interface ActivityPort {
  busy(): boolean;
  interacting?(): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
/** Real input postpones optional GPU work; one quiet timer replaces polling or idle render loops. */
export class ThumbnailActivity implements ActivityPort {
  private readonly pointers = new Set<number>();
  private until = 0;
  private wheelUntil = 0;
  private wheelTimer: ReturnType<typeof setTimeout> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly quietMs = 600,
    private readonly surface: Window = window,
  ) {
    surface.addEventListener("pointermove", this.quiet, { capture: true, passive: true });
    surface.addEventListener("pointerdown", this.down, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      surface.addEventListener(type, this.up, true);
    surface.addEventListener("wheel", this.wheel, true);
    surface.addEventListener("keydown", this.quiet, true);
    surface.addEventListener("blur", this.blur);
  }
  private inputPending = () => {
    const scheduling = (
      this.surface.navigator as Navigator & {
        scheduling?: { isInputPending?(options?: { includeContinuous: boolean }): boolean };
      }
    ).scheduling;
    return scheduling?.isInputPending?.({ includeContinuous: true }) ?? false;
  };
  busy = () => this.pointers.size > 0 || Date.now() < this.until || this.inputPending();
  interacting = () => this.pointers.size > 0 || Date.now() < this.wheelUntil || this.inputPending();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify = () => {
    for (const listener of this.listeners) listener();
  };
  private quiet = () => {
    this.until = Date.now() + this.quietMs;
    clearTimeout(this.timer);
    this.timer = setTimeout(this.notify, this.quietMs);
    this.notify();
  };
  private wheel = () => {
    this.wheelUntil = Date.now() + 100;
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(this.notify, 100);
    this.quiet();
  };
  private down = (event: Event) => {
    this.pointers.add((event as PointerEvent).pointerId ?? 0);
    this.quiet();
  };
  private up = (event: Event) => {
    this.pointers.delete((event as PointerEvent).pointerId ?? 0);
    this.quiet();
  };
  private blur = () => {
    this.pointers.clear();
    this.wheelUntil = 0;
    clearTimeout(this.wheelTimer);
    this.quiet();
  };
  dispose(): void {
    clearTimeout(this.timer);
    clearTimeout(this.wheelTimer);
    this.surface.removeEventListener("pointermove", this.quiet, true);
    this.surface.removeEventListener("pointerdown", this.down, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      this.surface.removeEventListener(type, this.up, true);
    this.surface.removeEventListener("wheel", this.wheel, true);
    this.surface.removeEventListener("keydown", this.quiet, true);
    this.surface.removeEventListener("blur", this.blur);
    this.listeners.clear();
  }
}
