import { ensure } from "../errors";
import { getLayer, assertEditable, releaseUnusedMaskSources } from "../layers/access";
import { groupLayers } from "../layers/grouping";
import type { CommandContext, CommandHandler } from "../session/context";
function attach(
  context: CommandContext,
  sourceId: string,
  targetId: string,
  mode: "alpha" | "luminance" = "alpha",
): void {
  ensure(sourceId !== targetId, "INVALID_HIERARCHY", "A layer cannot mask itself");
  const source = getLayer(context.page, sourceId),
    target = getLayer(context.page, targetId);
  assertEditable(context.page, source);
  assertEditable(context.page, target);
  target.mask = { layerId: sourceId, mode, enabled: true, inverted: false };
  source.maskSource = true;
  releaseUnusedMaskSources(context.page);
}
export const attachLayerMask: CommandHandler<"attachLayerMask"> = (context, command) => {
  attach(context, command.sourceId, command.targetId, command.mode);
  return { pageId: context.pageId, selection: [command.targetId] };
};
export const createMaskFromSelection: CommandHandler<"createMaskFromSelection"> = (
  context,
  command,
) => {
  const targetId = command.targetId ?? command.ids.at(-1);
  ensure(targetId, "INVALID_COMMAND", "Choose mask sources and a target");
  const sources = [...new Set(command.ids)].filter((id) => id !== targetId);
  ensure(sources.length > 0, "INVALID_COMMAND", "Choose a mask source");
  const sourceId =
    sources.length === 1 ? sources[0]! : groupLayers(context.page, sources, context.nextId);
  attach(context, sourceId, targetId, command.mode);
  return { pageId: context.pageId, selection: [targetId] };
};
export const updateMask: CommandHandler<"updateMask"> = (context, command) => {
  const target = getLayer(context.page, command.targetId);
  assertEditable(context.page, target);
  ensure(target.mask, "INVALID_COMMAND", "This layer has no mask");
  ensure(
    Object.keys(command.patch).every((key) => ["mode", "enabled", "inverted"].includes(key)),
    "INVALID_COMMAND",
    "Invalid mask update",
  );
  Object.assign(target.mask, command.patch);
  return { pageId: context.pageId };
};
export const removeLayerMask: CommandHandler<"removeLayerMask"> = (context, command) => {
  const target = getLayer(context.page, command.targetId);
  assertEditable(context.page, target);
  target.mask = null;
  releaseUnusedMaskSources(context.page);
  return { pageId: context.pageId };
};
