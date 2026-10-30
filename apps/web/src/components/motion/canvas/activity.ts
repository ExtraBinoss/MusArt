/** Input admission owns no render clock and observes wheel even when native scroll is clamped. */
export function createTimelineCanvasActivity(options: {
  readonly viewport: HTMLElement;
  readonly onChange: (active: boolean) => void;
  readonly settleMs?: number;
}) {
  const { viewport, onChange } = options;
  const root = viewport.closest<HTMLElement>(".motion-timeline") ?? viewport;
  const window = viewport.ownerDocument.defaultView;
  if (!window) throw Error("Timeline activity requires a browser document.");
  const settleMs = options.settleMs ?? 180;
  if (!Number.isFinite(settleMs) || settleMs < 160 || settleMs > 200)
    throw RangeError("Invalid timeline waveform idle interval.");
  const pointers = new Set<number>(),
    html = viewport.ownerDocument.documentElement;
  let active = false,
    closed = false,
    pending: number | null = null,
    nativeDrag = false,
    sharedDrag = false;
  const clear = () => {
    if (pending !== null) window.clearTimeout(pending);
    pending = null;
  };
  const publish = (next: boolean) => {
    if (active === next || closed) return;
    active = next;
    onChange(next);
  };
  const settle = () => {
    clear();
    if (pointers.size || nativeDrag || sharedDrag || closed) return;
    pending = window.setTimeout(() => {
      pending = null;
      publish(false);
    }, settleMs);
  };
  const pulse = () => {
    publish(true);
    settle();
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointers.add(event.pointerId ?? 0);
    clear();
    publish(true);
  };
  const up = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId ?? 0)) return;
    settle();
  };
  const endDrag = () => {
    nativeDrag = false;
    pointers.clear();
    if (active) settle();
  };
  const beginDrag = () => {
    nativeDrag = true;
    clear();
    publish(true);
  };
  const leaveDrag = (event: DragEvent) => {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    nativeDrag = false;
    if (active) settle();
  };
  const syncShared = () => {
    if (closed) return;
    sharedDrag = html.dataset.layerReorderActive === "true";
    if (sharedDrag) {
      clear();
      publish(true);
    } else if (active) settle();
  };
  const cancel = (event: KeyboardEvent) => {
    if (event.key === "Escape") endDrag();
  };
  const key = (event: KeyboardEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest(".motion-zoom") &&
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      pulse();
  };
  root.addEventListener("wheel", pulse, { capture: true, passive: true });
  root.addEventListener("pointerdown", down, true);
  root.addEventListener("keydown", key, true);
  root.addEventListener("dragstart", beginDrag, true);
  root.addEventListener("dragover", beginDrag, true);
  root.addEventListener("dragleave", leaveDrag, true);
  viewport.addEventListener("scroll", pulse, { passive: true });
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("lostpointercapture", up, true);
  window.addEventListener("drop", endDrag, true);
  window.addEventListener("dragend", endDrag, true);
  window.addEventListener("dragcancel", endDrag, true);
  window.addEventListener("keydown", cancel, true);
  window.addEventListener("blur", endDrag);
  const observer = new MutationObserver(syncShared);
  observer.observe(html, { attributes: true, attributeFilter: ["data-layer-reorder-active"] });
  syncShared();
  return {
    read: () => active,
    dispose() {
      if (closed) return;
      closed = true;
      clear();
      pointers.clear();
      nativeDrag = false;
      sharedDrag = false;
      observer.disconnect();
      root.removeEventListener("wheel", pulse, true);
      root.removeEventListener("pointerdown", down, true);
      root.removeEventListener("keydown", key, true);
      root.removeEventListener("dragstart", beginDrag, true);
      root.removeEventListener("dragover", beginDrag, true);
      root.removeEventListener("dragleave", leaveDrag, true);
      viewport.removeEventListener("scroll", pulse);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("lostpointercapture", up, true);
      window.removeEventListener("drop", endDrag, true);
      window.removeEventListener("dragend", endDrag, true);
      window.removeEventListener("dragcancel", endDrag, true);
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("blur", endDrag);
      if (active) {
        active = false;
        onChange(false);
      }
    },
  };
}
