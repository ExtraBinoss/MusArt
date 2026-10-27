import { ensure } from "../errors";
import type { Command, Composition, Project } from "../document/model";
import { COMMAND_HANDLERS } from "./registry";
import type { CommandContext, CommandResult } from "./context";
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
): CommandResult {
  ensure(Object.hasOwn(COMMAND_HANDLERS, command.type), "INVALID_COMMAND", "Commande inconnue");
  const handler = COMMAND_HANDLERS[command.type] as (
    context: CommandContext,
    command: Command,
  ) => CommandResult;
  return handler({ project, pageId, page: currentPage(project, pageId), nextId }, command);
}
