import type { Composition } from "../document/model";
import type { Asset } from "../assets/model";
import { cloneValue } from "../document/immutable";
import { ensure } from "../errors";
import { assertEditable, getLayer } from "../layers/access";
import type { CommandHandler } from "../session/context";
import { createMotionLayerTrack } from "./initialization";
import type { MotionLayerTrack } from "./model";
import { addMotionTime, compareMotionTime, subtractMotionTime, validateMotionTime } from "./time";

/** Version 1 allowed implicit full-duration layers. Materialize those once before v2 editing. */
function promote(
  page: Composition,
  assets: Readonly<Record<string, Asset>>,
  nextId: (prefix: string) => string,
  replacedLayerId?: string,
): void {
  const motion = page.motion!;
  if (motion.version === 2) return;
  const tracked = new Set(motion.tracks.map((track) => track.layerId));
  for (const layer of page.layers)
    if (!tracked.has(layer.id) && layer.id !== replacedLayerId)
      motion.tracks.push(
        createMotionLayerTrack(layer.id, nextId, layer.assetId ? assets[layer.assetId] : undefined),
      );
  motion.version = 2;
}

function editable(page: Composition): void {
  ensure(page.motion?.mode === "motion", "INVALID_COMMAND", "Composition is not in Motion mode");
}

function publish(page: Composition, track: MotionLayerTrack): void {
  const motion = page.motion!;
  const end = track.end ?? motion.duration;
  if (compareMotionTime(end, motion.duration) > 0) {
    // An inherited end must not grow across a newly inserted occurrence on its own row.
    for (const sibling of motion.tracks)
      if (sibling.layerId === track.layerId && sibling.end === null)
        sibling.end = { ...motion.duration };
    motion.duration = { ...end };
  }
  motion.tracks.push(track);
}

export const addMotionOccurrence: CommandHandler<"addMotionOccurrence"> = (
  { page, pageId, project, nextId },
  command,
) => {
  editable(page);
  const layer = getLayer(page, command.layerId);
  assertEditable(page, layer);
  validateMotionTime(command.start);
  if (command.end !== null) validateMotionTime(command.end);
  promote(page, project.assets, nextId, layer.id);
  const track = createMotionLayerTrack(
    layer.id,
    nextId,
    layer.assetId ? project.assets[layer.assetId] : undefined,
  );
  track.start = cloneValue(command.start);
  track.end = cloneValue(command.end);
  publish(page, track);
  return { pageId };
};

/** Copy only temporal channels. Canonical effects, masks, asset and z-order remain shared. */
export const duplicateMotionOccurrence: CommandHandler<"duplicateMotionOccurrence"> = (
  { page, pageId, project, nextId },
  command,
) => {
  editable(page);
  const original = page.motion!.tracks.find((track) => track.id === command.trackId);
  ensure(original, "NOT_FOUND", "Motion occurrence not found");
  assertEditable(page, getLayer(page, original.layerId));
  validateMotionTime(command.start);
  if (command.end !== undefined) validateMotionTime(command.end);
  const delta = subtractMotionTime(command.start, original.start);
  const copy = cloneValue(original);
  copy.id = nextId("track");
  copy.start = cloneValue(command.start);
  copy.end = command.end
    ? cloneValue(command.end)
    : addMotionTime(original.end ?? page.motion!.duration, delta);
  for (const property of copy.properties) {
    property.id = nextId("property");
    for (const key of property.keyframes) {
      key.id = nextId("key");
      key.time = addMotionTime(key.time, delta);
    }
  }
  promote(page, project.assets, nextId);
  publish(page, copy);
  return { pageId };
};

export const deleteMotionOccurrence: CommandHandler<"deleteMotionOccurrence"> = (
  { page, pageId, project, nextId },
  command,
) => {
  editable(page);
  const track = page.motion!.tracks.find((item) => item.id === command.trackId);
  ensure(track, "NOT_FOUND", "Motion occurrence not found");
  assertEditable(page, getLayer(page, track.layerId));
  promote(page, project.assets, nextId);
  page.motion!.tracks = page.motion!.tracks.filter((item) => item.id !== track.id);
  return { pageId };
};
