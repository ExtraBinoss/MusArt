import { it, expect } from "vitest";
import { setup, box } from "../support/fixture";
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
