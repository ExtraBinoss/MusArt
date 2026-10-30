import { expect, test } from "vitest";
import {
  EditorEngine,
  createProject,
  createPage,
  createLayer,
  compileMotion,
  evaluateMotion,
  createMotionKeyframePreview,
  projectAnimationProperties,
  projectMotionProperties,
  serializeProject,
  parseProject,
  type MotionAnimationPreset,
} from "../../../src/index";
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({ layers: [createLayer("rectangle", { id: "hero", x: 100, width: 200 })] }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const preset: MotionAnimationPreset = {
    version: 1,
    id: "move",
    name: "Move",
    category: "move",
    duration: 2000,
    effects: [],
    channels: [
      {
        target: { kind: "layer", property: "x" },
        operation: "add",
        unit: "width",
        points: [
          { at: 0, value: -1 },
          { at: 0.5, value: -0.25 },
          { at: 1, value: 0 },
        ],
      },
    ],
  };
  engine.execute({
    type: "addMotionAnimation",
    trackId: page().motion!.tracks[0]!.id,
    preset,
    start: { value: 0, rate: 1 },
  });
  const properties = () => projectAnimationProperties(page().motion!.tracks[0]!);
  const program = () => compileMotion(engine.getSnapshot().project, { compositionId: page().id });
  return { engine, page, properties, program };
}
test("projects contributions without canonical tracks and retimes the same source with one undo", () => {
  const f = fixture(),
    keys = f.properties()[0]!.property.keyframes;
  expect(keys.map((key) => key.time.value / key.time.rate)).toEqual([0, 1, 2]);
  expect(keys[0]!.value).toBe(-1);
  expect(projectMotionProperties(f.page().motion!.tracks[0]!)).toHaveLength(1);
  const before = f.engine.getSnapshot();
  const preview = createMotionKeyframePreview(f.program(), [keys[1]!.id]);
  const delta = { value: 1, rate: 2 };
  expect(preview.accepts(delta)).toBe(true);
  const draft = preview.sample(delta);
  expect(f.engine.getSnapshot()).toBe(before);
  expect(f.page().motion!.tracks[0]!.properties).toEqual([]);
  f.engine.execute({ type: "moveMotionKeyframes", keyframeIds: [keys[1]!.id], delta });
  expect(f.engine.getSnapshot().revision).toBe(before.revision + 1);
  expect(f.page().motion!.tracks[0]!.animations![0]!.preset.channels[0]!.points[1]!.at).toBe(0.75);
  expect(evaluateMotion(draft, { value: 1, rate: 1 }).values).toEqual(
    evaluateMotion(f.program(), { value: 1, rate: 1 }).values,
  );
  expect(parseProject(serializeProject(f.engine.getSnapshot().project))).toEqual(
    f.engine.getSnapshot().project,
  );
  f.engine.undo();
  expect(f.properties()[0]!.property.keyframes[1]!.time).toEqual({ value: 1, rate: 1 });
  f.engine.redo();
  expect(f.properties()[0]!.property.keyframes[1]!.time).toEqual({ value: 3, rate: 2 });
});
test("endpoint drags resize or move the block, reject crossings atomically and delete interior points", () => {
  const f = fixture(),
    keys = f.properties()[0]!.property.keyframes;
  const preview = createMotionKeyframePreview(f.program(), [keys[0]!.id]);
  expect(preview.accepts({ value: -1, rate: 1 })).toBe(false);
  expect(preview.accepts({ value: 1, rate: 1 })).toBe(false);
  const before = f.engine.getSnapshot();
  expect(() =>
    f.engine.execute({
      type: "moveMotionKeyframes",
      keyframeIds: [keys[0]!.id],
      delta: { value: 1, rate: 1 },
    }),
  ).toThrow();
  expect(f.engine.getSnapshot()).toBe(before);
  f.engine.execute({
    type: "moveMotionKeyframes",
    keyframeIds: keys.map((key) => key.id),
    delta: { value: 1, rate: 1 },
  });
  expect(
    f.properties()[0]!.property.keyframes.map((key) => key.time.value / key.time.rate),
  ).toEqual([1, 2, 3]);
  f.engine.execute({ type: "deleteMotionKeyframes", keyframeIds: [keys[1]!.id] });
  expect(f.properties()[0]!.property.keyframes).toHaveLength(2);
  const last = f.engine.getSnapshot();
  expect(() =>
    f.engine.execute({ type: "deleteMotionKeyframes", keyframeIds: [keys[0]!.id] }),
  ).toThrow();
  expect(f.engine.getSnapshot()).toBe(last);
});
