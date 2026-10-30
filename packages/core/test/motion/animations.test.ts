import { describe, expect, it } from "vitest";
import {
  applyMotionFrame,
  captureMotionAnimationPreset,
  compileMotion,
  copyContent,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  extractMotionAnimationPreset,
  getWorldBounds,
  layerTransform,
  MOTION_ANIMATION_PRESETS,
  parseProject,
  serializeProject,
  validateMotionAnimationPreset,
  validateProject,
  type MotionAnimationPreset,
} from "../../src/index";
const time = (value: number) => ({ value: Math.round(value * 1000), rate: 1000 });
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", { id: "subject", x: 100, y: 80, width: 200, height: 100 }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const track = () => page().motion!.tracks[0]!;
  const apply = (id: string, start = 0, duration = 1) =>
    engine.execute({
      type: "addMotionAnimation",
      trackId: track().id,
      preset: MOTION_ANIMATION_PRESETS.find((preset) => preset.id === id)!,
      start: time(start),
      duration: time(duration),
    });
  const sample = (seconds: number) => {
    const program = compileMotion(engine.getSnapshot().project, { compositionId: "page" });
    return applyMotionFrame(program, evaluateMotion(program, time(seconds))).layers[0]!;
  };
  return { engine, page, track, apply, sample };
}
describe("editable motion actions", () => {
  it("ships more than fifty validated, applicable native recipes with deterministic arbitrary seeks", () => {
    expect(MOTION_ANIMATION_PRESETS.length).toBeGreaterThan(50);
    expect(new Set(MOTION_ANIMATION_PRESETS.map((preset) => preset.id)).size).toBe(
      MOTION_ANIMATION_PRESETS.length,
    );
    for (const preset of MOTION_ANIMATION_PRESETS) {
      validateMotionAnimationPreset(preset);
      const f = fixture();
      f.apply(preset.id);
      const halfway = f.sample(0.5);
      f.sample(0.99);
      f.sample(0);
      expect(f.sample(0.5)).toEqual(halfway);
      validateProject(f.engine.getSnapshot().project);
    }
  });
  it("composes relative moves, centered scale and blur without overwriting authored keyframes", () => {
    const f = fixture();
    f.engine.transaction([
      {
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: "subject", property: "x" },
        time: time(0),
        value: 100,
      },
      {
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: "subject", property: "x" },
        time: time(1),
        value: 300,
      },
    ]);
    f.apply("move-left");
    f.apply("scale-grow");
    f.apply("blur-focus");
    const start = f.sample(0);
    expect(start.x).toBe(-40);
    expect(start.width).toBe(200);
    expect(start.scaleX).toBe(0.4);
    expect(start.effects[0]!.amount).toBe(1);
    expect(layerTransform(start)[4]).toBeCloseTo(20);
    expect(f.sample(1).x).toBe(300);
    expect(f.sample(1).effects[0]!.amount).toBe(0);
    expect(f.track().properties[0]!.keyframes).toHaveLength(2);
  });
  it("edits and deletes an action atomically with undo/redo and leaves the static design intact", () => {
    const f = fixture();
    f.apply("scale-blur");
    const animation = f.track().animations![0]!;
    f.engine.execute({
      type: "updateMotionAnimation",
      animationId: animation.id,
      patch: { start: time(0.2), duration: time(0.5), strength: 0.5 },
    });
    expect(f.track().animations![0]!.strength).toBe(0.5);
    f.engine.undo();
    expect(f.track().animations![0]!.strength).toBe(1);
    f.engine.redo();
    expect(f.track().animations![0]!.strength).toBe(0.5);
    f.engine.execute({ type: "setCompositionMode", mode: "static" });
    expect(f.sample(0).scaleX).toBeUndefined();
    expect(f.sample(0).effects[0]!.amount).toBe(0);
    f.engine.execute({ type: "setCompositionMode", mode: "motion" });
    f.engine.execute({ type: "deleteMotionAnimation", animationId: animation.id });
    expect(f.page().layers[0]!.effects).toHaveLength(0);
    f.engine.undo();
    expect(f.track().animations).toHaveLength(1);
  });
  it("validates imported recipes, missing effect slots and atomic failure paths", () => {
    const f = fixture();
    const preset = structuredClone(MOTION_ANIMATION_PRESETS[0]!);
    preset.channels[0]!.points[1]!.at = -1;
    const original = f.engine.getSnapshot();
    expect(() =>
      f.engine.execute({
        type: "addMotionAnimation",
        trackId: f.track().id,
        preset,
        start: time(0),
      }),
    ).toThrow();
    expect(f.engine.getSnapshot()).toBe(original);
    f.apply("blur-focus");
    const corrupt = JSON.parse(serializeProject(f.engine.getSnapshot().project));
    corrupt.pages[0].motion.tracks[0].animations[0].effectIds = ["missing"];
    expect(() => parseProject(JSON.stringify(corrupt))).toThrow();
    f.engine.execute({ type: "updateLayers", ids: ["subject"], patch: { locked: true } });
    expect(() => f.apply("move-right")).toThrow();
  });
  it("remaps animation identities during layer and occurrence duplication and moves blocks once", () => {
    const f = fixture();
    f.apply("blur-focus");
    const animation = f.track().animations![0]!;
    f.engine.execute({ type: "duplicateLayers", ids: ["subject"] });
    const duplicate = f.page().motion!.tracks.find((track) => track.layerId !== "subject")!;
    expect(duplicate.animations![0]!.id).not.toBe(animation.id);
    expect(duplicate.animations![0]!.effectIds).not.toEqual(animation.effectIds);
    f.engine.execute({
      type: "setMotionTrackRange",
      trackId: f.track().id,
      start: time(0),
      end: time(1),
    });
    f.engine.execute({
      type: "duplicateMotionOccurrence",
      trackId: f.track().id,
      start: time(2),
      end: time(3),
    });
    const occurrence = f.page().motion!.tracks.at(-1)!;
    expect(occurrence.animations![0]!.start.value / occurrence.animations![0]!.start.rate).toBe(2);
    f.engine.execute({ type: "moveMotionTrack", trackId: occurrence.id, delta: time(0.2) });
    expect(
      f.page().motion!.tracks.at(-1)!.animations![0]!.start.value /
        f.page().motion!.tracks.at(-1)!.animations![0]!.start.rate,
    ).toBeCloseTo(2.2);
    f.engine.select(["subject"]);
    expect(() => JSON.parse(copyContent(f.engine.getSnapshot()))).not.toThrow();
    validateProject(f.engine.getSnapshot().project);
  });
  it("extracts custom keyframes into target-relative, portable presets", () => {
    const f = fixture();
    f.engine.transaction([
      {
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: "subject", property: "x" },
        time: time(0),
        value: 0,
      },
      {
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: "subject", property: "x" },
        time: time(1),
        value: 100,
      },
    ]);
    const preset = extractMotionAnimationPreset(f.page(), f.track(), "My move", "global-uuid");
    expect(preset.channels[0]!.unit).toBe("width");
    const destination = fixture();
    destination.engine.execute({ type: "updateLayers", ids: ["subject"], patch: { width: 400 } });
    destination.engine.execute({
      type: "addMotionAnimation",
      trackId: destination.track().id,
      preset,
      start: time(0),
    });
    expect(destination.sample(0).x).toBe(-100);
    expect(destination.sample(1).x).toBe(100);
    expect(JSON.stringify(preset)).not.toContain('"layerId"');
  });
  it("scales a group around its center without resizing its children or text", () => {
    const group = createLayer("group", {
      id: "group",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      scaleX: 0.5,
      scaleY: 0.5,
    });
    const page = createPage({
      layers: [
        group,
        createLayer("text", { id: "child", parentId: "group", x: 0, y: 0, width: 100, height: 40 }),
      ],
    });
    expect(getWorldBounds(page, "group")).toEqual({ x: 150, y: 125, width: 100, height: 50 });
    expect(getWorldBounds(page, "child")).toEqual({ x: 150, y: 125, width: 50, height: 20 });
  });
  it("saves instance intensity into independent numeric replacement channels", () => {
    const f = fixture();
    f.apply("blur-focus");
    f.engine.execute({
      type: "updateMotionAnimation",
      animationId: f.track().animations![0]!.id,
      patch: { strength: 0.5 },
    });
    const preset = captureMotionAnimationPreset(
      f.page(),
      "subject",
      f.track().animations![0]!,
      "Half blur",
      "half-blur",
    );
    const destination = fixture();
    destination.engine.execute({
      type: "addMotionAnimation",
      trackId: destination.track().id,
      preset,
      start: time(0),
      duration: time(1),
    });
    for (const at of [0, 0.5, 1])
      expect(destination.sample(at).effects[0]!.amount).toBeCloseTo(
        f.sample(at).effects[0]!.amount,
      );
  });
  it("preserves authored instance curves across serialization and changes in base geometry", () => {
    const f = fixture();
    f.apply("move-left");
    const preset: MotionAnimationPreset = structuredClone(f.track().animations![0]!.preset);
    preset.channels[0]!.points.splice(1, 0, { at: 0.5, value: -0.2 });
    f.engine.execute({
      type: "updateMotionAnimation",
      animationId: f.track().animations![0]!.id,
      patch: { preset },
    });
    f.engine.execute({ type: "updateLayers", ids: ["subject"], patch: { x: 400, width: 100 } });
    expect(f.sample(0.5).x).toBe(380);
    expect(parseProject(serializeProject(f.engine.getSnapshot().project))).toEqual(
      f.engine.getSnapshot().project,
    );
  });
});
