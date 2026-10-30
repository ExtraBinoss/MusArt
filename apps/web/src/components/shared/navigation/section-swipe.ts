export interface SectionSwipeState {
  value: string;
  values: readonly string[];
  disabled: boolean;
}
interface Options {
  read: () => SectionSwipeState;
  move: (offset: number, index: number) => void;
  rest: () => void;
  select: (value: string) => void;
}
/** Native directional intent keeps vertical scrolling and form editing intact. */
export function bindSectionSwipe(
  surface: HTMLElement,
  options: Options,
): { cancel: () => void; dispose: () => void } {
  let active: {
    id: number;
    x: number;
    y: number;
    width: number;
    value: string;
    index: number;
    values: readonly string[];
    locked: boolean;
  } | null = null;
  let suppressClick = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  function reset() {
    const previous = active;
    active = null;
    if (!previous) return;
    if (previous.locked) {
      suppressClick = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        suppressClick = false;
      }, 350);
    }
    if (previous?.locked && surface.hasPointerCapture(previous.id))
      surface.releasePointerCapture(previous.id);
    options.rest();
  }
  function down(event: PointerEvent) {
    suppressClick = false;
    clearTimeout(timer);
    if (active) {
      reset();
      return;
    }
    const state = options.read();
    if (
      state.disabled ||
      event.button !== 0 ||
      event.isPrimary === false ||
      !["touch", "pen"].includes(event.pointerType)
    )
      return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        'input, textarea, select, [role="slider"], [role="combobox"], [contenteditable="true"], [data-no-section-swipe]',
      )
    )
      return;
    const index = state.values.indexOf(state.value);
    if (index < 0) return;
    active = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: Math.max(1, surface.clientWidth),
      value: state.value,
      index,
      values: [...state.values],
      locked: false,
    };
  }
  function valid() {
    const state = options.read();
    return (
      active &&
      !state.disabled &&
      state.value === active.value &&
      state.values.join("\0") === active.values.join("\0")
    );
  }
  function sample(event: PointerEvent) {
    if (!active || event.pointerId !== active.id) return;
    if (!valid()) {
      reset();
      return;
    }
    const dx = event.clientX - active.x,
      dy = event.clientY - active.y;
    if (!active.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        reset();
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      active.locked = true;
      if (event.type !== "pointerup") surface.setPointerCapture(active.id);
    }
    event.preventDefault();
    const progress = Math.max(
      0,
      Math.min(active.values.length - 1, active.index - dx / active.width),
    );
    options.move(Math.max(-active.width * 0.35, Math.min(active.width * 0.35, dx)), progress);
  }
  function up(event: PointerEvent) {
    if (!active || event.pointerId !== active.id) return;
    sample(event);
    if (!active) return;
    const gesture = active,
      dx = event.clientX - gesture.x;
    const threshold = Math.max(44, Math.min(96, gesture.width * 0.2));
    const next = gesture.values[gesture.index + (dx < 0 ? 1 : -1)];
    const commit = gesture.locked && valid() && Math.abs(dx) >= threshold && next;
    reset();
    if (commit) options.select(commit);
  }
  function cancel(event: PointerEvent) {
    if (active?.id === event.pointerId) reset();
  }
  function lostCapture(event: PointerEvent) {
    if (event.target === surface) cancel(event);
  }
  function click(event: MouseEvent) {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    clearTimeout(timer);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function hidden() {
    if (document.hidden) reset();
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") reset();
  }
  surface.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", sample, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  surface.addEventListener("lostpointercapture", lostCapture);
  surface.addEventListener("click", click, true);
  window.addEventListener("blur", reset);
  window.addEventListener("resize", reset);
  window.addEventListener("keydown", key);
  document.addEventListener("visibilitychange", hidden);
  return {
    cancel: reset,
    dispose: () => {
      reset();
      clearTimeout(timer);
      surface.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", sample);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      surface.removeEventListener("lostpointercapture", lostCapture);
      surface.removeEventListener("click", click, true);
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", reset);
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
    },
  };
}
