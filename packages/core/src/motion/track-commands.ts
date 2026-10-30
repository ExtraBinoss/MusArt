import { ensure } from "../errors";
import { assertEditable, getLayer } from "../layers/access";
import { getDescendants } from "../layers/geometry";
import type { CommandHandler } from "../session/context";
import { addMotionTime, compareMotionTime, validateMotionTime } from "./time";

/** Placement shifts animation. Trimming remains the separate setMotionTrackRange command. */
export const moveMotionTrack: CommandHandler<"moveMotionTrack"> = ({ page, pageId }, command) => {
  ensure(page.motion?.mode === "motion", "INVALID_COMMAND", "Composition is not in Motion mode");
  validateMotionTime(command.delta);
  const track = page.motion.tracks.find((item) => item.id === command.trackId);
  ensure(track, "NOT_FOUND", "Track not found");
  const layer = getLayer(page, track.layerId);
  assertEditable(page, layer);
  const affected = new Set(getDescendants(page, [layer.id]).map((item) => item.id));
  affected.add(layer.id);
  const duration = page.motion.duration;
  for (const current of page.motion.tracks) {
    if (page.motion.version === 2 ? current.id !== track.id : !affected.has(current.layerId))
      continue;
    current.start = addMotionTime(current.start, command.delta);
    current.end = addMotionTime(current.end ?? duration, command.delta);
    ensure(current.end.value > 0, "INVALID_COMMAND", "Track lies before the composition");
    if (compareMotionTime(current.end, page.motion.duration) > 0) {
      if (page.motion.version === 2)
        for (const sibling of page.motion.tracks)
          if (
            sibling.layerId === current.layerId &&
            sibling.id !== current.id &&
            sibling.end === null
          )
            sibling.end = { ...page.motion.duration };
      page.motion.duration = current.end;
    }
    for (const property of current.properties)
      for (const key of property.keyframes) {
        key.time = addMotionTime(key.time, command.delta);
        ensure(
          page.motion.version === 2 || key.time.value >= 0,
          "INVALID_COMMAND",
          "Moving this track would place keys before zero",
        );
      }
  }
  return { pageId };
};

/** Batch movement avoids order-dependent collisions and produces one undoable gesture. */
export const moveMotionKeyframes: CommandHandler<"moveMotionKeyframes"> = (
  { page, pageId },
  command,
) => {
  ensure(page.motion?.mode === "motion", "INVALID_COMMAND", "Composition is not in Motion mode");
  validateMotionTime(command.delta);
  ensure(
    Array.isArray(command.keyframeIds) &&
      command.keyframeIds.length > 0 &&
      command.keyframeIds.length <= 100000,
    "INVALID_COMMAND",
    "Invalid keyframe selection",
  );
  const ids = new Set(command.keyframeIds);
  ensure(ids.size === command.keyframeIds.length, "INVALID_COMMAND", "Duplicate selected keyframe");
  let found = 0;
  for (const track of page.motion.tracks)
    for (const property of track.properties) {
      let changed = false;
      for (const key of property.keyframes)
        if (ids.has(key.id)) {
          if (!changed) assertEditable(page, getLayer(page, track.layerId));
          key.time = addMotionTime(key.time, command.delta);
          ensure(
            page.motion.version === 2 || key.time.value >= 0,
            "INVALID_COMMAND",
            "Negative keyframe time",
          );
          found++;
          changed = true;
        }
      if (changed) {
        property.keyframes.sort((a, b) => compareMotionTime(a.time, b.time));
        ensure(
          property.keyframes.every(
            (key, index, keys) =>
              index === 0 || compareMotionTime(keys[index - 1]!.time, key.time) < 0,
          ),
          "INVALID_COMMAND",
          "Keyframe time is already occupied",
        );
      }
    }
  ensure(found === ids.size, "NOT_FOUND", "Selected keyframe not found");
  return { pageId };
};

export const deleteMotionKeyframes: CommandHandler<"deleteMotionKeyframes"> = (
  { page, pageId },
  command,
) => {
  ensure(page.motion?.mode === "motion", "INVALID_COMMAND", "Composition is not in Motion mode");
  ensure(
    Array.isArray(command.keyframeIds) &&
      command.keyframeIds.length > 0 &&
      command.keyframeIds.length <= 100000,
    "INVALID_COMMAND",
    "Invalid keyframe selection",
  );
  const ids = new Set(command.keyframeIds);
  ensure(ids.size === command.keyframeIds.length, "INVALID_COMMAND", "Duplicate selected keyframe");
  let found = 0;
  for (const track of page.motion.tracks)
    for (const property of track.properties) {
      const kept = property.keyframes.filter((key) => !ids.has(key.id));
      if (kept.length !== property.keyframes.length) {
        assertEditable(page, getLayer(page, track.layerId));
        found += property.keyframes.length - kept.length;
        property.keyframes = kept;
      }
    }
  ensure(found === ids.size, "NOT_FOUND", "Selected keyframe not found");
  return { pageId };
};
