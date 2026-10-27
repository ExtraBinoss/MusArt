import { describe, it, expect } from "vitest";
import { setup, box } from "../support/fixture";
import { getWorldBounds } from "../../src/layers/geometry";
describe("alignment and distribution", () => {
  it("aligns to page, selection and parent coordinates with one undoable transaction", () => {
    const { engine, layer } = setup([box("a", 30, 40), box("b", 350, 400)]);
    engine.execute({
      type: "alignLayers",
      ids: ["a", "b"],
      axis: "x",
      alignment: "center",
      relativeTo: "page",
    });
    expect(layer("a").x).toBe(450);
    expect(layer("b").x).toBe(450);
    engine.undo();
    engine.execute({
      type: "alignLayers",
      ids: ["a", "b"],
      axis: "y",
      alignment: "end",
      relativeTo: "selection",
    });
    expect(layer("a").y).toBe(400);
    expect(layer("b").y).toBe(400);
    engine.execute({
      type: "alignLayers",
      ids: ["a"],
      axis: "x",
      alignment: "start",
      relativeTo: "parent",
    });
    expect(layer("a").x).toBe(0);
  });
  it("converts world displacement through rotated parent matrices while parent alignment stays local", () => {
    const group = box("g", 200, 200, { kind: "group", width: 400, height: 300, rotation: 90 }),
      a = box("a", 20, 30, { parentId: "g" }),
      b = box("b", 600, 100);
    const { engine, layer, page } = setup([group, a, b]);
    engine.execute({
      type: "alignLayers",
      ids: ["a", "b"],
      axis: "x",
      alignment: "end",
      relativeTo: "page",
    });
    for (const id of ["a", "b"]) {
      const bounds = getWorldBounds(page(), id);
      expect(bounds.x + bounds.width).toBeCloseTo(1000);
    }
    engine.execute({
      type: "alignLayers",
      ids: ["a"],
      axis: "y",
      alignment: "start",
      relativeTo: "parent",
    });
    expect(layer("a").y).toBe(0);
    expect(() =>
      engine.execute({
        type: "alignLayers",
        ids: ["a", "b"],
        axis: "x",
        alignment: "start",
        relativeTo: "selection",
      }),
    ).toThrow("siblings");
  });
  it.each(["x", "y"] as const)(
    "distributes variable sized siblings with equal gaps on %s",
    (axis) => {
      const { engine, layer } = setup([
        box("a", 0, 0),
        box("b", 100, 100, { width: 200, height: 160 }),
        box("c", 600, 600),
      ]);
      engine.execute({ type: "distributeLayers", ids: ["c", "a", "b"], axis });
      const size = axis === "x" ? "width" : "height";
      const a = layer("a"),
        b = layer("b"),
        c = layer("c");
      expect(b[axis] - a[axis] - a[size]).toBeCloseTo(c[axis] - b[axis] - b[size]);
      expect(a[axis]).toBe(0);
      expect(c[axis]).toBe(600);
    },
  );
  it("rejects bad controls, insufficient selections and locked ancestors atomically", () => {
    const { engine } = setup([
      box("g", 0, 0, { kind: "group", locked: true }),
      box("a", 0, 0, { parentId: "g" }),
      box("b"),
    ]);
    const before = engine.getSnapshot();
    for (const command of [
      { type: "alignLayers", ids: [], axis: "x", alignment: "center", relativeTo: "page" },
      { type: "alignLayers", ids: ["a"], axis: "x", alignment: "center", relativeTo: "page" },
      { type: "distributeLayers", ids: ["b"], axis: "x" },
      { type: "distributeLayers", ids: ["b"], axis: "z" },
      { type: "alignLayers", ids: ["b"], axis: "x", alignment: "invalid", relativeTo: "page" },
    ])
      expect(() => engine.execute(command as never)).toThrow();
    expect(engine.getSnapshot()).toBe(before);
    const mixed = setup([
      box("g", 0, 0, { kind: "group" }),
      box("a", 0, 0, { parentId: "g" }),
      box("b"),
      box("c"),
    ]);
    expect(() =>
      mixed.engine.execute({ type: "distributeLayers", ids: ["a", "b", "c"], axis: "x" }),
    ).toThrow("siblings");
  });
});
