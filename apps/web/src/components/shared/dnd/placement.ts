import "./placement.css";

export interface DropPlacement {
  targets: () => readonly HTMLElement[];
  isCurrent: () => boolean;
  subscribe: (listener: () => void) => () => void;
}
let release: (() => void) | null = null;
export function clearDropPlacement() {
  release?.();
}
/** Wait for committed rows, then decorate their final bounds without moving editor content. */
export function showDropPlacement(options: DropPlacement) {
  clearDropPlacement();
  let frame: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stop: (() => void) | null = null;
  let observer: MutationObserver | null = null;
  const halos = new Map<HTMLElement, HTMLElement>();
  const clear = () => {
    if (release !== clear) return;
    release = null;
    if (frame !== null) cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    stop?.();
    observer?.disconnect();
    window.removeEventListener("pagehide", clear);
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
    for (const halo of halos.values()) halo.remove();
    halos.clear();
  };
  function place() {
    if (!options.isCurrent()) {
      clear();
      return;
    }
    for (const [target, halo] of halos) {
      if (!target.isConnected) {
        halo.remove();
        halos.delete(target);
        continue;
      }
      const bounds = target.getBoundingClientRect();
      // Canonical timeline labels also locate the corresponding canvas lane.
      const canvas = target.matches("[data-labels-only=true]")
        ? target.closest("[data-layer-drag-viewport]")?.querySelector("[data-timeline-canvas=true]")
        : null;
      const viewport = target
        .closest("[data-layer-drag-viewport], [data-dock-scroll]")
        ?.getBoundingClientRect();
      const left = Math.max(bounds.left, viewport?.left ?? bounds.left);
      const top = Math.max(bounds.top, viewport?.top ?? bounds.top);
      const right = Math.min(
        canvas ? canvas.getBoundingClientRect().right : bounds.right,
        viewport?.right ?? Infinity,
      );
      const bottom = Math.min(bounds.bottom, viewport?.bottom ?? bounds.bottom);
      Object.assign(halo.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(0, right - left)}px`,
        height: `${Math.max(0, bottom - top)}px`,
      });
      halo.hidden = right <= left || bottom <= top;
    }
    if (!halos.size) clear();
  }
  release = clear;
  window.addEventListener("pagehide", clear);
  stop = options.subscribe(() => {
    if (!options.isCurrent()) clear();
  });
  frame = requestAnimationFrame(() => {
    frame = null;
    if (!options.isCurrent()) {
      clear();
      return;
    }
    for (const target of options.targets()) {
      if (!target.isConnected || halos.has(target)) continue;
      const halo = document.createElement("div");
      halo.className = "dnd-placement-halo";
      halo.setAttribute("aria-hidden", "true");
      halos.set(target, halo);
      document.body.append(halo);
    }
    place();
    if (release !== clear) return;
    observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    timer = setTimeout(clear, 1000);
  });
}
