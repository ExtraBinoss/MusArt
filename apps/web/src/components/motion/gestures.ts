import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  addMotionTime,
  compareMotionTime,
  getAncestors,
  getDescendants,
  motionTimeToSeconds,
  subtractMotionTime,
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
import { createTimelineAutoScroll } from "./selection/autoscroll";

type TrackAction = "move" | "trimStart" | "trimEnd";
interface Gesture {
  node: HTMLElement;
  pointer: number;
  x: number;
  scroll: number;
  revision: number;
  projectId: string;
  page: Composition;
  originalLayers: string[];
  originalKeys: ReadonlySet<string>;
  action: TrackAction | "keys";
  track?: MotionLayerTrack;
  keyIds: string[];
  layerIds: ReadonlySet<string>;
  anchor: MotionTime;
  delta: MotionTime;
  snapped: MotionTime | null;
  references: { seconds: number; time: MotionTime }[];
  touched: Set<HTMLElement>;
  dirty: boolean;
  stopEngine: () => void;
  scrollLoop: ReturnType<typeof createTimelineAutoScroll> | null;
  point: { x: number; y: number; shift: boolean };
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
  } | null = null;
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
    onStart: () => {
      cancel();
      options.onStart?.();
      transport.pause();
    },
    onChanged: () => options.onError("changed"),
  });

  function setSelection(next: ReadonlySet<string>) {
    selected = new Set(next);
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
    gesture.stopEngine();
    gesture.scrollLoop?.stop();
    gesture.node.removeEventListener("pointermove", move);
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
    if (
      !stale &&
      snapshot.project.id === gesture.projectId &&
      snapshot.pageId === gesture.page.id &&
      snapshot.revision === gesture.revision
    )
      engine.select(gesture.originalLayers);
    if (stale && !disposed) options.onError("changed");
  }
  function cancelEvent(event: PointerEvent) {
    if (active?.pointer === event.pointerId) cancel();
  }

  function preview(gesture: Gesture) {
    const root = surface?.root;
    if (!root) return;
    const px = motionTimeToSeconds(gesture.delta) * (surface?.scale ?? 1);
    if (gesture.action === "keys") {
      const ids = new Set(gesture.keyIds);
      for (const node of root.querySelectorAll<HTMLElement>(".motion-key[data-key-id]")) {
        if (!ids.has(node.dataset.keyId!)) continue;
        node.style.setProperty("--motion-drag-x", `${px}px`);
        gesture.touched.add(node);
      }
    } else if (gesture.action === "move") {
      for (const node of root.querySelectorAll<HTMLElement>(".motion-row[data-layer-id]")) {
        if (!gesture.layerIds.has(node.dataset.layerId!)) continue;
        node.style.setProperty("--motion-drag-x", `${px}px`);
        gesture.touched.add(node);
      }
    } else {
      const track = gesture.track!,
        end = track.end ?? gesture.page.motion!.duration;
      const startTime =
        gesture.action === "trimStart" ? addMotionTime(track.start, gesture.delta) : track.start;
      const endTime = gesture.action === "trimEnd" ? addMotionTime(end, gesture.delta) : end;
      for (const node of root.querySelectorAll<HTMLElement>(".motion-track-wrap[data-track-id]")) {
        if (node.dataset.trackId !== track.id) continue;
        node.style.setProperty(
          "--motion-trim-left",
          `${motionTimeToSeconds(startTime) * (surface?.scale ?? 1)}px`,
        );
        node.style.setProperty(
          "--motion-trim-width",
          `${(motionTimeToSeconds(endTime) - motionTimeToSeconds(startTime)) * (surface?.scale ?? 1)}px`,
        );
        gesture.touched.add(node);
      }
    }
    const feedback = surface?.feedback;
    if (feedback)
      feedback.textContent = `${motionTimeToSeconds(addMotionTime(gesture.anchor, gesture.delta)).toFixed(3)} s${gesture.snapped ? " ◇" : ""}`;
  }
  function movePoint() {
    const gesture = active;
    if (!gesture) return;
    const dx = gesture.point.x - gesture.x + (surface?.viewport?.scrollLeft ?? 0) - gesture.scroll;
    gesture.dirty ||= Math.abs(dx) >= 3;
    if (!gesture.dirty) return;
    let delta = timelineTime(dx / (surface?.scale ?? 1));
    gesture.snapped = null;
    if (gesture.point.shift) {
      const target = motionTimeToSeconds(addMotionTime(gesture.anchor, delta));
      let low = 0,
        high = gesture.references.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (gesture.references[middle]!.seconds < target) low = middle + 1;
        else high = middle;
      }
      const candidates = [
        gesture.references[low - 1],
        gesture.references[low],
        { seconds: motionTimeToSeconds(transport.read().time), time: transport.read().time },
      ].filter((value) => value !== undefined);
      const closest = candidates.sort(
        (a, b) => Math.abs(a.seconds - target) - Math.abs(b.seconds - target),
      )[0];
      if (closest && Math.abs(closest.seconds - target) * (surface?.scale ?? 1) <= 6) {
        delta = subtractMotionTime(closest.time, gesture.anchor);
        gesture.snapped = closest.time;
      }
    }
    if (gesture.action === "trimStart") {
      const end = gesture.track!.end ?? gesture.page.motion!.duration;
      const candidate = addMotionTime(gesture.anchor, delta);
      if (candidate.value < 0 || compareMotionTime(candidate, end) >= 0) return;
    }
    if (
      gesture.action === "trimEnd" &&
      compareMotionTime(addMotionTime(gesture.anchor, delta), gesture.track!.start) <= 0
    )
      return;
    gesture.delta = delta;
    preview(gesture);
  }
  function move(event: PointerEvent) {
    if (!active || event.pointerId !== active.pointer) return;
    active.point = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
    movePoint();
    active?.scrollLoop?.update(event.clientX, event.clientY);
  }
  function finish(event: PointerEvent) {
    const gesture = active;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const snapshot = engine.getSnapshot();
    const stale =
      snapshot.project.id !== gesture.projectId ||
      snapshot.pageId !== gesture.page.id ||
      snapshot.revision !== gesture.revision;
    if (stale) {
      cancel(true);
      return;
    }
    clear(gesture);
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
    event: ReactPointerEvent<HTMLElement>,
    data: {
      action: Gesture["action"];
      layerId: string;
      track?: MotionLayerTrack;
      keyIds?: string[];
      anchor: MotionTime;
      originalKeys?: ReadonlySet<string>;
    },
  ) {
    if (disposed || event.button !== 0) return;
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
    options.onStart?.();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    transport.pause();
    const originalLayers = [...snapshot.selection];
    engine.select(
      event.shiftKey ? [...new Set([...snapshot.selection, data.layerId])] : [data.layerId],
    );
    const layerIds = new Set(
      data.action === "move"
        ? getDescendants(page, [data.layerId]).map((item) => item.id)
        : [data.layerId],
    );
    layerIds.add(data.layerId);
    const movingKeys = new Set(
      data.keyIds ??
        (data.action === "move"
          ? page.motion.tracks
              .filter((track) => layerIds.has(track.layerId))
              .flatMap((track) =>
                track.properties.flatMap((property) => property.keyframes.map((key) => key.id)),
              )
          : []),
    );
    const references = [
      { seconds: 0, time: { value: 0, rate: 1 } },
      { seconds: motionTimeToSeconds(page.motion.duration), time: page.motion.duration },
    ];
    for (const track of page.motion.tracks)
      for (const property of track.properties)
        for (const key of property.keyframes)
          if (!movingKeys.has(key.id))
            references.push({ seconds: motionTimeToSeconds(key.time), time: key.time });
    references.sort((a, b) => a.seconds - b.seconds);
    const gesture: Gesture = {
      node: event.currentTarget,
      pointer: event.pointerId,
      x: event.clientX,
      scroll: surface?.viewport?.scrollLeft ?? 0,
      projectId: snapshot.project.id,
      revision: snapshot.revision,
      page,
      originalLayers,
      originalKeys: data.originalKeys ?? new Set(selected),
      action: data.action,
      ...(data.track ? { track: data.track } : {}),
      keyIds: data.keyIds ?? [],
      layerIds,
      anchor: data.anchor,
      delta: { value: 0, rate: 1 },
      snapped: null,
      references,
      touched: new Set(),
      dirty: false,
      stopEngine: () => {},
      scrollLoop: null,
      point: { x: event.clientX, y: event.clientY, shift: event.shiftKey },
    };
    active = gesture;
    if (surface)
      gesture.scrollLoop = createTimelineAutoScroll({
        viewport: surface.viewport,
        leftInset: surface.gutter,
        horizontalOnly: true,
        onScroll: movePoint,
      });
    gesture.stopEngine = engine.subscribe(() => {
      const next = engine.getSnapshot();
      if (
        active === gesture &&
        (next.revision !== gesture.revision ||
          next.project.id !== gesture.projectId ||
          next.pageId !== gesture.page.id)
      )
        cancel(true);
    });
    gesture.node.addEventListener("pointermove", move);
    gesture.node.addEventListener("pointerup", finish);
    gesture.node.addEventListener("pointercancel", cancelEvent);
    gesture.node.addEventListener("lostpointercapture", cancelEvent);
    gesture.node.setPointerCapture(gesture.pointer);
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
          track.properties.flatMap((property) => property.keyframes.map((key) => key.id)),
        ) ?? [],
      );
      const kept = new Set([...selected].filter((id) => existing.has(id)));
      if (kept.size !== selected.size) setSelection(kept);
    },
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
      begin(event, {
        action,
        layerId: track.layerId,
        track,
        anchor:
          action === "trimEnd"
            ? (track.end ?? currentPage()?.motion?.duration ?? track.start)
            : track.start,
      });
    },
    beginKey(event: ReactPointerEvent<HTMLElement>, layerId: string, key: MotionKeyframe) {
      if (event.button !== 0) return;
      cancel();
      const originalKeys = new Set(selected);
      if (event.shiftKey || !selected.has(key.id)) selectKey(key.id, event.shiftKey);
      if (!selected.has(key.id)) return;
      begin(event, {
        action: "keys",
        layerId,
        keyIds: [...selected],
        anchor: key.time,
        originalKeys,
      });
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
          "input,textarea,[contenteditable=true],[role=combobox],[data-slot=popover-content]",
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
