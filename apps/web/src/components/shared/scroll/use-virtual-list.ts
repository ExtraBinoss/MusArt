import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
/** Fixed-height presentation rows keep large command catalogs bounded without owning their data. */
export function useVirtualList(
  count: number,
  rowHeight: number,
  viewport: RefObject<HTMLDivElement | null>,
  overscan = 4,
) {
  const [position, setPosition] = useState({ top: 0, height: 220 });
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () =>
      setPosition((current) => {
        const height = node.clientHeight || 220,
          top = node.scrollTop;
        return current.height === height && current.top === top ? current : { height, top };
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewport]);
  const visible = Math.ceil(position.height / rowHeight);
  const first = Math.max(
    0,
    Math.min(count - visible, Math.floor(position.top / rowHeight)) - overscan,
  );
  const onScroll = useCallback((event: { currentTarget: HTMLElement }) => {
    const node = event.currentTarget;
    setPosition({ top: node.scrollTop, height: node.clientHeight || 220 });
  }, []);
  return {
    first,
    last: Math.min(count, first + visible + overscan * 2),
    height: count * rowHeight,
    onScroll,
  };
}
