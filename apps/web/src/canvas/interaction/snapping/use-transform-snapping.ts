import { useCallback, useEffect, useMemo, type RefObject } from "react";
import type { EnginePort, Layer, Point } from "@musart/core";
import type { SceneController } from "../../session/scene-controller";
import type { ViewSource } from "../../viewport/motion";
import { isGestureOriginCurrent, type GestureOrigin } from "../gesture-origin";
import type { Handle, LayerPatch } from "../gestures";
import { snappingPreferences } from "../../../state/snapping/preferences";
import { SnapFeedback } from "./source";
import { TransformSnapping } from "./transform";
export interface TransformGesture {
  origin: GestureOrigin;
  mode: string;
  from: Point;
  current: Point;
  layers: Layer[];
  handle?: Handle;
  snapping?: TransformSnapping;
  modifiers?: { alt: boolean; shift: boolean };
}
/** Preference and modifier events share the pointer's imperative preview path. */
export function useTransformSnapping({
  engine,
  controller,
  view,
  gesture,
  patches: patchesRef,
}: {
  engine: EnginePort;
  controller: SceneController;
  view: ViewSource;
  gesture: RefObject<TransformGesture | null>;
  patches: RefObject<LayerPatch[]>;
}) {
  const feedback = useMemo(() => new SnapFeedback(engine), [engine]);
  const update = useCallback(
    (active: TransformGesture, point: Point, alt: boolean, shift: boolean) => {
      const page = active.origin.project.pages.find((item) => item.id === active.origin.pageId)!;
      const session = (active.snapping ??= new TransformSnapping(page, active.layers));
      const preferences = snappingPreferences.read(),
        threshold = preferences.threshold / view.read().zoom;
      const enabled = preferences.enabled && !alt;
      const result =
        active.mode === "resize"
          ? session.resize(active.handle!, active.from, point, shift, enabled, threshold)
          : session.move(active.from, point, enabled, threshold);
      active.modifiers = { alt, shift };
      patchesRef.current = result.patches;
      feedback.set(active.origin, result.cues);
      controller.setGesture(result.patches);
    },
    [controller, feedback, view, patchesRef],
  );
  useEffect(() => {
    const stop = snappingPreferences.subscribe(() => {
      const active = gesture.current;
      if (
        active &&
        (active.mode === "move" || active.mode === "resize") &&
        isGestureOriginCurrent(engine, active.origin)
      )
        update(
          active,
          active.current,
          active.modifiers?.alt ?? false,
          active.modifiers?.shift ?? false,
        );
      else feedback.clear();
    });
    return () => {
      stop();
      feedback.clear();
    };
  }, [engine, update, feedback, gesture]);
  useEffect(() => {
    const modifiers = (event: KeyboardEvent) => {
      const active = gesture.current;
      if (
        (event.key !== "Alt" && event.key !== "Shift") ||
        !active?.modifiers ||
        (active.mode !== "move" && active.mode !== "resize") ||
        !isGestureOriginCurrent(engine, active.origin)
      )
        return;
      if (active.modifiers.alt !== event.altKey || active.modifiers.shift !== event.shiftKey)
        update(active, active.current, event.altKey, event.shiftKey);
    };
    window.addEventListener("keydown", modifiers);
    window.addEventListener("keyup", modifiers);
    return () => {
      window.removeEventListener("keydown", modifiers);
      window.removeEventListener("keyup", modifiers);
    };
  }, [engine, update, gesture]);
  return { feedback, update };
}
