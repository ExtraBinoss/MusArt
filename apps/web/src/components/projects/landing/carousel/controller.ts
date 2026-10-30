interface Card {
  node: HTMLElement;
  left: number;
  width: number;
  painted: number;
  transform: string;
  transformPriority: string;
  willChange: string;
  willChangePriority: string;
}
interface Gesture {
  id: number;
  x: number;
  y: number;
  position: number;
  dragged: boolean;
  samples: { x: number; time: number }[];
}
const wrap = (value: number, period: number) => ((value % period) + period) % period;

/** A single retained set of cards forms a ring; only ResizeObserver reads layout. */
export function installCarouselPan(
  node: HTMLElement,
  options: { reducedMotion: boolean; position?: number; autoScroll?: boolean },
): { dispose(): void; position(): number } {
  const cards: Card[] = [...node.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child) => ({
      node: child,
      left: 0,
      width: 0,
      painted: 0,
      transform: child.style.getPropertyValue("transform"),
      transformPriority: child.style.getPropertyPriority("transform"),
      willChange: child.style.getPropertyValue("will-change"),
      willChangePriority: child.style.getPropertyPriority("will-change"),
    }));
  const attributes = new Map(
    [
      "data-carousel",
      "data-carousel-position",
      "data-carousel-moving",
      "data-carousel-auto",
      "data-dragging",
    ].map((name) => [name, node.getAttribute(name)]),
  );
  let position = Number.isFinite(options.position) ? options.position! : 0;
  let period = 0,
    width = 0,
    gap = 0,
    origin = 0;
  let gesture: Gesture | null = null,
    moving = false,
    disposed = false;
  let frame: number | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  const automatic = options.autoScroll !== false;
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let effectiveReduced = options.reducedMotion || reducedQuery.matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  let hovered = finePointer.matches && node.matches(":hover"),
    keyboardFocus = false,
    windowFocused = true;
  let visible = typeof IntersectionObserver === "undefined",
    quietUntil = 0;
  let motionKind: "auto" | "inertia" | null = null;
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  function quiet() {
    quietUntil = performance.now() + 1200;
  }
  function allowed() {
    return (
      automatic &&
      !effectiveReduced &&
      !disposed &&
      visible &&
      windowFocused &&
      !document.hidden &&
      !hovered &&
      !keyboardFocus &&
      !gesture
    );
  }
  function startAuto() {
    if (!allowed() || moving || motionKind || !period) return;
    motionKind = "auto";
    node.setAttribute("data-carousel-auto", "");
    setMoving(true);
    const began = performance.now();
    let previous = began;
    function tick(now: number) {
      frame = null;
      if (motionKind !== "auto") return;
      if (!allowed()) {
        stopFrame();
        setMoving(false);
        return;
      }
      const dt = Math.max(0, Math.min(64, now - previous));
      const from = 0.028 * (1 - Math.exp(-(previous - began) / 500));
      const to = 0.028 * (1 - Math.exp(-(now - began) / 500));
      previous = now;
      position += (from + to) * 0.5 * dt;
      paint();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function queueAuto() {
    clearTimeout(autoTimer);
    autoTimer = undefined;
    if (!allowed() || moving || motionKind || !period) return;
    const delay = Math.max(0, quietUntil - performance.now());
    if (!delay) startAuto();
    else
      autoTimer = setTimeout(() => {
        autoTimer = undefined;
        startAuto();
      }, delay);
  }
  function pauseAuto() {
    clearTimeout(autoTimer);
    autoTimer = undefined;
    if (motionKind === "auto") {
      stopFrame();
      setMoving(false);
    }
  }

  function restoreStyle(card: Card, property: "transform" | "will-change") {
    const value = property === "transform" ? card.transform : card.willChange;
    const priority = property === "transform" ? card.transformPriority : card.willChangePriority;
    if (value) card.node.style.setProperty(property, value, priority);
    else card.node.style.removeProperty(property);
  }
  function setMoving(next: boolean) {
    if (moving === next) return;
    moving = next;
    node.toggleAttribute("data-carousel-moving", next);
    for (const card of cards) {
      if (next) card.node.style.willChange = "transform";
      else restoreStyle(card, "will-change");
    }
    if (!disposed)
      node.dispatchEvent(
        new CustomEvent("musart:carousel-motion", { bubbles: true, detail: { moving: next } }),
      );
  }
  function paint() {
    if (!period || disposed) return;
    position = wrap(position, period);
    for (const card of cards) {
      const left = wrap(card.left - position + card.width + gap, period) - card.width - gap;
      card.painted = left;
      card.node.style.transform = `translate3d(${left - card.left}px, 0, 0)`;
    }
    node.dataset.carouselPosition = String(position);
  }
  function stopFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    motionKind = null;
    node.removeAttribute("data-carousel-auto");
    clearTimeout(autoTimer);
    autoTimer = undefined;
    clearTimeout(settleTimer);
    settleTimer = undefined;
  }
  function settle() {
    stopFrame();
    setMoving(false);
    quiet();
    queueAuto();
  }
  function releaseCapture(id: number) {
    if (node.hasPointerCapture(id)) node.releasePointerCapture(id);
  }
  function halt() {
    const active = gesture;
    gesture = null;
    delete node.dataset.dragging;
    if (active) {
      suppressClick ||= active.dragged;
      releaseCapture(active.id);
    }
    stopFrame();
  }
  function cancel() {
    halt();
    setMoving(false);
  }
  function settleSoon() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      settle();
    }, 100);
  }
  function measure() {
    if (disposed || !cards.length) return;
    cancel();
    const before = period;
    width = node.clientWidth;
    for (const card of cards) {
      card.left = card.node.offsetLeft;
      card.width = card.node.offsetWidth;
    }
    origin = cards[0]!.left;
    const measuredGap = parseFloat(getComputedStyle(node).columnGap);
    gap = Number.isFinite(measuredGap)
      ? measuredGap
      : cards.length > 1
        ? Math.max(0, cards[1]!.left - origin - cards[0]!.width)
        : 0;
    const last = cards[cards.length - 1]!;
    period = Math.max(0, last.left + last.width - origin + gap);
    if (before && period !== before) position = (position / before) * period;
    paint();
    queueAuto();
  }
  function addSample(active: Gesture, x: number, time: number) {
    active.samples.push({ x, time });
    active.samples = active.samples.filter((sample) => time - sample.time <= 120);
  }
  function moveTo(active: Gesture, x: number, time: number) {
    position = active.position - (x - active.x);
    paint();
    if (active.samples[active.samples.length - 1]?.x !== x) addSample(active, x, time);
  }
  function inertia(velocity: number, began: number) {
    motionKind = "inertia";
    let previous = began;
    function tick(now: number) {
      frame = null;
      if (disposed) return;
      const elapsed = Math.max(0, Math.min(64, now - previous));
      previous = now;
      const decay = Math.exp(-elapsed / 260);
      position += velocity * 260 * (1 - decay);
      velocity *= decay;
      paint();
      if (Math.abs(velocity) < 0.025 || now - began >= 1600) {
        settle();
        return;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || !period) return;
    if (gesture && gesture.id !== event.pointerId) {
      cancel();
      return;
    }
    cancel();
    keyboardFocus = false;
    quiet();
    suppressClick = false;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      position,
      dragged: false,
      samples: [{ x: event.clientX, time: performance.now() }],
    };
  }
  function move(event: PointerEvent) {
    const active = gesture;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragged) {
      const dx = event.clientX - active.x,
        dy = event.clientY - active.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        quiet();
        queueAuto();
        return;
      }
      stopFrame();
      active.dragged = true;
      node.dataset.dragging = "true";
      node.setPointerCapture(event.pointerId);
      setMoving(true);
    }
    event.preventDefault();
    moveTo(active, event.clientX, performance.now());
  }
  function up(event: PointerEvent) {
    const active = gesture;
    if (!active || active.id !== event.pointerId) return;
    gesture = null;
    delete node.dataset.dragging;
    releaseCapture(active.id);
    if (!active.dragged) {
      quiet();
      queueAuto();
      return;
    }
    event.preventDefault();
    suppressClick = true;
    const now = performance.now();
    moveTo(active, event.clientX, now);
    const first = active.samples[0],
      last = active.samples[active.samples.length - 1];
    const velocity =
      first && last && now - last.time <= 80 && last.time > first.time
        ? Math.max(-3, Math.min(3, (first.x - last.x) / (last.time - first.time)))
        : 0;
    if (!effectiveReduced && Math.abs(velocity) >= 0.08) inertia(velocity, now);
    else settle();
  }
  function cancelPointer(event: PointerEvent) {
    if (gesture?.id === event.pointerId) {
      cancel();
      quiet();
      queueAuto();
    }
  }
  function click(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    if (event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function wheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey || !period) return;
    const delta =
      event.shiftKey && event.deltaY
        ? event.deltaY
        : Math.abs(event.deltaX) >= Math.abs(event.deltaY)
          ? event.deltaX
          : 0;
    if (!delta) return;
    event.preventDefault();
    quiet();
    halt();
    setMoving(true);
    position += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1);
    paint();
    settleSoon();
  }
  function keyboard(event: KeyboardEvent) {
    if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
      keyboardFocus = true;
      pauseAuto();
      quiet();
    }
    if (
      event.target !== node ||
      !period ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !["ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    halt();
    setMoving(true);
    position += width * 0.78 * (event.key === "ArrowLeft" ? -1 : 1);
    paint();
    settleSoon();
  }
  function focus(event: FocusEvent) {
    keyboardFocus =
      !gesture && event.target instanceof Element && event.target.matches(":focus-visible");
    if (keyboardFocus) pauseAuto();
    if (!period || gesture) return;
    const target = event.target;
    const card = cards.find((item) => target instanceof Node && item.node.contains(target));
    if (!card) return;
    const delta =
      card.painted < 0 || card.width >= width
        ? card.painted
        : card.painted + card.width > width
          ? card.painted + card.width - width
          : 0;
    if (!delta) return;
    stopFrame();
    setMoving(true);
    position += delta;
    paint();
    settleSoon();
  }
  function focusOut(event: FocusEvent) {
    if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
    keyboardFocus = false;
    quiet();
    queueAuto();
  }
  function enter(event: PointerEvent) {
    if (!finePointer.matches || event.pointerType === "touch") return;
    hovered = true;
    pauseAuto();
  }
  function leave() {
    hovered = false;
    quiet();
    queueAuto();
  }
  function pointerCapability() {
    hovered = finePointer.matches && node.matches(":hover");
    pauseAuto();
    quiet();
    queueAuto();
  }
  function reducedCapability() {
    effectiveReduced = reducedQuery.matches;
    cancel();
    if (!effectiveReduced) {
      quiet();
      queueAuto();
    }
  }
  function blur() {
    windowFocused = false;
    cancel();
  }
  function focusWindow() {
    windowFocused = true;
    quiet();
    queueAuto();
  }
  function visibility() {
    if (document.hidden) cancel();
    else {
      quiet();
      queueAuto();
    }
  }
  const intersection =
    automatic && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          if (disposed) return;
          visible = entries.some((entry) => entry.isIntersecting);
          if (!visible) cancel();
          else queueAuto();
        })
      : null;
  node.removeAttribute("data-carousel-auto");
  node.removeAttribute("data-carousel-moving");
  node.removeAttribute("data-dragging");
  node.setAttribute("data-carousel", "true");
  node.dataset.carouselPosition = String(position);
  const observer = new ResizeObserver(measure);
  observer.observe(node);
  intersection?.observe(node);
  for (const card of cards) observer.observe(card.node);
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move, { passive: false });
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", cancelPointer);
  node.addEventListener("lostpointercapture", cancelPointer);
  node.addEventListener("click", click, true);
  node.addEventListener("wheel", wheel, { passive: false });
  node.addEventListener("keydown", keyboard);
  node.addEventListener("focusin", focus);
  node.addEventListener("focusout", focusOut);
  node.addEventListener("pointerenter", enter);
  node.addEventListener("pointerleave", leave);
  finePointer.addEventListener("change", pointerCapability);
  reducedQuery.addEventListener("change", reducedCapability);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focusWindow);
  document.addEventListener("visibilitychange", visibility);
  return {
    position: () => position,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      observer.disconnect();
      intersection?.disconnect();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancelPointer);
      node.removeEventListener("lostpointercapture", cancelPointer);
      node.removeEventListener("click", click, true);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("keydown", keyboard);
      node.removeEventListener("focusin", focus);
      node.removeEventListener("focusout", focusOut);
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
      finePointer.removeEventListener("change", pointerCapability);
      reducedQuery.removeEventListener("change", reducedCapability);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focusWindow);
      document.removeEventListener("visibilitychange", visibility);
      for (const card of cards) {
        restoreStyle(card, "transform");
        restoreStyle(card, "will-change");
      }
      for (const [name, value] of attributes) {
        if (value === null) node.removeAttribute(name);
        else node.setAttribute(name, value);
      }
    },
  };
}
