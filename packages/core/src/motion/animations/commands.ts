import { cloneValue } from "../../document/immutable";
import { ensure } from "../../errors";
import { assertEditable, getLayer } from "../../layers/access";
import type { CommandHandler, CommandContext } from "../../session/context";
import { addMotionTime, compareMotionTime, validateMotionTime } from "../time";
import { validateMotionAnimationPreset } from "./validation";

function locate(context: CommandContext, id: string) {
  ensure(
    context.page.motion?.mode === "motion",
    "INVALID_COMMAND",
    "Animations require Motion mode",
  );
  for (const track of context.page.motion.tracks) {
    const animation = track.animations?.find((animation) => animation.id === id);
    if (animation) {
      const layer = getLayer(context.page, track.layerId);
      assertEditable(context.page, layer);
      return { track, animation, layer };
    }
  }
  throw Error("Animation no longer exists");
}

export const addMotionAnimation: CommandHandler<"addMotionAnimation"> = (context, command) => {
  const { page, pageId, nextId } = context;
  ensure(page.motion?.mode === "motion", "INVALID_COMMAND", "Animations require Motion mode");
  validateMotionAnimationPreset(command.preset);
  validateMotionTime(command.start);
  const duration = command.duration ?? { value: command.preset.duration, rate: 1000 };
  validateMotionTime(duration);
  ensure(
    command.start.value >= 0 && duration.value > 0,
    "INVALID_COMMAND",
    "Invalid animation interval",
  );
  const track = page.motion.tracks.find((track) => track.id === command.trackId);
  ensure(track, "NOT_FOUND", "Animation occurrence is missing");
  const layer = getLayer(page, track.layerId);
  assertEditable(page, layer);
  ensure(
    command.preset.effects.every(
      (effect) =>
        effect.type !== "morph" ||
        layer.kind === "text" ||
        (layer.kind === "vector" && !!effect.shapeMorph),
    ),
    "INVALID_COMMAND",
    "Morph requires text or authored vector contours",
  );
  const effects = command.preset.effects.map((effect) => ({
    ...cloneValue(effect),
    id: nextId("effect"),
  }));
  layer.effects.push(...effects);
  (track.animations ??= []).push({
    id: nextId("animation"),
    preset: cloneValue(command.preset),
    start: cloneValue(command.start),
    duration: cloneValue(duration),
    strength: command.strength ?? 1,
    enabled: command.enabled ?? true,
    effectIds: effects.map((effect) => effect.id),
  });
  const end = addMotionTime(command.start, duration);
  if (compareMotionTime(end, page.motion.duration) > 0) page.motion.duration = end;
  return { pageId };
};

export const updateMotionAnimation: CommandHandler<"updateMotionAnimation"> = (
  context,
  command,
) => {
  const { animation } = locate(context, command.animationId);
  ensure(
    Object.keys(command.patch).every((key) =>
      ["start", "duration", "strength", "enabled", "preset"].includes(key),
    ),
    "INVALID_COMMAND",
    "Unknown animation setting",
  );
  if (command.patch.preset) {
    validateMotionAnimationPreset(command.patch.preset);
    ensure(
      JSON.stringify(command.patch.preset.effects) === JSON.stringify(animation.preset.effects),
      "INVALID_COMMAND",
      "Animation effect slots cannot be replaced by a detail edit",
    );
  }
  Object.assign(animation, cloneValue(command.patch));
  const end = addMotionTime(animation.start, animation.duration);
  if (compareMotionTime(end, context.page.motion!.duration) > 0)
    context.page.motion!.duration = end;
  return { pageId: context.pageId };
};

export const deleteMotionAnimation: CommandHandler<"deleteMotionAnimation"> = (
  context,
  command,
) => {
  const { track, animation, layer } = locate(context, command.animationId);
  track.animations = track.animations!.filter((item) => item.id !== animation.id);
  const used = new Set(
    context.page.motion!.tracks.flatMap((track) => [
      ...(track.animations ?? []).flatMap((item) => item.effectIds),
      ...track.properties.flatMap((property) =>
        property.target.kind === "layer" ? [] : [property.target.effectId],
      ),
    ]),
  );
  layer.effects = layer.effects.filter(
    (effect) => !animation.effectIds.includes(effect.id) || used.has(effect.id),
  );
  return { pageId: context.pageId };
};
