import { ensure } from "../errors";
import type { Command, Composition, Project } from "../document/model";
import { COMMAND_HANDLERS } from "./registry";
import type { CommandContext, CommandResult } from "./context";
import { reconcileMotionLayers } from "../motion/initialization";
import { pruneMotionProperties } from "../motion/structure";
export type { CommandResult } from "./context";
export function currentPage(project: Project, pageId: string): Composition {
  const page = project.pages.find((item) => item.id === pageId);
  ensure(page, "NOT_FOUND", "Composition introuvable");
  return page;
}
/** Dispatch preserves the command/handler correlation checked by CommandHandlers. */
export function applyCommand(
  project: Project,
  pageId: string,
  command: Command,
  nextId: (prefix: string) => string,
  revision = 0,
): CommandResult {
  ensure(Object.hasOwn(COMMAND_HANDLERS, command.type), "INVALID_COMMAND", "Commande inconnue");
  const handler = COMMAND_HANDLERS[command.type] as (
    context: CommandContext,
    command: Command,
  ) => CommandResult;
  const page = currentPage(project, pageId);
  const structural = [
    "addLayers",
    "deleteLayers",
    "duplicateLayers",
    "groupLayers",
    "ungroupLayers",
    "createMaskFromSelection",
  ].includes(command.type);
  const previousLayerIds =
    structural && page.motion ? new Set(page.layers.map((layer) => layer.id)) : undefined;
  const result = handler({ project, pageId, page, nextId, revision }, command);
  // Reconcile only structural operations; parameter previews retain their shallow draft path.
  if (previousLayerIds) reconcileMotionLayers(page, nextId, previousLayerIds, project.assets);
  if (page.motion && (command.type === "updateLayers" || command.type === "updateLayerPatches"))
    pruneMotionProperties(page);
  return result;
}
