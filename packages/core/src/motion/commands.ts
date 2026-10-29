import { ensure } from "../errors";
import type { CommandHandler } from "../session/context";
import type { CompositionMotion, MotionPropertyTrack } from "./model";
import type { Composition } from "../document/model";
import type { MotionPropertyTarget } from "./properties/model";
import { resolveMotionProperty, validateMotionValue } from "./properties/registry";
import { addMotionTime, subtractMotionTime, compareMotionTime, validateMotionTime } from "./time";
import { createMotionLayerTrack } from "./initialization";
import { assertEditable, getLayer } from "../layers/access";

function editableMotion(page: Composition): CompositionMotion {
  ensure(page.motion?.mode === "motion", "INVALID_COMMAND", "Composition is not in Motion mode");
  return page.motion;
}

function sameTarget(a: MotionPropertyTarget, b: MotionPropertyTarget): boolean {
  return (
    a.kind === b.kind &&
    a.layerId === b.layerId &&
    a.property === b.property &&
    (a.kind === "layer" || (b.kind !== "layer" && a.effectId === b.effectId))
  );
}

function findKey(page: Composition, id: string): { property: MotionPropertyTrack; index: number } {
  for (const track of editableMotion(page).tracks) {
    for (const property of track.properties) {
      const index = property.keyframes.findIndex((key) => key.id === id);
      if (index >= 0) {
        assertEditable(page, getLayer(page, track.layerId));
        return { property, index };
      }
    }
  }
  ensure(false, "NOT_FOUND", "Keyframe not found");
}

export const setCompositionMode: CommandHandler<"setCompositionMode"> = (
  { project, page, pageId, revision, nextId },
  command,
) => {
  ensure(
    command.mode === "static" || command.mode === "motion",
    "INVALID_COMMAND",
    "Invalid composition mode",
  );
  if (page.motion) {
    ensure(!command.plan, "INVALID_COMMAND", "Motion initialization plan is stale");
    page.motion.mode = command.mode;
    return { pageId };
  }
  if (command.mode === "static") return { pageId };
  const ids = page.layers.map((layer) => layer.id).sort();
  if (command.plan) {
    const plan = command.plan;
    ensure(
      plan.compositionId === page.id &&
        plan.revision === revision &&
        Array.isArray(plan.layerIds) &&
        ids.length === plan.layerIds.length &&
        ids.every((id, index) => id === plan.layerIds[index]),
      "INVALID_COMMAND",
      "Motion initialization plan is stale",
    );
  }
  ensure(
    ids.length <= 3 || (command.plan && command.confirmed === true),
    "INVALID_COMMAND",
    "Motion initialization requires confirmation",
  );
  page.motion = {
    version: 1,
    initialized: true,
    mode: "motion",
    duration: command.plan?.duration ?? { value: 2, rate: 1 },
    frameRate: command.plan?.frameRate ?? { numerator: 30, denominator: 1 },
    tracks: page.layers.map((layer) =>
      createMotionLayerTrack(
        layer.id,
        nextId,
        layer.assetId ? project.assets[layer.assetId] : undefined,
      ),
    ),
  };
  return { pageId };
};

export const setMotionDuration: CommandHandler<"setMotionDuration"> = (
  { page, pageId },
  command,
) => {
  const motion = editableMotion(page);
  validateMotionTime(command.duration);
  ensure(command.duration.value > 0, "INVALID_COMMAND", "Invalid Motion duration");
  motion.duration = command.duration;
  return { pageId };
};

export const setMotionTrackRange: CommandHandler<"setMotionTrackRange"> = (
  { page, pageId },
  command,
) => {
  const track = editableMotion(page).tracks.find((item) => item.id === command.trackId);
  ensure(track, "NOT_FOUND", "Track not found");
  const layer = getLayer(page, track.layerId);
  assertEditable(page, layer);
  // Trimming preserves the source frame at every remaining composition time. Placement has
  // its own command and deliberately keeps the source in-point while shifting animation.
  if (layer.kind === "video" && compareMotionTime(command.start, track.start) !== 0) {
    track.media = {
      mute: false,
      volume: 1,
      ...track.media,
      sourceIn: addMotionTime(
        track.media?.sourceIn ?? { value: 0, rate: 1 },
        subtractMotionTime(command.start, track.start),
      ),
    };
  }
  track.start = command.start;
  track.end = command.end;
  return { pageId };
};

export const setMotionMedia: CommandHandler<"setMotionMedia"> = ({ page, pageId }, command) => {
  const track = editableMotion(page).tracks.find((item) => item.id === command.trackId);
  ensure(track, "NOT_FOUND", "Track not found");
  const layer = getLayer(page, track.layerId);
  assertEditable(page, layer);
  ensure(layer.kind === "video", "INVALID_COMMAND", "Media settings require a video layer");
  track.media = {
    sourceIn: { value: 0, rate: 1 },
    mute: false,
    volume: 1,
    ...track.media,
    ...command.patch,
  };
  return { pageId };
};

export const upsertMotionKeyframe: CommandHandler<"upsertMotionKeyframe"> = (
  { page, pageId, nextId },
  command,
) => {
  const motion = editableMotion(page);
  const descriptor = resolveMotionProperty(page, command.target);
  ensure(descriptor, "INVALID_COMMAND", "Unknown Motion property");
  validateMotionValue(descriptor, command.value);
  validateMotionTime(command.time);
  ensure(command.time.value >= 0, "INVALID_COMMAND", "Negative keyframe time");
  assertEditable(page, getLayer(page, command.target.layerId));
  const track = motion.tracks.find((item) => item.layerId === command.target.layerId);
  ensure(track, "NOT_FOUND", "Layer has no Motion track");
  let property = track.properties.find((item) => sameTarget(item.target, command.target));
  if (!property) {
    property = { id: nextId("property"), target: command.target, keyframes: [] };
    track.properties.push(property);
  }
  const existing = property.keyframes.find(
    (key) => compareMotionTime(key.time, command.time) === 0,
  );
  if (existing) {
    existing.value = command.value;
    if (command.easing !== undefined) existing.easing = command.easing;
  } else {
    property.keyframes.push({
      id: nextId("key"),
      time: command.time,
      value: command.value,
      ...(command.easing === undefined ? {} : { easing: command.easing }),
    });
    property.keyframes.sort((a, b) => compareMotionTime(a.time, b.time));
  }
  return { pageId };
};

export const moveMotionKeyframe: CommandHandler<"moveMotionKeyframe"> = (
  { page, pageId },
  command,
) => {
  const { property, index } = findKey(page, command.keyframeId);
  validateMotionTime(command.time);
  ensure(
    command.time.value >= 0 &&
      !property.keyframes.some(
        (key, i) => i !== index && compareMotionTime(key.time, command.time) === 0,
      ),
    "INVALID_COMMAND",
    "Invalid or occupied keyframe time",
  );
  property.keyframes[index]!.time = command.time;
  property.keyframes.sort((a, b) => compareMotionTime(a.time, b.time));
  return { pageId };
};

export const deleteMotionKeyframe: CommandHandler<"deleteMotionKeyframe"> = (
  { page, pageId },
  command,
) => {
  const { property, index } = findKey(page, command.keyframeId);
  property.keyframes.splice(index, 1);
  return { pageId };
};
