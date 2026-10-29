import { describe, expect, it } from "vitest";
import { EditorEngine } from "../../src/session/engine";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { planMotionInitialization } from "../../src/motion/initialization";
import { parseProject, serializeProject } from "../../src/document/serialization";

const time = (value: number, rate = 1) => ({ value, rate });
function setup(count = 1) {
  const layers = Array.from({ length: count }, (_, i) =>
    createLayer("rectangle", { id: `item-${i}` }),
  );
  const engine = new EditorEngine(createProject({ pages: [createPage({ id: "page", layers })] }));
  const page = () => engine.getSnapshot().project.pages[0]!;
  return { engine, page };
}
const target = { kind: "layer", layerId: "item-0", property: "x" } as const;

describe("Motion authoring transactions", () => {
  it("rejects an old confirmation after another initializer returned to Static", () => {
    const { engine } = setup(4);
    const plan = planMotionInitialization(engine.getSnapshot());
    engine.execute({ type: "setCompositionMode", mode: "motion", plan, confirmed: true });
    engine.execute({ type: "setCompositionMode", mode: "static" });
    const before = engine.getSnapshot();
    expect(() =>
      engine.execute({ type: "setCompositionMode", mode: "motion", plan, confirmed: true }),
    ).toThrow("stale");
    expect(engine.getSnapshot()).toBe(before);
  });
  it.each([0, 1, 3, 4])(
    "adopts %i existing items only after the exact required confirmation",
    (count) => {
      const { engine, page } = setup(count);
      const plan = planMotionInitialization(engine.getSnapshot(), time(5));
      expect(plan.layerIds).toHaveLength(count);
      expect(plan.requiresConfirmation).toBe(count > 3);
      const before = engine.getSnapshot();
      if (count > 3) {
        expect(() => engine.execute({ type: "setCompositionMode", mode: "motion" })).toThrow(
          "confirmation",
        );
        expect(() =>
          engine.execute({ type: "setCompositionMode", mode: "motion", plan, confirmed: false }),
        ).toThrow("confirmation");
        expect(engine.getSnapshot()).toBe(before);
      }
      engine.execute({ type: "setCompositionMode", mode: "motion", plan, confirmed: count > 3 });
      expect(page().motion).toMatchObject({ initialized: true, mode: "motion", duration: time(5) });
      expect(
        page()
          .motion!.tracks.map((track) => track.layerId)
          .sort(),
      ).toEqual(plan.layerIds);
      expect(
        page().motion!.tracks.every((track) => track.end === null && track.start.value === 0),
      ).toBe(true);
      engine.undo();
      expect(page().motion).toBeUndefined();
      engine.redo();
      expect(page().motion!.tracks).toHaveLength(count);
    },
  );

  it("counts groups and descendants, rejects stale revisions and wrong item sets atomically", () => {
    const { engine, page } = setup(4);
    engine.execute({ type: "groupLayers", ids: ["item-0", "item-1"] });
    const plan = planMotionInitialization(engine.getSnapshot());
    expect(plan.layerIds).toHaveLength(5);
    engine.execute({ type: "renameProject", name: "changed after dialog" });
    const before = engine.getSnapshot();
    expect(() =>
      engine.execute({ type: "setCompositionMode", mode: "motion", plan, confirmed: true }),
    ).toThrow("stale");
    expect(engine.getSnapshot()).toBe(before);
    expect(page().motion).toBeUndefined();
    const fresh = planMotionInitialization(engine.getSnapshot());
    expect(() =>
      engine.execute({
        type: "setCompositionMode",
        mode: "motion",
        plan: { ...fresh, layerIds: [] },
        confirmed: true,
      }),
    ).toThrow("stale");
    expect(() =>
      engine.execute({
        type: "setCompositionMode",
        mode: "motion",
        plan: { ...fresh, compositionId: "other" },
        confirmed: true,
      }),
    ).toThrow("stale");
  });

  it("retains keys, identity and trims while Static edits the base design", () => {
    const { engine, page } = setup();
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const trackId = page().motion!.tracks[0]!.id;
    engine.transaction([
      { type: "setMotionTrackRange", trackId, start: time(1, 4), end: time(3, 2) },
      { type: "upsertMotionKeyframe", target, time: time(0), value: 0 },
      {
        type: "upsertMotionKeyframe",
        target,
        time: time(1),
        value: 100,
        easing: { type: "linear" },
      },
    ]);
    const tracks = structuredClone(page().motion!.tracks);
    engine.execute({ type: "setCompositionMode", mode: "static" });
    engine.execute({ type: "updateLayers", ids: ["item-0"], patch: { x: 42 } });
    expect(page().layers[0]!.x).toBe(42);
    expect(page().motion!.tracks).toEqual(tracks);
    expect(() =>
      engine.execute({ type: "upsertMotionKeyframe", target, time: time(1), value: 5 }),
    ).toThrow("not in Motion");
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    expect(page().motion!.tracks).toEqual(tracks);
    const restored = parseProject(serializeProject(engine.getSnapshot().project));
    expect(restored.pages[0]!.motion).toEqual(page().motion);
  });

  it("upserts rationally identical keys and keeps one undo entry for a gesture", () => {
    const { engine, page } = setup();
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    engine.execute({ type: "upsertMotionKeyframe", target, time: time(1, 2), value: 50 });
    const id = page().motion!.tracks[0]!.properties[0]!.keyframes[0]!.id;
    engine.transaction([
      { type: "upsertMotionKeyframe", target, time: time(2, 4), value: 70 },
      { type: "upsertMotionKeyframe", target, time: time(0), value: 0 },
    ]);
    const keys = () => page().motion!.tracks[0]!.properties[0]!.keyframes;
    expect(keys()).toHaveLength(2);
    expect(keys()[1]).toMatchObject({ id, value: 70 });
    engine.undo();
    expect(keys()).toHaveLength(1);
    expect(keys()[0]).toMatchObject({ id, value: 50 });
    engine.redo();
    engine.execute({ type: "moveMotionKeyframe", keyframeId: id, time: time(3) });
    expect(keys()[1]!.time).toEqual(time(3));
    const before = engine.getSnapshot();
    expect(() =>
      engine.execute({ type: "moveMotionKeyframe", keyframeId: id, time: time(0) }),
    ).toThrow("occupied");
    expect(engine.getSnapshot()).toBe(before);
    engine.execute({ type: "deleteMotionKeyframe", keyframeId: id });
    expect(keys()).toHaveLength(1);
    expect(() => engine.execute({ type: "deleteMotionKeyframe", keyframeId: id })).toThrow(
      "not found",
    );
  });

  it("extends inherited ends without changing explicit trims or off-range keys", () => {
    const { engine, page } = setup(2);
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const trimmed = page().motion!.tracks[0]!.id;
    engine.transaction([
      { type: "setMotionTrackRange", trackId: trimmed, start: time(0), end: time(1) },
      { type: "upsertMotionKeyframe", target, time: time(10), value: 99 },
      { type: "setMotionDuration", duration: time(20) },
    ]);
    expect(page().motion!.tracks[0]!.end).toEqual(time(1));
    expect(page().motion!.tracks[1]!.end).toBeNull();
    engine.execute({ type: "setMotionDuration", duration: time(1) });
    expect(page().motion!.tracks[0]!.properties[0]!.keyframes[0]!.time).toEqual(time(10));
    const before = engine.getSnapshot();
    expect(() =>
      engine.transaction([
        { type: "renameProject", name: "must roll back" },
        { type: "setMotionDuration", duration: time(0) },
      ]),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
    expect(() =>
      engine.execute({
        type: "setMotionTrackRange",
        trackId: trimmed,
        start: time(2),
        end: time(1),
      }),
    ).toThrow();
    expect(() =>
      engine.execute({ type: "upsertMotionKeyframe", target, time: time(0), value: NaN }),
    ).toThrow();
  });

  it("adds only new layers while dormant and removes deleted layer subtrees", () => {
    const { engine, page } = setup(2);
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    engine.execute({ type: "setCompositionMode", mode: "static" });
    engine.execute({ type: "addLayers", layers: [createLayer("rectangle", { id: "later" })] });
    expect(page().motion!.tracks.map((track) => track.layerId)).toContain("later");
    engine.execute({ type: "groupLayers", ids: ["item-0", "item-1"] });
    const group = page().layers.find((layer) => layer.kind === "group")!;
    engine.execute({ type: "deleteLayers", ids: [group.id] });
    expect(page().motion!.tracks.map((track) => track.layerId)).toEqual(["later"]);
  });

  it("does not repopulate initialized empty timelines or exchange artboard data", () => {
    const { engine, page } = setup();
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const project = structuredClone(engine.getSnapshot().project);
    project.pages[0]!.motion!.tracks = [];
    engine.load(project);
    engine.execute({ type: "setCompositionMode", mode: "static" });
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    expect(page().motion!.tracks).toEqual([]);
    engine.execute({ type: "addLayers", layers: [createLayer("rectangle", { id: "new" })] });
    expect(page().motion!.tracks.map((track) => track.layerId)).toEqual(["new"]);
    const second = createPage({ id: "second" });
    engine.execute({ type: "addPage", page: second });
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    engine.execute({ type: "setMotionDuration", duration: time(90) });
    expect(page().motion!.duration).toEqual(time(2));
    expect(engine.getSnapshot().project.pages[1]!.motion!.duration).toEqual(time(90));
  });
});
