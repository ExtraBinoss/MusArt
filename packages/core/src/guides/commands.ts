import { ensure } from "../errors";
import { getLayer, assertEditable } from "../layers/access";
import type { CommandContext, CommandHandler } from "../session/context";
function guides(context: CommandContext, targetId?: string) {
  if (targetId === undefined) return context.page.guides;
  const layer = getLayer(context.page, targetId);
  assertEditable(context.page, layer);
  layer.guides ??= [];
  return layer.guides;
}
export const addGuide: CommandHandler<"addGuide"> = (context, command) => {
  guides(context, command.targetId).push(command.guide);
  return { pageId: context.pageId };
};
export const updateGuide: CommandHandler<"updateGuide"> = (context, command) => {
  ensure(!("id" in command.patch), "INVALID_COMMAND", "Guide identity is immutable");
  const guide = guides(context, command.targetId).find((guide) => guide.id === command.id);
  ensure(guide, "NOT_FOUND", "Guide introuvable");
  Object.assign(guide, command.patch);
  return { pageId: context.pageId };
};
export const deleteGuide: CommandHandler<"deleteGuide"> = (context, command) => {
  const list = guides(context, command.targetId),
    index = list.findIndex((guide) => guide.id === command.id);
  ensure(index >= 0, "NOT_FOUND", "Repère introuvable");
  list.splice(index, 1);
  return { pageId: context.pageId };
};
