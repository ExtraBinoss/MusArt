import { describe, it, expect } from "vitest";
import { setup, box } from "../support/fixture";
describe("non-destructive masks", () => {
  it("attaches, toggles and inverts references while preserving sources and one-step undo", () => {
    const { engine, layer, page } = setup([box("source"), box("target"), box("other")]);
    engine.execute({
      type: "attachLayerMask",
      sourceId: "source",
      targetId: "target",
      mode: "luminance",
    });
    expect(layer("target").mask).toEqual({
      layerId: "source",
      mode: "luminance",
      enabled: true,
      inverted: false,
    });
    expect(layer("source").maskSource).toBe(true);
    expect(layer("source").visible).toBe(true);
    engine.execute({
      type: "updateMask",
      targetId: "target",
      patch: { enabled: false, inverted: true, mode: "alpha" },
    });
    expect(layer("target").mask).toMatchObject({ enabled: false, inverted: true, mode: "alpha" });
    engine.undo();
    expect(layer("target").mask!.enabled).toBe(true);
    engine.execute({ type: "attachLayerMask", sourceId: "source", targetId: "other" });
    engine.execute({ type: "removeLayerMask", targetId: "target" });
    expect(layer("source").maskSource).toBe(true);
    engine.execute({ type: "removeLayerMask", targetId: "other" });
    expect(layer("source").maskSource).toBe(false);
    expect(page().layers).toHaveLength(3);
  });
  it("groups several selected sources into one isolated mask and uses last selected target by default", () => {
    const { engine, layer, page } = setup([box("a"), box("b"), box("target")]);
    engine.execute({ type: "createMaskFromSelection", ids: ["a", "b", "target"] });
    const group = layer("target").mask!.layerId!;
    expect(layer(group)).toMatchObject({ kind: "group", maskSource: true });
    expect(layer("a").parentId).toBe(group);
    expect(layer("b").parentId).toBe(group);
    expect(engine.getSnapshot().selection).toEqual(["target"]);
    engine.undo();
    expect(page().layers.map((layer) => layer.id)).toEqual(["a", "b", "target"]);
    engine.execute({ type: "createMaskFromSelection", ids: ["a"], targetId: "target" });
    expect(layer("target").mask!.layerId).toBe("a");
  });
  it("rejects invalid selections, cycles, locked targets and foreign mask updates atomically", () => {
    const { engine } = setup([
      box("a"),
      box("b"),
      box("g", 0, 0, { kind: "group" }),
      box("child", 0, 0, { parentId: "g" }),
      box("locked", 0, 0, { locked: true }),
    ]);
    const initial = engine.getSnapshot();
    for (const command of [
      { type: "createMaskFromSelection", ids: [] },
      { type: "createMaskFromSelection", ids: ["a"] },
      { type: "attachLayerMask", sourceId: "a", targetId: "a" },
      { type: "attachLayerMask", sourceId: "a", targetId: "locked" },
      { type: "attachLayerMask", sourceId: "g", targetId: "child" },
      { type: "updateMask", targetId: "a", patch: { enabled: false } },
    ])
      expect(() => engine.execute(command as never)).toThrow();
    expect(engine.getSnapshot()).toBe(initial);
    engine.execute({ type: "attachLayerMask", sourceId: "a", targetId: "b" });
    const before = engine.getSnapshot();
    expect(() => engine.execute({ type: "attachLayerMask", sourceId: "b", targetId: "a" })).toThrow(
      "Cyclic",
    );
    expect(() =>
      engine.execute({ type: "updateMask", targetId: "b", patch: { layerId: "g" } as never }),
    ).toThrow("Invalid mask");
    expect(engine.getSnapshot()).toBe(before);
  });
  it("cleans references on source deletion, but refuses to mutate a locked referencing target", () => {
    const { engine, layer, page } = setup([box("a"), box("b")]);
    engine.execute({ type: "attachLayerMask", sourceId: "a", targetId: "b" });
    engine.execute({ type: "updateLayers", ids: ["b"], patch: { locked: true } });
    const before = engine.getSnapshot();
    expect(() => engine.execute({ type: "deleteLayers", ids: ["a"] })).toThrow("verrouillé");
    expect(engine.getSnapshot()).toBe(before);
    engine.execute({ type: "updateLayers", ids: ["b"], patch: { locked: false } });
    engine.execute({ type: "deleteLayers", ids: ["a"] });
    expect(layer("b").mask).toBeNull();
    expect(page().layers).toHaveLength(1);
    engine.undo();
    expect(layer("b").mask!.layerId).toBe("a");
  });
});
