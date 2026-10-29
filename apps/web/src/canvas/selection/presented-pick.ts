import { createLayerGeometryIndex, type EnginePort, type Point } from "@musart/core";
import { createMotionTransport } from "../../services/motion/transport";
import { attachmentSelection } from "../../state/selection/attachments";
import { clickSelection } from "../interaction/gestures";
import type { SceneFrame } from "../session/scene-controller";
import { canvasHit } from "./hit";

/** Handles start from the displayed pose, while their canonical origin still owns the commit. */
export function editablePresentedLayer(frame: SceneFrame, id: string | undefined) {
  if (frame.playback || !id) return null;
  const geometry = createLayerGeometryIndex(frame.page),
    layer = geometry.byId.get(id);
  return layer && !layer.maskSource && geometry.isVisible(id) && !geometry.isLocked(id)
    ? layer
    : null;
}

/** Authored Motion permits session-only picking during Play. Replay keeps its editing boundary. */
export function pickMotionPlayback(
  engine: EnginePort,
  frame: SceneFrame,
  point: Point,
  event: Pick<PointerEvent, "button" | "shiftKey" | "ctrlKey" | "metaKey">,
): void {
  if (!frame.playback || event.button !== 0 || !createMotionTransport(engine).read().playing)
    return;
  const snapshot = engine.getSnapshot(),
    page = frame.page;
  if (
    snapshot.pageId !== page.id ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > page.width ||
    point.y > page.height
  )
    return;
  const hit = canvasHit(page, point, true)?.layer;
  const canonical = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  if (hit && !createLayerGeometryIndex(canonical).byId.has(hit.id)) return;
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  attachmentSelection(engine).clear();
  if (hit) engine.select(clickSelection(snapshot.selection, hit.id, additive));
  else if (!additive) engine.select([]);
}
