/** Resume the actual item under a stationary mouse after scrolling, without an idle frame loop. */
export function bindHoverPreview(
  surface: HTMLElement,
  options: {
    selector?: string;
    enabled?: () => boolean;
    onChange: (target: HTMLElement | null) => void;
  },
) {
  const page = surface.ownerDocument,
    view = page.defaultView!;
  const fine = view.matchMedia("(hover: hover) and (pointer: fine)"),
    reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  let point: { x: number; y: number } | null = null,
    active: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined,
    pressed = false,
    closed = false;
  function publish(next: HTMLElement | null) {
    if (next === active) return;
    active = next;
    options.onChange(next);
  }
  function target(node: EventTarget | null): HTMLElement | null {
    if (!(node instanceof Element) || !surface.contains(node)) return null;
    const found = options.selector ? node.closest<HTMLElement>(options.selector) : surface;
    return found && surface.contains(found) ? found : null;
  }
  function allowed() {
    return (
      !closed &&
      !pressed &&
      !page.hidden &&
      fine.matches &&
      !reduced.matches &&
      (options.enabled?.() ?? true)
    );
  }
  function reconcile() {
    timer = undefined;
    if (!allowed()) return publish(null);
    const hit = point
      ? page.elementFromPoint?.(point.x, point.y)
      : surface.matches(":hover")
        ? surface
        : null;
    publish(
      target(hit) ?? (surface.contains(page.activeElement) ? target(page.activeElement) : null),
    );
  }
  function clear() {
    clearTimeout(timer);
    timer = undefined;
  }
  function stop() {
    clear();
    publish(null);
  }
  function pointer(event: PointerEvent) {
    if ((event.pointerType && event.pointerType !== "mouse") || event.buttons) return;
    point = { x: event.clientX, y: event.clientY };
    if (timer === undefined && allowed()) publish(target(event.target));
  }
  function leave() {
    point = null;
    stop();
  }
  function focus(event: FocusEvent) {
    if (timer === undefined && allowed()) publish(target(event.target));
  }
  function focusOut(event: FocusEvent) {
    if (!(event.relatedTarget instanceof Node) || !surface.contains(event.relatedTarget)) stop();
  }
  function down() {
    pressed = true;
    stop();
  }
  function up() {
    pressed = false;
  }
  function scroll(event: Event) {
    const node = event.target;
    if (
      node !== page &&
      node !== surface &&
      !(node instanceof Element && (node.contains(surface) || surface.contains(node)))
    )
      return;
    stop();
    if (point || surface.matches(":hover") || surface.contains(page.activeElement))
      timer = setTimeout(reconcile, 120);
  }
  function environment() {
    stop();
    if (allowed()) reconcile();
  }
  surface.addEventListener("pointerenter", pointer);
  surface.addEventListener("pointermove", pointer);
  surface.addEventListener("pointerleave", leave);
  surface.addEventListener("focusin", focus);
  surface.addEventListener("focusout", focusOut);
  surface.addEventListener("pointerdown", down);
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);
  view.addEventListener("scroll", scroll, true);
  view.addEventListener("blur", leave);
  page.addEventListener("visibilitychange", environment);
  fine.addEventListener("change", environment);
  reduced.addEventListener("change", environment);
  reconcile();
  return {
    refresh: environment,
    dispose() {
      closed = true;
      stop();
      surface.removeEventListener("pointerenter", pointer);
      surface.removeEventListener("pointermove", pointer);
      surface.removeEventListener("pointerleave", leave);
      surface.removeEventListener("focusin", focus);
      surface.removeEventListener("focusout", focusOut);
      surface.removeEventListener("pointerdown", down);
      view.removeEventListener("pointerup", up);
      view.removeEventListener("pointercancel", up);
      view.removeEventListener("scroll", scroll, true);
      view.removeEventListener("blur", leave);
      page.removeEventListener("visibilitychange", environment);
      fine.removeEventListener("change", environment);
      reduced.removeEventListener("change", environment);
    },
  };
}
