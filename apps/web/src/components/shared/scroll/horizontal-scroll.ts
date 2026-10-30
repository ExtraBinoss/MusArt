/** Native viewport gestures and bounded hover work, with no React updates while scrolling. */
export function installHorizontalScroll(root: HTMLElement, viewport: HTMLElement) {
  const shadows = root.dataset.scrollControls === "shadows";
  const left = root.querySelector<HTMLElement>(
      shadows ? ".scroll-shadow-inline-start" : '[data-horizontal-direction="-1"]',
    ),
    right = root.querySelector<HTMLElement>(
      shadows ? ".scroll-shadow-inline-end" : '[data-horizontal-direction="1"]',
    );
  if (!left || !right) return () => {};
  left.dataset.horizontalDirection = "-1";
  right.dataset.horizontalDirection = "1";
  let maximum = 0,
    width = 0,
    frame: number | undefined,
    previous = 0,
    direction = 0,
    suppressClick = false;
  let pan: { id: number; x: number; left: number; dragging: boolean } | null = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function stopHover() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    previous = 0;
    direction = 0;
  }
  function paint() {
    const atStart = viewport.scrollLeft <= 1,
      atEnd = maximum - viewport.scrollLeft <= 1;
    if (left instanceof HTMLButtonElement) left.disabled = atStart;
    if (right instanceof HTMLButtonElement) right.disabled = atEnd;
    left!.toggleAttribute("data-scroll-disabled", atStart);
    right!.toggleAttribute("data-scroll-disabled", atEnd);
    root.toggleAttribute("data-scroll-left", !atStart);
    root.toggleAttribute("data-scroll-right", !atEnd);
    if ((direction < 0 && atStart) || (direction > 0 && atEnd)) stopHover();
  }
  function move(delta: number) {
    const before = viewport.scrollLeft;
    viewport.scrollLeft = Math.min(maximum, Math.max(0, before + delta));
    paint();
    return viewport.scrollLeft !== before;
  }
  function measure() {
    width = viewport.clientWidth;
    maximum = Math.max(0, viewport.scrollWidth - width);
    if (viewport.scrollLeft > maximum) viewport.scrollLeft = maximum;
    paint();
  }
  function tick(time: number) {
    frame = undefined;
    if (!direction || document.hidden) return stopHover();
    const elapsed = previous ? Math.min(40, time - previous) : 16;
    previous = time;
    move(direction * elapsed * 0.28);
    if (direction) frame = requestAnimationFrame(tick);
  }
  function hover(event: PointerEvent) {
    if (event.pointerType !== "mouse" || event.buttons || document.hidden || reduced.matches)
      return;
    const button = event.currentTarget as HTMLElement;
    if (button.hasAttribute("data-scroll-disabled")) return;
    stopHover();
    direction = Number(button.dataset.horizontalDirection);
    frame = requestAnimationFrame(tick);
  }
  function clickArrow(event: Event) {
    stopHover();
    move(Number((event.currentTarget as HTMLButtonElement).dataset.horizontalDirection) * 96);
  }
  function wheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1;
    const delta = (event.deltaX || event.deltaY) * scale;
    stopHover();
    // At either limit the containing page keeps its ordinary wheel behavior.
    if (delta && move(delta)) event.preventDefault();
  }
  function key(event: KeyboardEvent) {
    if (
      event.target !== viewport ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const delta =
      event.key === "ArrowLeft"
        ? -48
        : event.key === "ArrowRight"
          ? 48
          : event.key === "PageUp"
            ? -width
            : event.key === "PageDown"
              ? width
              : event.key === "Home"
                ? -maximum
                : event.key === "End"
                  ? maximum
                  : 0;
    if (!delta) return;
    stopHover();
    if (move(delta)) event.preventDefault();
  }
  function stopPan() {
    const id = pan?.id;
    pan = null;
    root.removeAttribute("data-panning");
    if (id !== undefined && viewport.hasPointerCapture?.(id)) viewport.releasePointerCapture(id);
  }
  function beginPan(event: PointerEvent) {
    if (event.pointerType !== "mouse" || event.button !== 0 || event.defaultPrevented) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'input,textarea,select,[contenteditable="true"],[role="slider"],[draggable="true"]',
      )
    )
      return;
    stopHover();
    stopPan();
    suppressClick = false;
    pan = { id: event.pointerId, x: event.clientX, left: viewport.scrollLeft, dragging: false };
  }
  function movePan(event: PointerEvent) {
    if (!pan || pan.id !== event.pointerId) return;
    const delta = pan.x - event.clientX;
    if (!pan.dragging) {
      if (Math.abs(delta) < 5 || maximum <= 0) return;
      pan.dragging = true;
      root.setAttribute("data-panning", "");
      viewport.setPointerCapture?.(pan.id);
    }
    event.preventDefault();
    move(pan.left + delta - viewport.scrollLeft);
  }
  function endPan(event: PointerEvent) {
    if (!pan || pan.id !== event.pointerId) return;
    suppressClick = pan.dragging && event.type === "pointerup";
    stopPan();
  }
  function clickViewport(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    if (!event.detail) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function cancel() {
    stopHover();
    stopPan();
    suppressClick = false;
  }
  const resize = new ResizeObserver(measure);
  function observe() {
    resize.disconnect();
    resize.observe(viewport);
    for (const child of viewport.children) resize.observe(child);
  }
  const mutation = new MutationObserver(observe);
  mutation.observe(viewport, { childList: true });
  observe();
  measure();
  viewport.addEventListener("scroll", paint, { passive: true });
  viewport.addEventListener("wheel", wheel, { passive: false });
  viewport.addEventListener("keydown", key);
  viewport.addEventListener("pointerdown", beginPan);
  viewport.addEventListener("click", clickViewport, true);
  viewport.addEventListener("lostpointercapture", endPan);
  window.addEventListener("pointermove", movePan);
  window.addEventListener("pointerup", endPan);
  window.addEventListener("pointercancel", endPan);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", cancel);
  reduced.addEventListener("change", cancel);
  for (const button of [left, right]) {
    button.addEventListener("pointerenter", hover);
    button.addEventListener("pointerleave", stopHover);
    button.addEventListener("pointerdown", stopHover);
    button.addEventListener("pointercancel", stopHover);
    button.addEventListener("blur", stopHover);
    if (!shadows) button.addEventListener("click", clickArrow);
  }
  return () => {
    cancel();
    resize.disconnect();
    mutation.disconnect();
    viewport.removeEventListener("scroll", paint);
    viewport.removeEventListener("wheel", wheel);
    viewport.removeEventListener("keydown", key);
    viewport.removeEventListener("pointerdown", beginPan);
    viewport.removeEventListener("click", clickViewport, true);
    viewport.removeEventListener("lostpointercapture", endPan);
    window.removeEventListener("pointermove", movePan);
    window.removeEventListener("pointerup", endPan);
    window.removeEventListener("pointercancel", endPan);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", cancel);
    reduced.removeEventListener("change", cancel);
    for (const button of [left, right]) {
      button.removeEventListener("pointerenter", hover);
      button.removeEventListener("pointerleave", stopHover);
      button.removeEventListener("pointerdown", stopHover);
      button.removeEventListener("pointercancel", stopHover);
      button.removeEventListener("blur", stopHover);
      if (!shadows) button.removeEventListener("click", clickArrow);
    }
  };
}
