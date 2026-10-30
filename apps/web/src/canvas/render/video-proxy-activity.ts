import type { RenderOptions } from "@musart/render";
type VideoProxyActivity = NonNullable<RenderOptions["videoProxy"]>;

/** Native encoding yields to interaction/playback; no polling or render clock at idle. */
export class CanvasVideoProxyActivity implements VideoProxyActivity {
  private readonly listeners = new Set<() => void>();
  private readonly pointers = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idle = false;
  private blocked = false;
  private dragging = false;
  private closed = false;
  constructor(private readonly onReady: () => void) {
    window.addEventListener("pointerdown", this.down, true);
    window.addEventListener("pointerup", this.up, true);
    window.addEventListener("pointercancel", this.up, true);
    window.addEventListener("lostpointercapture", this.up, true);
    window.addEventListener("wheel", this.pulse, { capture: true, passive: true });
    window.addEventListener("keydown", this.pulse, true);
    window.addEventListener("blur", this.cancel);
    window.addEventListener("dragstart", this.dragStart, true);
    window.addEventListener("dragover", this.pulse, true);
    window.addEventListener("dragend", this.dragEnd, true);
    window.addEventListener("drop", this.dragEnd, true);
    document.addEventListener("visibilitychange", this.pulse);
    this.pulse();
  }
  read = () =>
    !this.closed &&
    !this.blocked &&
    !this.dragging &&
    this.idle &&
    !this.pointers.size &&
    document.visibilityState !== "hidden";
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  ready = () => {
    if (this.read()) this.onReady();
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  private clear() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private pulse = () => {
    if (this.closed) return;
    this.clear();
    this.idle = false;
    this.emit();
    if (
      !this.blocked &&
      !this.dragging &&
      !this.pointers.size &&
      document.visibilityState !== "hidden"
    )
      this.timer = setTimeout(() => {
        this.timer = null;
        this.idle = true;
        this.emit();
      }, 180);
  };
  private down = (event: PointerEvent) => {
    this.pointers.add(event.pointerId);
    this.pulse();
  };
  private up = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.pulse();
  };
  private cancel = () => {
    this.pointers.clear();
    this.dragging = false;
    this.pulse();
  };
  private dragStart = () => {
    this.dragging = true;
    this.pulse();
  };
  private dragEnd = () => {
    this.dragging = false;
    this.pulse();
  };
  setBlocked(value: boolean) {
    if (this.closed || this.blocked === value) return;
    this.blocked = value;
    this.pulse();
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.clear();
    this.emit();
    this.listeners.clear();
    window.removeEventListener("pointerdown", this.down, true);
    window.removeEventListener("pointerup", this.up, true);
    window.removeEventListener("pointercancel", this.up, true);
    window.removeEventListener("lostpointercapture", this.up, true);
    window.removeEventListener("wheel", this.pulse, true);
    window.removeEventListener("keydown", this.pulse, true);
    window.removeEventListener("blur", this.cancel);
    window.removeEventListener("dragstart", this.dragStart, true);
    window.removeEventListener("dragover", this.pulse, true);
    window.removeEventListener("dragend", this.dragEnd, true);
    window.removeEventListener("drop", this.dragEnd, true);
    document.removeEventListener("visibilitychange", this.pulse);
  }
}
