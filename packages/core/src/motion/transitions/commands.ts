import { createEffect } from "../../document/factories";
import { getTransitionDefinition } from "../../effects/transition/catalog";
import { ensure } from "../../errors";
import { assertEditable, getLayer } from "../../layers/access";
import type { CommandHandler } from "../../session/context";
import { resolveMotionOccurrence } from "../occurrences";
import { upsertMotionKeyframe } from "../commands";
import { addMotionTime, compareMotionTime, subtractMotionTime, validateMotionTime } from "../time";

/** Author a transition as ordinary effect keys in one validated, undoable transaction. */
export const applyMotionTransition: CommandHandler<"applyMotionTransition"> = (
  context,
  command,
) => {
  const { page, pageId, nextId } = context;
  ensure(
    page.motion?.mode === "motion",
    "INVALID_COMMAND",
    "Transitions require a Motion composition.",
  );
  const layer = getLayer(page, command.layerId);
  assertEditable(page, layer);
  const track = resolveMotionOccurrence(page, layer.id, command.trackId);
  ensure(getTransitionDefinition(command.style), "INVALID_COMMAND", "Unknown transition operator.");
  ensure(
    command.placement === "in" || command.placement === "out",
    "INVALID_COMMAND",
    "Invalid transition placement.",
  );
  validateMotionTime(command.duration);
  const end = track.end ?? page.motion.duration;
  const span = subtractMotionTime(end, track.start);
  ensure(
    command.duration.value > 0 && compareMotionTime(command.duration, span) <= 0,
    "INVALID_COMMAND",
    "Transition duration must fit inside the layer's visible interval.",
  );
  const existing =
    command.effectId === undefined
      ? undefined
      : layer.effects.find((effect) => effect.id === command.effectId);
  ensure(
    command.effectId === undefined || existing?.type === "transition",
    "NOT_FOUND",
    "The selected transition no longer exists.",
  );
  const effect = existing ?? createEffect("transition", { id: nextId("effect") });
  if (!existing) layer.effects.push(effect);
  effect.settings = {
    ...effect.settings,
    style: command.style,
    progress: 1,
    ...(command.direction ? { direction: command.direction } : {}),
  };
  // Only the authored progress channel is replaced. Other custom animation is retained.
  track.properties = track.properties.filter(
    ({ target }) =>
      !(
        target.kind === "effectSetting" &&
        target.effectId === effect.id &&
        target.property === "progress"
      ),
  );
  const enter = command.placement === "in";
  const first = enter ? track.start : subtractMotionTime(end, command.duration);
  const last = enter ? addMotionTime(track.start, command.duration) : end;
  const target = {
    kind: "effectSetting",
    layerId: layer.id,
    effectId: effect.id,
    property: "progress",
  } as const;
  upsertMotionKeyframe(context, {
    type: "upsertMotionKeyframe",
    trackId: track.id,
    target,
    time: first,
    value: enter ? 0 : 1,
  });
  upsertMotionKeyframe(context, {
    type: "upsertMotionKeyframe",
    trackId: track.id,
    target,
    time: last,
    value: enter ? 1 : 0,
    ...(command.easing ? { easing: command.easing } : {}),
  });
  return { pageId };
};
