import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import type { TimelineTransport, TimelineUnit } from "./model";
import type { TimelineRow } from "./tree";
import type { TimelineGestures } from "./gestures";
import { createTimelineHoverSource } from "../../state/motion/hover";
import type { TimelineLayerDrag } from "./layer-drag/use-timeline-layer-drag";
import { TimelineRowView } from "./rows/TimelineRowView";
import "./row-hover.css";
import "./layer-drag/layer-drag.css";
export function TimelineRows({
  rows,
  first,
  last,
  rowHeight,
  selected,
  pixelsPerSecond,
  duration,
  left,
  width,
  unit,
  transport,
  onToggle,
  onSelect,
  gestures,
  engine,
  compositionId,
  onError,
  onZoomRange,
  interactive = true,
  drag,
}: {
  rows: readonly TimelineRow[];
  first: number;
  last: number;
  rowHeight: number;
  selected: ReadonlySet<string>;
  pixelsPerSecond: number;
  duration: number;
  left: number;
  width: number;
  unit: TimelineUnit;
  transport: TimelineTransport;
  onToggle: (id: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  gestures?: TimelineGestures;
  engine?: EnginePort;
  compositionId?: string;
  onError?: (message: string) => void;
  onZoomRange?: (start: number, end: number) => void;
  interactive?: boolean;
  drag?: TimelineLayerDrag;
}) {
  const hover = useMemo(() => (engine ? createTimelineHoverSource(engine) : null), [engine]);
  const reduced = !!useReducedMotion();
  const dragPage = drag?.page;
  const geometry = useMemo(
    () => (dragPage ? createLayerGeometryIndex(dragPage) : null),
    [dragPage],
  );
  const hovered = useRef<{ key: string; node: HTMLElement; clear(): void } | null>(null);
  const clearHover = useCallback((key?: string) => {
    const current = hovered.current;
    if (!current || (key !== undefined && current.key !== key)) return;
    hovered.current = null;
    delete current.node.dataset.motionHovered;
    current.clear();
  }, []);
  const showHover = useCallback(
    (key: string, layerId: string, node: HTMLElement) => {
      if (
        hovered.current?.key === key &&
        hovered.current.node === node &&
        (!hover || hover.read()?.layerId === layerId)
      )
        return;
      const clear = hover && compositionId ? hover.show(compositionId, layerId) : () => {};
      clearHover();
      node.dataset.motionHovered = "true";
      hovered.current = { key, node, clear };
    },
    [hover, compositionId, clearHover],
  );
  useLayoutEffect(() => {
    if (hovered.current && !hovered.current.node.isConnected) clearHover();
  });
  useEffect(() => () => clearHover(), [clearHover, hover, compositionId]);

  const snapshot = engine?.getSnapshot();
  const page = dragPage ?? snapshot?.project.pages.find((item) => item.id === compositionId);
  const keySelection = gestures?.readSelected();
  const visible = drag
    ? drag.window(first, last)
    : rows.slice(first, last).map((entry, offset) => ({ entry, at: first + offset }));
  return visible.map(({ entry: row, at }) => (
    <TimelineRowView
      key={row.key}
      row={row}
      top={at * rowHeight}
      height={rowHeight}
      reduced={reduced}
      active={selected.has(row.layer.id)}
      locked={!!geometry?.isLocked(row.layer.id) || row.layer.locked}
      page={page}
      project={snapshot?.project}
      pixelsPerSecond={pixelsPerSecond}
      duration={duration}
      left={left}
      width={width}
      unit={unit}
      transport={transport}
      onToggle={onToggle}
      onSelect={onSelect}
      gestures={gestures}
      engine={engine}
      compositionId={compositionId}
      onError={onError}
      onZoomRange={onZoomRange}
      interactive={interactive}
      drag={drag}
      keySelection={row.kind === "property" ? keySelection : undefined}
      showHover={showHover}
      clearHover={clearHover}
    />
  ));
}
