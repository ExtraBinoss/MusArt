import type { CommandHandler } from "../session/context";
export const renameProject: CommandHandler<"renameProject"> = ({ project, pageId }, command) => {
  project.name = command.name;
  return { pageId };
};
