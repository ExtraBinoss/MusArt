interface Point {
  x: number;
  y: number;
}
/** A single bounded frame loop per active gesture, idle everywhere else. */
export function createTimelineAutoScroll(options: {
  viewport: HTMLElement;
  onScroll: () => void;
  horizontalOnly?: boolean;
  leftInset?: number;
  topInset?: number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}) {
  const request = options.requestFrame ?? requestAnimationFrame;
  const cancel = options.cancelFrame ?? cancelAnimationFrame;
  let point: Point | null = null;
  let frame: number | null = null;
  let previous: number | null = null;
  let stopped = false;
  function speed(value: number, start: number, end: number) {
    const edge = Math.min(36, Math.max(8, (end - start) / 4));
    if (end <= start || value < start - edge || value > end + edge) return 0;
    if (value < start + edge) return -720 * Math.min(1, (start + edge - value) / edge) ** 2;
    if (value > end - edge) return 720 * Math.min(1, (value - end + edge) / edge) ** 2;
    return 0;
  }
  function velocity() {
    if (!point) return { x: 0, y: 0 };
    const node = options.viewport,
      bounds = node.getBoundingClientRect();
    let x = speed(point.x, bounds.left + (options.leftInset ?? 244), bounds.right);
    let y = options.horizontalOnly
      ? 0
      : speed(point.y, bounds.top + (options.topInset ?? 32), bounds.bottom);
    if (
      (x < 0 && node.scrollLeft <= 0) ||
      (x > 0 && node.scrollLeft >= node.scrollWidth - node.clientWidth)
    )
      x = 0;
    if (
      (y < 0 && node.scrollTop <= 0) ||
      (y > 0 && node.scrollTop >= node.scrollHeight - node.clientHeight)
    )
      y = 0;
    return { x, y };
  }
  function tick(now: number) {
    frame = null;
    if (stopped) return;
    const delta = Math.max(0, Math.min(32, previous === null ? 16 : now - previous)) / 1000;
    previous = now;
    const value = velocity(),
      node = options.viewport;
    const left = node.scrollLeft,
      top = node.scrollTop;
    node.scrollLeft = Math.max(
      0,
      Math.min(node.scrollWidth - node.clientWidth, left + value.x * delta),
    );
    node.scrollTop = Math.max(
      0,
      Math.min(node.scrollHeight - node.clientHeight, top + value.y * delta),
    );
    if (left !== node.scrollLeft || top !== node.scrollTop) options.onScroll();
    const next = velocity();
    if (next.x || next.y) frame = request(tick);
    else previous = null;
  }
  return {
    update(x: number, y: number) {
      if (stopped) return;
      point = { x, y };
      const value = velocity();
      if (value.x || value.y) {
        if (frame === null) frame = request(tick);
      } else if (frame !== null) {
        cancel(frame);
        frame = null;
        previous = null;
      }
    },
    stop() {
      stopped = true;
      if (frame !== null) cancel(frame);
      frame = null;
      previous = null;
      point = null;
    },
  };
}
