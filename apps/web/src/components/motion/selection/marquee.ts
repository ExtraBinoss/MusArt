import type { PointerEvent as ReactPointerEvent } from "react";
import type { EnginePort } from "@musart/core";
import type { TimelineRow } from "../tree";
import { createTimelineSelectionIndex, selectedRangeKeys, type KeyRange } from "./ranges";
import { createDragAutoScroll } from "../../shared/scroll/drag-auto-scroll";

interface Surface {
  root: HTMLElement;
  viewport: HTMLElement;
  scale: number;
  gutter?: number;
}
interface Marquee {
  node: HTMLElement;
  pointer: number;
  projectId: string;
  revision: number;
  start: { x: number; y: number };
  point: { x: number; y: number };
  base: ReadonlySet<string>;
  box: HTMLDivElement;
  ranges: KeyRange[];
  index: ReturnType<typeof createTimelineSelectionIndex>;
  surface: Surface;
  touched: Set<HTMLElement>;
  stopEngine: () => void;
  scroll: ReturnType<typeof createDragAutoScroll>;
  dirty: boolean;
}

/** Rectangle previews keep index ranges, not a freshly allocated 100k-key set per event. */
export function createTimelineMarquee(options: {
  engine: EnginePort;
  compositionId: string;
  surface: () => Surface | null;
  origin: () => { projectId: string; revision: number };
  selected: () => ReadonlySet<string>;
  publish: (value: ReadonlySet<string>) => void;
  onStart: () => void;
  onChanged: () => void;
  onPreview?: (ranges: readonly KeyRange[], base: ReadonlySet<string>) => void;
  onClearPreview?: () => void;
}) {
  let active: Marquee | null = null;
  function coordinate(node: HTMLElement, surface: Surface, x: number, y: number) {
    const bounds = node.getBoundingClientRect();
    return {
      x: Math.max(0, x - bounds.left - (surface.gutter ?? 244)),
      y: Math.max(0, y - bounds.top),
    };
  }
  function cleanup(gesture: Marquee) {
    active = null;
    options.onClearPreview?.();
    gesture.scroll.stop();
    gesture.stopEngine();
    gesture.node.removeEventListener("pointermove", move);
    gesture.node.removeEventListener("pointerup", finish);
    gesture.node.removeEventListener("pointercancel", cancelEvent);
    gesture.node.removeEventListener("lostpointercapture", cancelEvent);
    for (const node of gesture.touched) delete node.dataset.keyPreview;
    gesture.box.remove();
    if (gesture.node.hasPointerCapture(gesture.pointer))
      gesture.node.releasePointerCapture(gesture.pointer);
  }
  function cancel() {
    if (active) cleanup(active);
  }
  function cancelEvent(event: PointerEvent) {
    if (active?.pointer === event.pointerId) cancel();
  }
  function preview() {
    const gesture = active;
    if (!gesture) return;
    const point = coordinate(gesture.node, gesture.surface, gesture.point.x, gesture.point.y);
    const x = Math.min(gesture.start.x, point.x),
      y = Math.min(gesture.start.y, point.y);
    const width = Math.abs(point.x - gesture.start.x),
      height = Math.abs(point.y - gesture.start.y);
    gesture.dirty ||= width >= 3 || height >= 3;
    if (!gesture.dirty) return;
    Object.assign(gesture.box.style, {
      left: `${x + (gesture.surface.gutter ?? 244)}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
      display: "block",
    });
    gesture.ranges = gesture.index.query({
      top: y,
      bottom: y + height,
      start: Math.max(0, (x - 4) / gesture.surface.scale),
      end: (x + width + 4) / gesture.surface.scale,
    });
    options.onPreview?.(gesture.ranges, gesture.base);
    const byProperty = new Map(gesture.ranges.map((range) => [range.propertyId, range]));
    for (const node of gesture.surface.root.querySelectorAll<HTMLElement>(
      ".motion-key[data-property-id]",
    )) {
      const range = byProperty.get(node.dataset.propertyId!);
      const first = Number(node.dataset.firstKeyIndex),
        after = Number(node.dataset.afterKeyIndex);
      const hit = !!range && range.first < after && range.after > first;
      const base =
        gesture.base.has(node.dataset.keyId!) ||
        (node.classList.contains("is-key-selected") && gesture.base.size > 0);
      node.dataset.keyPreview = hit || base ? "selected" : "empty";
      gesture.touched.add(node);
    }
  }
  function move(event: PointerEvent) {
    if (!active || active.pointer !== event.pointerId) return;
    active.point = { x: event.clientX, y: event.clientY };
    preview();
    active.scroll.update(event.clientX, event.clientY);
  }
  function finish(event: PointerEvent) {
    const gesture = active;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const next = options.engine.getSnapshot();
    if (
      next.project.id !== gesture.projectId ||
      next.pageId !== options.compositionId ||
      next.revision !== gesture.revision
    ) {
      cleanup(gesture);
      options.onChanged();
      return;
    }
    const keys = selectedRangeKeys(gesture.ranges, gesture.base);
    cleanup(gesture);
    options.publish(keys);
  }
  return {
    isActive: () => active !== null,
    cancel,
    begin(event: ReactPointerEvent<HTMLElement>, rows: readonly TimelineRow[], rowHeight: number) {
      // Portalled editors bubble through React's row tree but do not belong to this viewport.
      if (
        event.button !== 0 ||
        !event.currentTarget.contains(event.target as Node) ||
        (event.target as HTMLElement).closest("button,input,.motion-row-label")
      )
        return;
      const surface = options.surface();
      if (!surface) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left + (surface.gutter ?? 244)) return;
      const snapshot = options.engine.getSnapshot(),
        origin = options.origin();
      if (
        snapshot.project.id !== origin.projectId ||
        snapshot.revision !== origin.revision ||
        snapshot.pageId !== options.compositionId
      ) {
        options.onChanged();
        return;
      }
      cancel();
      options.onStart();
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      const box = document.createElement("div");
      box.className = "motion-marquee";
      box.style.display = "none";
      box.setAttribute("aria-hidden", "true");
      event.currentTarget.append(box);
      const node = event.currentTarget;
      const gesture: Marquee = {
        node,
        pointer: event.pointerId,
        projectId: snapshot.project.id,
        revision: snapshot.revision,
        start: coordinate(node, surface, event.clientX, event.clientY),
        point: { x: event.clientX, y: event.clientY },
        base: event.shiftKey ? new Set(options.selected()) : new Set(),
        box,
        ranges: [],
        index: createTimelineSelectionIndex(rows, rowHeight),
        surface,
        touched: new Set(),
        stopEngine: () => {},
        dirty: false,
        scroll: createDragAutoScroll({
          viewport: surface.viewport,
          leftInset: surface.gutter,
          onScroll: preview,
        }),
      };
      active = gesture;
      gesture.stopEngine = options.engine.subscribe(() => {
        const current = options.engine.getSnapshot();
        if (
          active === gesture &&
          (current.project.id !== gesture.projectId ||
            current.revision !== gesture.revision ||
            current.pageId !== options.compositionId)
        ) {
          cancel();
          options.onChanged();
        }
      });
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", finish);
      node.addEventListener("pointercancel", cancelEvent);
      node.addEventListener("lostpointercapture", cancelEvent);
      node.setPointerCapture(event.pointerId);
    },
  };
}
