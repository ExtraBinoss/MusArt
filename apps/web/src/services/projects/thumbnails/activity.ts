import { getUiPresentation, type UiPresentationPort } from "../../../state/session/ui-presentation";
export interface ActivityPort {
  busy(): boolean;
  interacting?(): boolean;
  visibleBusy?(): boolean;
  canonicalBusy?(): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
/** Real input postpones optional GPU work; one quiet timer replaces polling or idle render loops. */
export class ThumbnailActivity implements ActivityPort {
  private readonly pointers = new Set<number>();
  private readonly keys = new Set<string>();
  private dragging = false;
  private dragGeneration = 0;
  private until = 0;
  private wheelUntil = 0;
  private layerIntent = false;
  private layerUntil = 0;
  private wheelTimer: ReturnType<typeof setTimeout> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly stopSuspension?: () => void;
  private readonly presentation: UiPresentationPort;
  private readonly stopPresentation: () => void;
  constructor(
    private readonly quietMs = 600,
    private readonly surface: Window = window,
    private readonly suspension?: { busy(): boolean; subscribe(listener: () => void): () => void },
  ) {
    this.stopSuspension = suspension?.subscribe(this.notify);
    this.presentation = getUiPresentation(surface);
    this.stopPresentation = this.presentation.subscribe(this.notify);
    surface.addEventListener("pointermove", this.quiet, { capture: true, passive: true });
    surface.addEventListener("pointerover", this.layerOver, true);
    surface.addEventListener("pointerout", this.layerOut, true);
    surface.addEventListener("pointerdown", this.down, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      surface.addEventListener(type, this.up, true);
    surface.addEventListener("wheel", this.wheel, true);
    surface.addEventListener("keydown", this.keyDown, true);
    surface.addEventListener("keyup", this.keyUp, true);
    surface.addEventListener("dragstart", this.dragStart, true);
    for (const type of ["dragend", "drop"]) surface.addEventListener(type, this.dragEnd, true);
    surface.addEventListener("blur", this.blur);
    surface.document.addEventListener("visibilitychange", this.notify);
  }
  private inputPending = () => {
    const scheduling = (
      this.surface.navigator as Navigator & {
        scheduling?: { isInputPending?(options?: { includeContinuous: boolean }): boolean };
      }
    ).scheduling;
    return scheduling?.isInputPending?.({ includeContinuous: true }) ?? false;
  };
  busy = () =>
    this.presentation.busy() ||
    Boolean(this.suspension?.busy()) ||
    this.surface.document.hidden ||
    this.dragging ||
    this.pointers.size > 0 ||
    this.keys.size > 0 ||
    Date.now() < this.until ||
    this.inputPending();
  interacting = () =>
    Boolean(this.suspension?.busy()) ||
    this.surface.document.hidden ||
    this.dragging ||
    this.pointers.size > 0 ||
    Date.now() < this.wheelUntil ||
    this.inputPending();
  visibleBusy = () =>
    this.presentation.busy() ||
    Boolean(this.suspension?.busy()) ||
    this.surface.document.hidden ||
    this.dragging ||
    this.pointers.size > 0 ||
    this.keys.size > 0 ||
    Date.now() < this.wheelUntil ||
    this.inputPending();
  canonicalBusy = () => this.layerIntent || Date.now() < this.layerUntil;
  private layerOver = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".layer-tree") || this.layerIntent) return;
    this.layerIntent = true;
    this.notify();
  };
  private layerOut = (event: Event) => {
    if (!this.layerIntent) return;
    const next = (event as PointerEvent).relatedTarget;
    if (next instanceof Element && next.closest(".layer-tree")) return;
    this.layerIntent = false;
    this.layerUntil = Date.now() + this.quietMs;
    this.quiet();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify = () => {
    for (const listener of this.listeners) listener();
  };
  private reconcileModifiers(event: Event) {
    const input = event as MouseEvent | KeyboardEvent;
    for (const [name, flag] of [
      ["Alt", "altKey"],
      ["Control", "ctrlKey"],
      ["Meta", "metaKey"],
      ["Shift", "shiftKey"],
    ] as const) {
      // Browser chrome can consume a modifier's keyup without blurring the page.
      // A later real event's false flag is authoritative; undefined is unknown.
      if (input[flag] !== false) continue;
      this.keys.delete(name);
      this.keys.delete(`${name}Left`);
      this.keys.delete(`${name}Right`);
    }
  }
  private quiet = (event?: Event) => {
    if (event) this.reconcileModifiers(event);
    this.until = Date.now() + this.quietMs;
    clearTimeout(this.timer);
    this.timer = setTimeout(this.notify, this.quietMs);
    this.notify();
  };
  private keyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    this.reconcileModifiers(event);
    this.keys.add(key.code || key.key || "");
    this.quiet();
  };
  private keyUp = (event: Event) => {
    const key = event as KeyboardEvent;
    this.keys.delete(key.code || key.key || "");
    this.reconcileModifiers(event);
    this.notify();
  };
  private dragStart = (event: Event) => {
    const generation = ++this.dragGeneration;
    this.dragging = true;
    this.quiet(event);
    // A canceled native drag has no later dragend. Read cancellation after the
    // source's bubbling handlers, without releasing a newer drag or disposed owner.
    queueMicrotask(() => {
      if (this.dragGeneration !== generation || !event.defaultPrevented) return;
      this.dragging = false;
      this.notify();
    });
  };
  private dragEnd = (event: Event) => {
    this.dragGeneration++;
    this.dragging = false;
    this.quiet(event);
  };
  private wheel = (event: Event) => {
    this.wheelUntil = Date.now() + 100;
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(this.notify, 100);
    this.quiet(event);
  };
  private down = (event: Event) => {
    this.pointers.add((event as PointerEvent).pointerId ?? 0);
    this.quiet(event);
  };
  private up = (event: Event) => {
    this.pointers.delete((event as PointerEvent).pointerId ?? 0);
    this.quiet(event);
  };
  private blur = () => {
    this.layerIntent = false;
    this.layerUntil = 0;
    this.dragGeneration++;
    this.dragging = false;
    this.pointers.clear();
    this.keys.clear();
    this.wheelUntil = 0;
    clearTimeout(this.wheelTimer);
    this.quiet();
  };
  dispose(): void {
    this.layerIntent = false;
    this.layerUntil = 0;
    this.stopSuspension?.();
    this.stopPresentation();
    this.dragGeneration++;
    this.dragging = false;
    this.keys.clear();
    clearTimeout(this.timer);
    clearTimeout(this.wheelTimer);
    this.surface.removeEventListener("pointermove", this.quiet, true);
    this.surface.removeEventListener("pointerover", this.layerOver, true);
    this.surface.removeEventListener("pointerout", this.layerOut, true);
    this.surface.removeEventListener("pointerdown", this.down, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      this.surface.removeEventListener(type, this.up, true);
    this.surface.removeEventListener("wheel", this.wheel, true);
    this.surface.removeEventListener("keydown", this.keyDown, true);
    this.surface.removeEventListener("keyup", this.keyUp, true);
    this.surface.removeEventListener("dragstart", this.dragStart, true);
    for (const type of ["dragend", "drop"])
      this.surface.removeEventListener(type, this.dragEnd, true);
    this.surface.removeEventListener("blur", this.blur);
    this.surface.document.removeEventListener("visibilitychange", this.notify);
    this.listeners.clear();
  }
}
