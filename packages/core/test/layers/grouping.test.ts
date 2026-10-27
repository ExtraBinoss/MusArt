import { it, expect } from "vitest";
import { setup, box } from "../support/fixture";
it("groups siblings in the paint stack and ungroups without moving later siblings", () => {
  const { engine, page } = setup([box("a"), box("b"), box("c")]);
  engine.execute({ type: "groupLayers", ids: ["a", "b"] });
  const group = engine.getSnapshot().selection[0]!;
  expect(
    page()
      .layers.filter((layer) => layer.parentId === null)
      .map((layer) => layer.id),
  ).toEqual([group, "c"]);
  engine.execute({ type: "ungroupLayers", ids: [group] });
  expect(page().layers.map((layer) => layer.id)).toEqual(["a", "b", "c"]);
});
