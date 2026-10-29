import type { PointerEvent as ReactPointerEvent } from "react";
import { createLayerGeometryIndex, type Composition, type EnginePort, type MotionLayerTrack, type Project } from "@musart/core";
import { layerDragController } from "../../layers/drag/controller";
import { layerDragPresentation, type LayerDragPoint } from "../../layers/drag/presentation";
import type { TimelineGestures } from "../gestures";
import type { TimelineTransport } from "../model";

interface Held {
  node: HTMLElement;
  pointer: number;
  start: LayerDragPoint;
  shift: boolean;
  page: Composition;
  project: Project;
  track: MotionLayerTrack;
  phase: "pending" | "reorder";
  originalLayers: readonly string[];
  installedLayers: readonly string[];
  stopEngine(): void;
  stopController(): void;
}
/** Axis choice is made once: vertical stack order and horizontal source time remain separate. */
export function createTimelineLayerPointer(options: {
  engine: EnginePort;
  transport: TimelineTransport;
  compositionId: string;
  gestures: Pick<TimelineGestures, "cancel" | "beginTrackInput" | "updatePointer">;
  run: (action: () => void) => void;
  onError?: (reason: "locked" | "changed") => void;
}) {
  const { engine, gestures } = options;
  const owner = Symbol("pointer-layer-drag");
  const controller = layerDragController(engine);
  const presentation = layerDragPresentation(engine);
  let held: Held | null = null;
  function cleanup() {
    const active = held;
    if (!active) return;
    held = null;
    active.stopEngine(); active.stopController();
    active.node.removeEventListener("pointermove", move);
    active.node.removeEventListener("pointerup", finish);
    active.node.removeEventListener("pointercancel", canceled);
    active.node.removeEventListener("lostpointercapture", canceled);
    window.removeEventListener("keydown", key);
    window.removeEventListener("blur", cancel);
    if (active.node.hasPointerCapture(active.pointer)) active.node.releasePointerCapture(active.pointer);
  }
  function restoreSelection(active: Held | null) {
    const snapshot = engine.getSnapshot();
    if (active && snapshot.project === active.project && snapshot.pageId === active.page.id && snapshot.selection.length === active.installedLayers.length && snapshot.selection.every((id, index) => id === active.installedLayers[index])) engine.select([...active.originalLayers]);
  }
  function cancel() {
    const active = held;
    cleanup(); controller.cancel(owner); presentation.release(owner);
    restoreSelection(active);
  }
  function key(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); cancel(); } }
  function canceled(event: PointerEvent) { if (held?.pointer === event.pointerId) cancel(); }
  function move(event: PointerEvent) {
    const active = held;
    if (!active || active.pointer !== event.pointerId) return;
    const input = { x: event.clientX, y: event.clientY, alt: event.altKey };
    if (active.phase === "pending") {
      const dx = input.x - active.start.x, dy = input.y - active.start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dy) <= Math.abs(dx) * 1.15) {
        cleanup();
        const accepted = gestures.beginTrackInput({ node: active.node, pointerId: active.pointer, clientX: active.start.x, clientY: active.start.y, button: 0, shiftKey: active.shift, originalLayers: active.originalLayers }, active.track, "move");
        if (accepted) gestures.updatePointer({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey });
        else restoreSelection(active);
        return;
      }
      if (!controller.begin(owner, active.page, active.track.layerId, options.run)) { cancel(); return; }
      active.phase = "reorder";
      presentation.start(owner, active.node, active.page.layers.find((layer) => layer.id === active.track.layerId)!.name, active.start, true);
      active.stopController = controller.subscribe(() => { if (!controller.owns(owner)) cancel(); });
    }
    presentation.move(input);
  }
  function finish(event: PointerEvent) {
    const active = held;
    if (!active || active.pointer !== event.pointerId) return;
    if (active.phase === "pending") {
      cleanup();
      return;
    }
    presentation.move({ x: event.clientX, y: event.clientY, alt: event.altKey });
    presentation.flush();
    active.stopController(); active.stopController = () => {};
    controller.finish(active.track.layerId);
    cleanup();
  }
  return {
    begin(event: ReactPointerEvent<HTMLElement>, track: MotionLayerTrack) {
      if (event.button !== 0) return;
      cancel(); gestures.cancel();
      const snapshot = engine.getSnapshot();
      const page = snapshot.project.pages.find((item) => item.id === options.compositionId);
      if (snapshot.pageId !== options.compositionId || !page || page.motion?.mode !== "motion") { options.onError?.("changed"); return; }
      if (page.motion.tracks.find((item) => item.id === track.id && item.layerId === track.layerId) !== track) { options.onError?.("changed"); return; }
      const geometry = createLayerGeometryIndex(page);
      if (!geometry.byId.has(track.layerId) || geometry.isLocked(track.layerId)) { options.onError?.("locked"); return; }
      event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
      options.transport.pause();
      const installedLayers = event.shiftKey ? [...new Set([...snapshot.selection, track.layerId])] : [track.layerId];
      engine.select(installedLayers);
      const active: Held = { node: event.currentTarget, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY, alt: event.altKey }, shift: event.shiftKey, page, project: snapshot.project, track, phase: "pending", originalLayers: snapshot.selection, installedLayers, stopEngine: () => {}, stopController: () => {} };
      held = active;
      active.stopEngine = engine.subscribe(() => {
        const next = engine.getSnapshot();
        if (held === active && (next.project !== active.project || next.pageId !== active.page.id)) cancel();
      });
      active.node.addEventListener("pointermove", move);
      active.node.addEventListener("pointerup", finish);
      active.node.addEventListener("pointercancel", canceled);
      active.node.addEventListener("lostpointercapture", canceled);
      window.addEventListener("keydown", key);
      window.addEventListener("blur", cancel);
      active.node.setPointerCapture(active.pointer);
    },
    cancel,
    dispose: cancel,
  };
}
