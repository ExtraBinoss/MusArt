import { ensure } from "../errors";
import type { CommandHandler } from "../session/context";
export const addAssets: CommandHandler<"addAssets"> = ({ project, pageId }, command) => {
  for (const asset of command.assets) {
    ensure(!Object.hasOwn(project.assets, asset.id), "INVALID_COMMAND", "Ressource déjà présente");
    Object.defineProperty(project.assets, asset.id, {
      value: asset,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { pageId };
};
