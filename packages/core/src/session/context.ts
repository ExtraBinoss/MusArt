import type { Command, Composition, Project } from "../document/model";
export interface CommandContext {
  project: Project;
  page: Composition;
  pageId: string;
  revision: number;
  nextId: (prefix: string) => string;
}
export interface CommandResult {
  pageId: string;
  selection?: string[];
}
export type CommandHandler<K extends Command["type"]> = (
  context: CommandContext,
  command: Extract<Command, { type: K }>,
) => CommandResult;
export type CommandHandlers = { [K in Command["type"]]: CommandHandler<K> };
