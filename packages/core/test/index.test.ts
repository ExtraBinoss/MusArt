import { expect, it } from "vitest";
import * as core from "../src/index";
it("exposes a renderer-free public API usable without a browser", () => {
  const engine = new core.EditorEngine(core.createProject());
  engine.execute({ type: "addLayers", layers: [core.createLayer("rectangle")] });
  const json = core.serializeProject(engine.getSnapshot().project);
  expect(core.parseProject(json).pages[0]?.layers).toHaveLength(1);
  expect(core.hitTest(engine.getSnapshot().project.pages[0]!, { x: 100, y: 100 })?.kind).toBe(
    "rectangle",
  );
  expect(
    new core.SnapIndex(engine.getSnapshot().project.pages[0]!).snap(
      { x: 2, y: 2, width: 0, height: 0 },
      6,
    ).delta,
  ).toEqual({ x: -2, y: -2 });
  expect(core.FORMAT_VERSION).toBe(1);
  expect(core.isPublishedComposition(engine.getSnapshot().project.pages[0]!)).toBe(true);
  expect(core.isPublishedAssets(engine.getSnapshot().project.assets)).toBe(true);
  expect(core.isCommandType("updateLayers")).toBe(true);
  expect(core.isCommandType("toString")).toBe(false);
});
