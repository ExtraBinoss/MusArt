import { cloneValue } from "../../document/immutable";
import type { CommandContext, CommandHandler } from "../../session/context";
import { ensure } from "../../errors";
import { addMotionTime, subtractMotionTime, compareMotionTime, validateMotionTime } from "../time";
import type { MotionAudioTrack } from "./model";

function editable(context: CommandContext) {
  ensure(
    context.page.motion?.mode === "motion",
    "INVALID_COMMAND",
    "Composition is not in Motion mode",
  );
  return context.page.motion;
}
function find(context: CommandContext, id: string): MotionAudioTrack {
  const track = editable(context).audioTracks?.find((item) => item.id === id);
  ensure(track, "NOT_FOUND", "Audio track not found");
  return track;
}

export const addMotionAudioTrack: CommandHandler<"addMotionAudioTrack"> = (context, command) => {
  const motion = editable(context);
  if (command.asset) {
    ensure(
      !Object.hasOwn(context.project.assets, command.asset.id),
      "INVALID_COMMAND",
      "Audio asset already exists",
    );
    Object.defineProperty(context.project.assets, command.asset.id, {
      value: cloneValue(command.asset),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  (motion.audioTracks ??= []).push(cloneValue(command.track));
  if (compareMotionTime(command.track.end, motion.duration) > 0)
    motion.duration = cloneValue(command.track.end);
  return { pageId: context.pageId };
};
export const moveMotionAudioTrack: CommandHandler<"moveMotionAudioTrack"> = (context, command) => {
  validateMotionTime(command.delta);
  const track = find(context, command.trackId);
  track.start = addMotionTime(track.start, command.delta);
  track.end = addMotionTime(track.end, command.delta);
  const motion = editable(context);
  if (compareMotionTime(track.end, motion.duration) > 0) motion.duration = cloneValue(track.end);
  return { pageId: context.pageId };
};
export const setMotionAudioTrackRange: CommandHandler<"setMotionAudioTrackRange"> = (
  context,
  command,
) => {
  const track = find(context, command.trackId);
  validateMotionTime(command.start);
  validateMotionTime(command.end);
  track.sourceIn = addMotionTime(track.sourceIn, subtractMotionTime(command.start, track.start));
  track.start = cloneValue(command.start);
  track.end = cloneValue(command.end);
  if (track.processing) {
    const duration = subtractMotionTime(track.end, track.start);
    for (const key of ["fadeIn", "fadeOut"] as const)
      if (compareMotionTime(track.processing[key], duration) > 0)
        track.processing[key] = cloneValue(duration);
  }
  const motion = editable(context);
  if (compareMotionTime(track.end, motion.duration) > 0) motion.duration = cloneValue(track.end);
  return { pageId: context.pageId };
};
export const updateMotionAudioTrack: CommandHandler<"updateMotionAudioTrack"> = (
  context,
  command,
) => {
  ensure(
    command.patch &&
      Object.keys(command.patch).every((key) =>
        ["name", "mute", "volume", "sourceIn", "processing"].includes(key),
      ),
    "INVALID_COMMAND",
    "Unknown audio track field",
  );
  Object.assign(find(context, command.trackId), cloneValue(command.patch));
  return { pageId: context.pageId };
};
export const deleteMotionAudioTrack: CommandHandler<"deleteMotionAudioTrack"> = (
  context,
  command,
) => {
  const motion = editable(context);
  find(context, command.trackId);
  motion.audioTracks = motion.audioTracks!.filter((track) => track.id !== command.trackId);
  return { pageId: context.pageId };
};
