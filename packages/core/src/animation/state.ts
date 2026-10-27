import type { Command, Project } from "../document/model";
import type { ReplayCommand, ReplayState } from "./model";
/** A lightweight immutable view: no original data URL or nested replay is included. */
export function stateFromProject(project: Project): ReplayState {
  const { assets, replay: _replay, ...state } = project;
  return { ...state, assetIds: Object.keys(assets) };
}
export function normalizeReplayCommands(commands: readonly Command[]): ReplayCommand[] {
  return commands
    .filter((command) => command.type !== "setReplay")
    .map((command) => {
      if (command.type === "addAssets")
        return { type: "addAssets", assetIds: command.assets.map((asset) => asset.id) };
      if (command.type === "addLayers") {
        const { assets, ...insert } = command;
        return { ...insert, ...(assets ? { assetIds: assets.map((asset) => asset.id) } : {}) };
      }
      return command as ReplayCommand;
    });
}
