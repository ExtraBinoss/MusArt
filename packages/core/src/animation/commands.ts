import type { CommandHandler } from "../session/context";
export const setReplay: CommandHandler<"setReplay"> = ({ project, pageId }, command) => {
  if (command.replay === null) delete project.replay;
  else project.replay = command.replay;
  return { pageId };
};
