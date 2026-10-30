import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  projectMotionProperties,
  addMotionTime,
  getAncestors,
  motionTimeToSeconds,
  subtractMotionTime,
  clampMotionTrackMove,
  planMotionTrackMove,
  type MotionTrackMovePlan,
  type Command,
  type Composition,
  type EnginePort,
  type MotionKeyframe,
  type MotionLayerTrack,
  type MotionTime,
} from "@musart/core";
import type { TimelineTransport } from "./model";
import { timelineTime } from "./time";
import type { TimelineRow } from "./tree";
import { createTimelineMarquee } from "./selection/marquee";
import { createDragAutoScroll } from "../shared/scroll/drag-auto-scroll";
import { createTimelineLinkPreview } from "./link-preview";
import { createTimelineGesturePresentation } from "./gestures/presentation";
import { createTimelineTooltipPreview, renderTimelineGestureTooltip } from "./gestures/tooltip";
import {
  toTimelinePointerInput,
  type TimelinePointerInput,
  type TimelinePointerMove,
} from "./gestures/input";
import {
  acceptsOccurrencePlacement,
  occurrenceMoveTargets,
  timelineGestureBounds,
} from "./gestures/occurrences";
import { nearestTimelineSnap, timelineSnapReferences } from "./gestures/snapping";
import { isTimelineGestureCurrent, type TimelineGestureOrigin } from "./gestures/origin";
export type { TimelinePointerInput, TimelinePointerMove } from "./gestures/input";
type TrackAction = "move" | "trimStart" | "trimEnd";
interface Gesture extends TimelineGestureOrigin {
  node: HTMLElement;
  pointer: number;
  x: number;
  scroll: number;
  page: Composition;
  originalLayers: string[];
  originalKeys: ReadonlySet<string>;
  action: TrackAction | "keys";
  track?: MotionLayerTrack;
  keyIds: string[];
  layerIds: ReadonlySet<string>;
  trackIds: ReadonlySet<string>;
  limits: Pick<MotionTrackMovePlan, "minimum" | "maximum">;
  movePlan?: MotionTrackMovePlan;
  boundary: "start" | "end" | null;
  anchor: MotionTime;
  delta: MotionTime;
  snapped: MotionTime | null;
  references: { seconds: number; time: MotionTime }[];
  touched: Set<HTMLElement>;
  dirty: boolean;
  rejected: boolean;
  stopEngine: () => void;
  scrollLoop: ReturnType<typeof createDragAutoScroll> | null;
  point: { x: number; y: number; shift: boolean };
  preview: ReturnType<NonNullable<TimelineTransport["beginKeyframePreview"]>>;
  tooltip?: ReturnType<typeof createTimelineTooltipPreview>;
  links?: ReturnType<typeof createTimelineLinkPreview>;
}

