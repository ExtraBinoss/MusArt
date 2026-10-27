import { ensure } from "../errors";
import type { CommandHandler } from "../session/context";
export const addAssets: CommandHandler<"addAssets"> = ({ project, pageId }, command) => {
  for (const asset of command.assets) {
    ensure(!Object.hasOwn(project.assets, asset.id), "INVALID_COMMAND", "Ressource déjà présente");
    project.assets[asset.id] = asset;
  }
  return { pageId };
};
