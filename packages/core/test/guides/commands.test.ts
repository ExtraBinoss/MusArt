import { it, expect } from "vitest";
import { setup, box } from "../support/fixture";
import { parseProject, serializeProject } from "../../src/index";
it("edits page and layer-local guides independently with identity and bounds checks", () => {
  const { engine, page, layer } = setup([box("a")]);
  engine.transaction([
    { type: "addGuide", guide: { id: "page-guide", axis: "x", position: -50 } },
    { type: "addGuide", targetId: "a", guide: { id: "local-guide", axis: "y", position: 20 } },
  ]);
  engine.execute({
    type: "updateGuide",
    id: "local-guide",
    targetId: "a",
    patch: { position: 40, axis: "x" },
  });
  expect(layer("a").guides![0]).toMatchObject({ axis: "x", position: 40 });
  expect(page().guides[0]!.position).toBe(-50);
  for (const command of [
    { type: "updateGuide", id: "missing", patch: { position: 1 } },
    { type: "updateGuide", id: "local-guide", targetId: "a", patch: { id: "new" } },
    { type: "addGuide", targetId: "a", guide: { id: "bad", axis: "x", position: 101 } },
    { type: "deleteGuide", id: "missing" },
    { type: "deleteGuide", id: "page-guide", targetId: "" },
  ] as const)
    expect(() => engine.execute(command)).toThrow();
  engine.execute({ type: "deleteGuide", id: "local-guide", targetId: "a" });
  expect(layer("a").guides).toEqual([]);
  engine.undo();
  expect(layer("a").guides).toHaveLength(1);
  engine.execute({ type: "updateLayers", ids: ["a"], patch: { locked: true } });
  expect(() =>
    engine.execute({
      type: "addGuide",
      targetId: "a",
      guide: { id: "locked", axis: "x", position: 1 },
    }),
  ).toThrow("verrouillé");
});

it("persists optional guide colors with atomic validation and undo for pages and layers", () => {
  const { engine, page, layer } = setup([box("a")]);
  engine.execute({
    type: "addGuide",
    guide: { id: "color-guide", axis: "x", position: 20, color: "#ed66c2" },
  });
  expect(
    parseProject(serializeProject(engine.getSnapshot().project)).pages[0]!.guides[0]!.color,
  ).toBe("#ed66c2");
  engine.execute({ type: "updateGuide", id: "color-guide", patch: { color: "#00aaff" } });
  expect(page().guides[0]!.color).toBe("#00aaff");
  engine.undo();
  expect(page().guides[0]!.color).toBe("#ed66c2");
  const before = engine.getSnapshot();
  for (const color of ["red", "url(x)", 42]) {
    expect(() =>
      engine.execute({ type: "updateGuide", id: "color-guide", patch: { color: color as string } }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
    expect(() =>
      engine.execute({
        type: "addGuide",
        targetId: "a",
        guide: { id: "invalid-color", axis: "y", position: 20, color: color as string },
      }),
    ).toThrow();
  }
  engine.execute({
    type: "addGuide",
    targetId: "a",
    guide: { id: "layer-color", axis: "y", position: 20, color: "#abc" },
  });
  expect(layer("a").guides![0]!.color).toBe("#abc");
});