/** Pointer publication is DOM-only. Commands run once, after ownership is rechecked. */
export function createTimelineGestures(options: {
  engine: EnginePort;
  transport: TimelineTransport;
  compositionId: string;
  onSelection: () => void;
  onError: (message: "changed" | "gestureFailed" | "locked") => void;
  onStart?: () => void;
}) {
  const { engine, transport } = options;
  let surface: {
    root: HTMLElement;
    viewport: HTMLElement;
    scale: number;
    feedback: HTMLOutputElement;
    gutter?: number;
    timeWidth?: number;
  } | null = null;
  const presentation = createTimelineGesturePresentation();
  let selected = new Set<string>();
  let active: Gesture | null = null;
  let ignorePointerClick = false;
  let disposed = false;
  const initial = engine.getSnapshot();
  let origin = { projectId: initial.project.id, revision: initial.revision };
  const marquee = createTimelineMarquee({
    engine,
    compositionId: options.compositionId,
    surface: () => surface,
    origin: () => origin,
    selected: () => selected,
    publish: setSelection,
    onPreview: presentation.marquee,
    onClearPreview: presentation.clearMarquee,
    onStart: () => {
      cancel();
      options.onStart?.();
      transport.pause();
    },
    onChanged: () => options.onError("changed"),
  });

  function setSelection(next: ReadonlySet<string>) {
    if (next === selected) return;
    let same = next.size === selected.size;
    if (same)
      for (const id of next)
        if (!selected.has(id)) {
          same = false;
          break;
        }
    if (same) return;
    selected = new Set(next);
    presentation.notify();
    if (!disposed) options.onSelection();
  }
  function currentPage() {
    const snapshot = engine.getSnapshot();
    return snapshot.pageId === options.compositionId
      ? snapshot.project.pages.find((page) => page.id === options.compositionId)
      : undefined;
  }
  function clear(gesture: Gesture) {
    active = null;
    presentation.clear();
    delete gesture.node.dataset.dragging;
    gesture.stopEngine();
    gesture.scrollLoop?.stop();
    gesture.preview?.clear();
    gesture.links?.clear();
    gesture.tooltip?.dispose();
    gesture.node.removeEventListener("pointermove", updatePointer);
    gesture.node.removeEventListener("pointerup", finish);
    gesture.node.removeEventListener("pointercancel", cancelEvent);
    gesture.node.removeEventListener("lostpointercapture", cancelEvent);
    for (const node of gesture.touched) {
      node.style.removeProperty("--motion-drag-x");
      node.style.removeProperty("--motion-trim-left");
      node.style.removeProperty("--motion-trim-width");
    }
    if (gesture.node.hasPointerCapture(gesture.pointer))
      gesture.node.releasePointerCapture(gesture.pointer);
    const feedback = surface?.feedback;
    if (feedback) feedback.textContent = "";
  }
  function cancel(stale = false) {
    const gesture = active;
    if (!gesture) return;
    clear(gesture);
    setSelection(gesture.originalKeys);
    const snapshot = engine.getSnapshot();
    if (!stale && isTimelineGestureCurrent(snapshot, gesture))
      engine.select(gesture.originalLayers);
    if (stale && !disposed) options.onError("changed");
  }
  function cancelEvent(event: PointerEvent) {
    if (active?.pointer === event.pointerId) cancel();
  }

  function preview(gesture: Gesture) {
    if (!surface) return;
    presentation.render(gesture, surface.root, surface.scale);
    renderTimelineGestureTooltip(surface.feedback, gesture);
  }
  function autoScroll() {
    return surface
      ? createDragAutoScroll({
          viewport: surface.viewport,
          leftInset: surface.gutter,
          horizontalOnly: true,
          onScroll: movePoint,
        })
      : null;
  }
  function movePoint() {
    const gesture = active;
    if (!gesture) return;
    const dx = gesture.point.x - gesture.x + (surface?.viewport?.scrollLeft ?? 0) - gesture.scroll;
    if (!gesture.dirty) {
      if (Math.abs(dx) < 3) return;
      gesture.dirty = true;
      gesture.node.dataset.dragging = "true";
    }
    let delta = timelineTime(dx / (surface?.scale ?? 1));
    gesture.snapped = null;
    if (gesture.point.shift) {
      const target = motionTimeToSeconds(addMotionTime(gesture.anchor, delta));
      const closest = nearestTimelineSnap(
        gesture.references,
        target,
        transport.read().time,
        surface?.scale ?? 1,
      );
      if (closest) {
        delta = subtractMotionTime(closest, gesture.anchor);
        gesture.snapped = closest;
      }
    }
    const clamped = clampMotionTrackMove(gesture.limits, delta);
    delta = clamped.delta;
    gesture.boundary = clamped.boundary;
    if (gesture.boundary) {
      gesture.scrollLoop?.stop();
      gesture.scrollLoop = null;
    }
    if (
      gesture.action === "keys" &&
      gesture.preview?.update(delta, addMotionTime(gesture.anchor, delta)) === false
    ) {
      gesture.rejected = true;
      return;
    }
    if (
      gesture.track &&
      gesture.action !== "keys" &&
      !acceptsOccurrencePlacement(
        gesture.page,
        gesture.track,
        gesture.action,
        delta,
        gesture.movePlan,
      )
    )
      return;
    gesture.rejected = false;
    gesture.delta = delta;
    preview(gesture);
  }
  function updatePointer(event: TimelinePointerMove) {
    if (!active || event.pointerId !== active.pointer) return;
    active.point = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
    movePoint();
    if (active && !active.boundary && !active.scrollLoop) active.scrollLoop = autoScroll();
    active?.scrollLoop?.update(event.clientX, event.clientY);
  }
  function finish(event: PointerEvent) {
    const gesture = active;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const snapshot = engine.getSnapshot();
    if (!isTimelineGestureCurrent(snapshot, gesture)) {
      cancel(true);
      return;
    }
    updatePointer(event);
    if (active !== gesture) return;
    clear(gesture);
    if (gesture.rejected) {
      options.onError("gestureFailed");
      return;
    }
    if (!gesture.dirty || gesture.delta.value === 0) return;
    ignorePointerClick = true;
    let command: Command;
    if (gesture.action === "keys")
      command = { type: "moveMotionKeyframes", keyframeIds: gesture.keyIds, delta: gesture.delta };
    else if (gesture.action === "move")
      command = { type: "moveMotionTrack", trackId: gesture.track!.id, delta: gesture.delta };
    else
      command = {
        type: "setMotionTrackRange",
        trackId: gesture.track!.id,
        start:
          gesture.action === "trimStart"
            ? addMotionTime(gesture.track!.start, gesture.delta)
            : gesture.track!.start,
        end:
          gesture.action === "trimEnd"
            ? addMotionTime(gesture.track!.end ?? gesture.page.motion!.duration, gesture.delta)
            : gesture.track!.end,
      };
    try {
      engine.transaction([command]);
    } catch {
      options.onError("gestureFailed");
    }
  }
  function begin(
    input: TimelinePointerInput,
    data: {
      action: Gesture["action"];
      layerId: string;
      track?: MotionLayerTrack;
      keyIds?: string[];
      anchor: MotionTime;
      originalKeys?: ReadonlySet<string>;
    },
  ) {
    if (disposed || input.button !== 0) return;
    marquee.cancel();
    cancel();
    ignorePointerClick = false;
    const page = currentPage(),
      snapshot = engine.getSnapshot();
    if (snapshot.project.id !== origin.projectId || snapshot.revision !== origin.revision) {
      options.onError("changed");
      return;
    }
    if (!page?.motion || page.motion.mode !== "motion") {
      options.onError("changed");
      return;
    }
    const layer = page.layers.find((item) => item.id === data.layerId);
    if (!layer || layer.locked || getAncestors(page, layer.id).some((parent) => parent.locked)) {
      options.onError("locked");
      return;
    }
    if (
      data.track &&
      page.motion.tracks.find((track) => track.id === data.track!.id) !== data.track
    ) {
      options.onError("changed");
      return;
    }
    options.onStart?.();
    input.node.focus({ preventScroll: true });
    const focused = engine.getSnapshot();
    if (focused.project !== snapshot.project || focused.pageId !== page.id) {
      options.onError("changed");
      return;
    }
    transport.pause();
    let keyPreview: Gesture["preview"];
    let links =
      data.action === "keys"
        ? createTimelineLinkPreview(page, data.keyIds ?? [], () =>
            surface
              ? {
                  root: surface.root,
                  left: surface.viewport.scrollLeft,
                  width: surface.timeWidth ?? 900,
                  scale: surface.scale,
                }
              : null,
          )
        : undefined;
    if (data.action === "keys") {
      try {
        keyPreview = transport.beginKeyframePreview?.(data.keyIds ?? [], {
          onFrame: (frame) => links?.render(frame),
          onRetire: () => {
            if (active?.preview !== keyPreview) return;
            const next = engine.getSnapshot();
            cancel(
              next.project.id !== snapshot.project.id ||
                next.pageId !== page.id ||
                next.revision !== snapshot.revision,
            );
          },
        });
      } catch {
        options.onError("gestureFailed");
        return;
      }
    }
    const originalLayers = [...(input.originalLayers ?? snapshot.selection)];
    engine.select(
      input.shiftKey ? [...new Set([...snapshot.selection, data.layerId])] : [data.layerId],
    );
    const movePlan =
      data.action === "move" && data.track ? planMotionTrackMove(page, data.track.id) : undefined;
    const targets =
      data.action === "move"
        ? occurrenceMoveTargets(page, data.layerId, data.track?.id, movePlan)
        : { layerIds: new Set([data.layerId]), keyIds: [], trackIds: new Set<string>() };
    const { layerIds } = targets;
    const movingKeys = new Set(data.keyIds ?? targets.keyIds);
    if (data.action === "move")
      links = createTimelineLinkPreview(page, [...movingKeys], () =>
        surface
          ? {
              root: surface.root,
              left: surface.viewport.scrollLeft,
              width: surface.timeWidth ?? 900,
              scale: surface.scale,
            }
          : null,
      );
    const references = timelineSnapReferences(page, movingKeys);
    const gesture: Gesture = {
      node: input.node,
      pointer: input.pointerId,
      x: input.clientX,
      scroll: surface?.viewport?.scrollLeft ?? 0,
      project: snapshot.project,
      revision: snapshot.revision,
      installedLayers: engine.getSnapshot().selection,
      page,
      originalLayers,
      originalKeys: data.originalKeys ?? new Set(selected),
      action: data.action,
      ...(data.track ? { track: data.track } : {}),
      keyIds: data.action === "move" ? [...movingKeys] : (data.keyIds ?? []),
      layerIds,
      trackIds: targets.trackIds,
      limits: timelineGestureBounds(page, data.action, data.track, movingKeys, movePlan),
      ...(movePlan ? { movePlan } : {}),
      boundary: null,
      anchor: data.anchor,
      delta: { value: 0, rate: 1 },
      snapped: null,
      references,
      touched: new Set(),
      dirty: false,
      rejected: false,
      stopEngine: () => {},
      scrollLoop: null,
      point: { x: input.clientX, y: input.clientY, shift: input.shiftKey },
      preview: keyPreview,
      ...(links ? { links } : {}),
      tooltip: createTimelineTooltipPreview(input.node, data.action),
    };
    active = gesture;
    gesture.scrollLoop = autoScroll();
    gesture.stopEngine = engine.subscribe(() => {
      const next = engine.getSnapshot();
      if (active === gesture && !isTimelineGestureCurrent(next, gesture)) cancel(true);
    });
    gesture.node.addEventListener("pointermove", updatePointer);
    gesture.node.addEventListener("pointerup", finish);
    gesture.node.addEventListener("pointercancel", cancelEvent);
    gesture.node.addEventListener("lostpointercapture", cancelEvent);
    gesture.node.setPointerCapture(gesture.pointer);
    return true;
  }
  function beginTrackInput(
    input: TimelinePointerInput,
    track: MotionLayerTrack,
    action: TrackAction,
  ) {
    return begin(input, {
      action,
      layerId: track.layerId,
      track,
      anchor:
        action === "trimEnd"
          ? (track.end ?? currentPage()?.motion?.duration ?? track.start)
          : track.start,
    });
  }
  function selectKey(id: string, additive: boolean) {
    const next = additive ? new Set(selected) : new Set<string>();
    if (additive && next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }
  function deleteSelected() {
    if (disposed) return;
    if (active || marquee.isActive()) {
      cancel();
      marquee.cancel();
      return;
    }
    if (!selected.size || !currentPage()?.motion) return;
    const snapshot = engine.getSnapshot();
    if (snapshot.project.id !== origin.projectId || snapshot.revision !== origin.revision) {
      options.onError("changed");
      return;
    }
    try {
      engine.transaction([{ type: "deleteMotionKeyframes", keyframeIds: [...selected] }]);
      setSelection(new Set());
    } catch {
      options.onError("gestureFailed");
    }
  }
  return {
    connect(next: {
      root: HTMLElement;
      viewport: HTMLElement;
      scale: number;
      feedback: HTMLOutputElement;
      gutter?: number;
      timeWidth?: number;
    }) {
      if (surface?.scale !== next.scale) {
        cancel();
        marquee.cancel();
      }
      surface = next;
      disposed = false;
    },
    updateOrigin(projectId: string, revision: number) {
      origin = { projectId, revision };
      const existing = new Set(
        currentPage()?.motion?.tracks.flatMap((track) =>
          projectMotionProperties(track).flatMap((property) =>
            property.keyframes.map((key) => key.id),
          ),
        ) ?? [],
      );
      const kept = new Set([...selected].filter((id) => existing.has(id)));
      if (kept.size !== selected.size) setSelection(kept);
    },
    beginTrackInput,
    updatePointer,
    cancel,
    readPreview: presentation.read,
    readMarqueePreview: presentation.readMarquee,
    subscribePreview: presentation.subscribe,
    readSelected: (): ReadonlySet<string> => selected,
    selectKey,
    deleteSelected,
    selectKeys(ids: readonly string[], additive: boolean) {
      cancel();
      marquee.cancel();
      const next = additive ? new Set(selected) : new Set<string>();
      for (const id of ids) next.add(id);
      setSelection(next);
    },
    beginMarquee(
      event: ReactPointerEvent<HTMLElement>,
      rows: readonly TimelineRow[],
      rowHeight: number,
    ) {
      marquee.begin(event, rows, rowHeight);
    },
    consumePointerClick(detail: number) {
      if (!detail || !ignorePointerClick) return false;
      ignorePointerClick = false;
      return true;
    },
    beginTrack(
      event: ReactPointerEvent<HTMLElement>,
      track: MotionLayerTrack,
      action: TrackAction,
    ) {
      if (beginTrackInput(toTimelinePointerInput(event), track, action)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    beginKey(event: ReactPointerEvent<HTMLElement>, layerId: string, key: MotionKeyframe) {
      if (event.button !== 0) return;
      cancel();
      const originalKeys = new Set(selected);
      if (event.shiftKey || !selected.has(key.id)) selectKey(key.id, event.shiftKey);
      if (!selected.has(key.id)) return;
      if (
        begin(toTimelinePointerInput(event), {
          action: "keys",
          layerId,
          keyIds: [...selected],
          anchor: key.time,
          originalKeys,
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    keyDown(event: ReactKeyboardEvent<HTMLElement>) {
      if (disposed) return;
      if (event.key === "Escape" && (active || marquee.isActive())) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        marquee.cancel();
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,[contenteditable=true],[role=combobox],[role=menu],[role=listbox],[data-slot=popover-content]",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (active || marquee.isActive()) {
        cancel();
        marquee.cancel();
        return;
      }
      deleteSelected();
    },
    dispose() {
      disposed = true;
      cancel();
      marquee.cancel();
      surface = null;
    },
  };
}
export type TimelineGestures = ReturnType<typeof createTimelineGestures>;
