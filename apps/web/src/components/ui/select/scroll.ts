/** Native viewport scrolling with pointer-driven edge scrolling; no idle animation loop. */
export function bindSelectScroll(viewport: HTMLElement, content: HTMLElement) {
  const owner = viewport.ownerDocument;
  const window = owner.defaultView;
  if (!window) return () => {};
  const EDGE = 14;
  let bounds: DOMRect | null = null;
  let maximum = 0;
  let usableWidth = 0;
  let point: { x: number; y: number } | null = null;
  let direction = 0;
  let frame: number | null = null;
  let previous: number | null = null;
  let live = true;
  function stop() {
    if (frame !== null) window!.cancelAnimationFrame(frame);
    frame = null;
    previous = null;
    direction = 0;
    point = null;
    content.removeAttribute("data-select-edge-scroll");
  }
  function measure() {
    bounds = viewport.getBoundingClientRect();
    maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    // Reserve overlay scrollbars too. Hovering or dragging the bar never starts edge scrolling.
    const gutter = maximum > 1 ? Math.max(6, viewport.offsetWidth - viewport.clientWidth) : 0;
    usableWidth = Math.max(0, bounds.width - gutter);
  }
  function velocity() {
    if (!point || !bounds || point.x < bounds.left || point.x >= bounds.left + usableWidth)
      return 0;
    if (point.y < bounds.top || point.y > bounds.bottom) return 0;
    if (point.y < bounds.top + EDGE && viewport.scrollTop > 0) return -1;
    if (point.y > bounds.bottom - EDGE && viewport.scrollTop < maximum - 1) return 1;
    return 0;
  }
  function tick(now: number) {
    frame = null;
    if (!live || content.dataset.state === "closed" || owner.hidden) {
      stop();
      return;
    }
    direction = velocity();
    if (!direction) {
      stop();
      return;
    }
    const elapsed = previous === null ? 16 : Math.max(0, Math.min(32, now - previous));
    previous = now;
    // Direct scrollTop writes respect reduced motion: no smooth-scroll animation or inertia.
    viewport.scrollTop = Math.max(
      0,
      Math.min(maximum, viewport.scrollTop + direction * elapsed * 0.36),
    );
    if (velocity()) frame = window!.requestAnimationFrame(tick);
    else stop();
  }
  function hover(event: PointerEvent) {
    if (!live || content.dataset.state === "closed" || owner.hidden) {
      stop();
      return;
    }
    if (event.pointerType !== "mouse" || event.buttons !== 0) {
      stop();
      return;
    }
    if (!bounds) measure();
    point = { x: event.clientX, y: event.clientY };
    direction = velocity();
    if (!direction) {
      stop();
      return;
    }
    content.dataset.selectEdgeScroll = direction < 0 ? "top" : "bottom";
    if (frame === null) frame = window!.requestAnimationFrame(tick);
  }
  function enter(event: PointerEvent) {
    measure();
    hover(event);
  }
  function visibility() {
    if (owner.hidden) stop();
  }
  function moved() {
    stop();
    bounds = null;
  }
  function animation(event: AnimationEvent) {
    if (event.target === content) measure();
  }
  const resize = new ResizeObserver(() => {
    measure();
    if (frame !== null && !velocity()) stop();
  });
  resize.observe(viewport);
  // The options' aggregate height can change without resizing the capped viewport.
  for (const child of viewport.children) resize.observe(child);
  const children = new MutationObserver(() => {
    resize.disconnect();
    resize.observe(viewport);
    for (const child of viewport.children) resize.observe(child);
  });
  children.observe(viewport, { childList: true });
  viewport.addEventListener("pointerenter", enter);
  viewport.addEventListener("pointermove", hover);
  viewport.addEventListener("pointerleave", stop);
  viewport.addEventListener("pointerdown", stop);
  viewport.addEventListener("pointercancel", stop);
  viewport.addEventListener("wheel", stop, { passive: true });
  content.addEventListener("keydown", stop);
  content.addEventListener("animationend", animation);
  window.addEventListener("blur", stop);
  window.addEventListener("resize", moved);
  owner.addEventListener("visibilitychange", visibility);
  return () => {
    live = false;
    stop();
    resize.disconnect();
    children.disconnect();
    viewport.removeEventListener("pointerenter", enter);
    viewport.removeEventListener("pointermove", hover);
    viewport.removeEventListener("pointerleave", stop);
    viewport.removeEventListener("pointerdown", stop);
    viewport.removeEventListener("pointercancel", stop);
    viewport.removeEventListener("wheel", stop);
    content.removeEventListener("keydown", stop);
    content.removeEventListener("animationend", animation);
    window.removeEventListener("blur", stop);
    window.removeEventListener("resize", moved);
    owner.removeEventListener("visibilitychange", visibility);
  };
}
