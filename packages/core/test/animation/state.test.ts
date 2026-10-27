import { it, expect } from "vitest";
import { stateFromProject, normalizeReplayCommands } from "../../src/animation/state";
import { createProject } from "../../src/document/factories";
import { asset, box } from "../support/fixture";
it("retains canonical pages while removing original payloads and nested replay from event states", () => {
  const project = createProject({ assets: { original: asset() } });
  const state = stateFromProject(project);
  expect(state.pages).toBe(project.pages);
  expect(state.assetIds).toEqual(["original"]);
  expect("assets" in state).toBe(false);
  expect("replay" in state).toBe(false);
  const commands = normalizeReplayCommands([
    { type: "addAssets", assets: [asset()] },
    { type: "addLayers", layers: [box("a")], assets: [asset()] },
    { type: "addLayers", layers: [] },
    { type: "renameProject", name: "New" },
    { type: "setReplay", replay: null },
  ]);
  expect(commands).toEqual([
    { type: "addAssets", assetIds: ["original"] },
    { type: "addLayers", layers: [box("a")], assetIds: ["original"] },
    { type: "addLayers", layers: [] },
    { type: "renameProject", name: "New" },
  ]);
  expect(JSON.stringify(commands)).not.toContain("data:image");
});
