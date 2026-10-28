import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
export const LAYER_ROW_HEIGHT = 36;
const OVERSCAN = 5;
const windowStart = (top: number) => Math.floor(top / (LAYER_ROW_HEIGHT * OVERSCAN));
export function useVirtualRows(count: number, viewport: RefObject<HTMLDivElement | null>) {
  const metrics = useRef({ top: 0, height: 300 });
  const [position, setPosition] = useState({ top: 0, height: 300 });
  const publish = useCallback((next: { top: number; height: number }) => {
    const previous = metrics.current;
    metrics.current = next;
    if (windowStart(previous.top) !== windowStart(next.top) || previous.height !== next.height)
      setPosition(next);
  }, []);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => publish({ height: node.clientHeight || 300, top: node.scrollTop });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewport, publish]);
  const visible = Math.ceil(position.height / LAYER_ROW_HEIGHT);
  const first = Math.max(
    0,
    Math.min(count - visible, windowStart(position.top) * OVERSCAN) - OVERSCAN,
  );
  const last = Math.min(count, first + visible + OVERSCAN * 2);
  const onScroll = useCallback(
    (event: { currentTarget: HTMLElement }) => {
      publish({ top: event.currentTarget.scrollTop, height: metrics.current.height });
    },
    [publish],
  );
  // The cached viewport dimensions come from ResizeObserver after layout, so a
  // selection change never forces layout just to discover an already-visible row.
  const reveal = useCallback(
    (node: HTMLElement, index: number) => {
      const { top, height } = metrics.current,
        edge = index * LAYER_ROW_HEIGHT;
      if (edge >= top && edge + LAYER_ROW_HEIGHT <= top + height) return;
      const next = Math.max(
        0,
        Math.min(
          Math.max(0, count * LAYER_ROW_HEIGHT - height),
          edge - (height - LAYER_ROW_HEIGHT) / 2,
        ),
      );
      node.scrollTop = next;
      publish({ top: next, height });
    },
    [count, publish],
  );
  const scheduleReveal = useCallback(
    (node: HTMLElement, index: number, isCurrent: () => boolean) => {
      let second: number | undefined;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          if (isCurrent()) reveal(node, index);
        });
      });
      return () => {
        cancelAnimationFrame(first);
        if (second !== undefined) cancelAnimationFrame(second);
      };
    },
    [reveal],
  );
  return {
    first,
    last,
    height: count * LAYER_ROW_HEIGHT,
    onScroll,
    reveal,
    scheduleReveal,
  };
}
