import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { virtualWindow } from "./virtual-window";
/** Fixed-height presentation rows keep large command catalogs bounded without owning their data. */
export function useVirtualList(
  count: number,
  rowHeight: number,
  viewportRef: RefObject<HTMLDivElement | null>,
  overscan = 4,
  options?: { synchronousScroll?: boolean },
) {
  const synchronousScroll = options?.synchronousScroll ?? false;
  const [position, setPosition] = useState({ top: 0, height: 220 });
  const latest = useRef(position);
  const binding = useRef<{ node: HTMLElement; stop(): void } | null>(null);
  const publish = useCallback(
    (top: number, height: number, synchronous = false) => {
      const previous = latest.current;
      const before = virtualWindow(
        latest.current.top,
        latest.current.height,
        count,
        rowHeight,
        overscan,
      );
      const after = virtualWindow(top, height, count, rowHeight, overscan);
      const next = { top, height };
      latest.current = next;
      if (previous.height === height && before.first === after.first && before.last === after.last)
        return;
      if (synchronous) flushSync(() => setPosition(next));
      else setPosition(next);
    },
    [count, rowHeight, overscan],
  );
  const connect = useCallback(
    (node: HTMLDivElement | null) => {
      if (binding.current?.node === node) return;
      binding.current?.stop();
      binding.current = null;
      if (!node) return;
      const measure = () => {
        if (binding.current?.node === node) publish(node.scrollTop, node.clientHeight || 220);
      };
      const scroll = () => {
        if (binding.current?.node === node)
          publish(node.scrollTop, latest.current.height, synchronousScroll);
      };
      const observer = new ResizeObserver(measure);
      node.addEventListener("scroll", scroll, { passive: true });
      observer.observe(node);
      binding.current = {
        node,
        stop() {
          node.removeEventListener("scroll", scroll);
          observer.disconnect();
        },
      };
      measure();
    },
    [publish, synchronousScroll],
  );
  useLayoutEffect(() => {
    connect(viewportRef.current);
    return () => {
      binding.current?.stop();
      binding.current = null;
    };
  }, [viewportRef, connect]);
  // A leaf's layout effect can precede attachment of its parent's viewport ref.
  useEffect(() => connect(viewportRef.current), [viewportRef, connect]);
  // Portalled lists can attach after their owner's layout effect has already run.
  const attachViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      connect(node);
    },
    [viewportRef, connect],
  );
  const { first, last, totalHeight } = virtualWindow(
    position.top,
    position.height,
    count,
    rowHeight,
    overscan,
  );
  const onScroll = useCallback(
    (event: { currentTarget: HTMLElement }) => {
      const node = event.currentTarget;
      if (viewportRef.current !== node) return;
      publish(node.scrollTop, latest.current.height, synchronousScroll);
    },
    [publish, synchronousScroll, viewportRef],
  );
  return {
    first,
    last,
    height: totalHeight,
    attachViewport,
    onScroll,
  };
}
