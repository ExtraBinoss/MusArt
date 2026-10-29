interface Point { x: number; y: number }
/** One active-input RAF; cached viewport geometry is refreshed only after layout invalidation. */
export function createDragAutoScroll(options: {
  viewport: HTMLElement;
  onScroll: () => void;
  onFrame?: () => void;
  onGeometryChange?: () => void;
  horizontalOnly?: boolean;
  verticalOnly?: boolean;
  leftInset?: number;
  topInset?: number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}) {
  const request = options.requestFrame ?? requestAnimationFrame;
  const cancel = options.cancelFrame ?? cancelAnimationFrame;
  const node = options.viewport;
  let point: Point | null = null;
  let frame: number | null = null;
  let previous: number | null = null;
  let stopped = false;
  let dirty = true;
  let geometry = { left: 0, right: 0, top: 0, bottom: 0, maxX: 0, maxY: 0 };
  function invalidate() { dirty = true; options.onGeometryChange?.(); }
  function measure() {
    if (!dirty) return;
    dirty = false;
    const bounds = node.getBoundingClientRect();
    geometry = { left: bounds.left + (options.leftInset ?? 244), right: bounds.right, top: bounds.top + (options.topInset ?? 32), bottom: bounds.bottom, maxX: Math.max(0, node.scrollWidth - node.clientWidth), maxY: Math.max(0, node.scrollHeight - node.clientHeight) };
  }
  function speed(value: number, start: number, end: number) {
    const edge = Math.min(36, Math.max(8, (end - start) / 4));
    if (end <= start || value < start - edge || value > end + edge) return 0;
    if (value < start + edge) return -720 * Math.min(1, (start + edge - value) / edge) ** 2;
    if (value > end - edge) return 720 * Math.min(1, (value - end + edge) / edge) ** 2;
    return 0;
  }
  function velocity() {
    if (!point) return { x: 0, y: 0 };
    measure();
    let x = options.verticalOnly ? 0 : speed(point.x, geometry.left, geometry.right);
    let y = options.horizontalOnly ? 0 : speed(point.y, geometry.top, geometry.bottom);
    if ((x < 0 && node.scrollLeft <= 0) || (x > 0 && node.scrollLeft >= geometry.maxX)) x = 0;
    if ((y < 0 && node.scrollTop <= 0) || (y > 0 && node.scrollTop >= geometry.maxY)) y = 0;
    return { x, y };
  }
  function tick(now: number) {
    frame = null;
    if (stopped) return;
    const delta = Math.max(0, Math.min(32, previous === null ? 16 : now - previous)) / 1000;
    previous = now;
    const value = velocity(), left = node.scrollLeft, top = node.scrollTop;
    node.scrollLeft = Math.max(0, Math.min(geometry.maxX, left + value.x * delta));
    node.scrollTop = Math.max(0, Math.min(geometry.maxY, top + value.y * delta));
    if (left !== node.scrollLeft || top !== node.scrollTop) options.onScroll();
    options.onFrame?.();
    const next = velocity();
    if (next.x || next.y) frame = request(tick);
    else previous = null;
  }
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidate);
  observer?.observe(node);
  for (const child of node.children) observer?.observe(child);
  const ancestorScroll = (event: Event) => { if (event.target !== node) invalidate(); };
  window.addEventListener("resize", invalidate);
  window.addEventListener("scroll", ancestorScroll, true);
  return {
    update(x: number, y: number) {
      if (stopped) return;
      point = { x, y };
      if (options.onFrame || velocity().x || velocity().y) {
        if (frame === null) frame = request(tick);
      } else if (frame !== null) { cancel(frame); frame = null; previous = null; }
    },
    invalidate,
    stop() {
      if (stopped) return;
      stopped = true;
      if (frame !== null) cancel(frame);
      frame = null; previous = null; point = null;
      observer?.disconnect();
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", ancestorScroll, true);
    },
  };
}
