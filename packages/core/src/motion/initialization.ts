import type { Composition, SessionSnapshot } from "../document/model";
import { ensure } from "../errors";
import type { MotionInitializationPlan, MotionLayerTrack } from "./model";
import { validateMotionTime, validateMotionFrameRate, compareMotionTime } from "./time";
import type { MotionTime, MotionFrameRate } from "./time";

/** Pure planning: browser dialogs and noninteractive callers inspect the same set. */
export function planMotionInitialization(
  snapshot: SessionSnapshot,
  duration: MotionTime = { value: 2, rate: 1 },
  frameRate: MotionFrameRate = { numerator: 30, denominator: 1 },
): MotionInitializationPlan {
  validateMotionTime(duration);
  validateMotionFrameRate(frameRate);
  ensure(
    compareMotionTime(duration, { value: 0, rate: 1 }) > 0,
    "INVALID_COMMAND",
    "Invalid duration",
  );
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId);
  ensure(page, "NOT_FOUND", "Composition not found");
  ensure(!page.motion, "INVALID_COMMAND", "Motion is already initialized");
  const layerIds = page.layers.map((layer) => layer.id).sort();
  return {
    compositionId: page.id,
    revision: snapshot.revision,
    layerIds,
    duration: { ...duration },
    frameRate: { ...frameRate },
    requiresConfirmation: layerIds.length > 3,
  };
}

export function createMotionLayerTrack(
  layerId: string,
  nextId: (prefix: string) => string,
): MotionLayerTrack {
  return { id: nextId("track"), layerId, start: { value: 0, rate: 1 }, end: null, properties: [] };
}

/** Keep structural commands coherent, including edits made while Motion is dormant. */
export function reconcileMotionLayers(
  page: Composition,
  nextId: (prefix: string) => string,
  previousLayerIds: ReadonlySet<string>,
): void {
  if (!page.motion) return;
  const layers = new Map(page.layers.map((layer) => [layer.id, layer]));
  page.motion.tracks = page.motion.tracks.filter((track) => layers.has(track.layerId));
  const tracked = new Set(page.motion.tracks.map((track) => track.layerId));
  for (const layer of page.layers) {
    if (!tracked.has(layer.id) && !previousLayerIds.has(layer.id))
      page.motion.tracks.push(createMotionLayerTrack(layer.id, nextId));
  }
  for (const track of page.motion.tracks) {
    const layer = layers.get(track.layerId)!;
    const effects = new Set(layer.effects.map((effect) => effect.id));
    track.properties = track.properties.filter(
      ({ target }) => target.kind === "layer" || effects.has(target.effectId),
    );
  }
}
