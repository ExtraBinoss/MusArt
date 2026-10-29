import { expect, test } from "vitest";
import {
  EditorEngine,
  createLayer,
  createPage,
  createProject,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
} from "../../src/index";
import { createMotionKeyframePreview } from "../../src/motion/keyframe-preview";

function setup() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", { id: "item" }),
            createLayer("ellipse", { id: "other" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1, 2])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "item", property: "x" },
      time: { value, rate: 1 },
      value: value * 100,
      easing: { type: "cubicBezier", x1: 0.42, y1: 0, x2: 1, y2: 1 },
    });
  const project = engine.getSnapshot().project;
  const program = compileMotion(project, { compositionId: "page" });
  const keys = program.composition.motion!.tracks[0]!.properties[0]!.keyframes;
  return { engine, project, program, keys };
}

test.each([1, 3])(
  "matches an actual committed retiming, including key reordering (%i/2 seconds)",
  (value) => {
    const d = setup(),
      delta = { value, rate: 2 },
      ids = [d.keys[0]!.id];
    const draft = createMotionKeyframePreview(d.program, ids)(delta);
    expect(d.engine.getSnapshot().project).toBe(d.project);
    expect(draft.composition).toBe(d.program.composition);
    expect(draft.layers[1]).toBe(d.program.layers[1]);
    expect(draft.layers[0]!.properties[0]!.target).toBe(d.program.layers[0]!.properties[0]!.target);
    expect(Object.isFrozen(draft.layers[0]!.properties[0]!.keys)).toBe(true);
    d.engine.execute({ type: "moveMotionKeyframes", keyframeIds: ids, delta });
    const committed = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
    for (const value of [0, 3, 1, 8, 5, 7]) {
      const time = { value, rate: 4 };
      const plan = evaluateMotion(draft, time);
      expect(plan.values).toEqual(evaluateMotion(committed, time).values);
      expect(applyMotionFrame(draft, plan).layers[0]!.x).toBe(plan.values[0]!.value);
    }
  },
);

test("retains interpolation functions when key order is unchanged and samples relative to the captured origin", () => {
  const d = setup(),
    retime = createMotionKeyframePreview(d.program, [d.keys[2]!.id]);
  for (const delta of [
    { value: 1, rate: 3 },
    { value: 1, rate: 2 },
  ]) {
    const draft = retime(delta),
      property = draft.layers[0]!.properties[0]!;
    expect(property.segments).toBe(d.program.layers[0]!.properties[0]!.segments);
    expect(property.keys[2]!.time).toEqual({
      value: delta.value + 2 * delta.rate,
      rate: delta.rate,
    });
  }
  expect(retime({ value: 0, rate: 1 })).toBe(d.program);
});

test("rejects negative times, collisions, missing/duplicate selections and locked ancestors without mutating the program", () => {
  const d = setup(),
    key = d.keys[0]!.id;
  const retime = createMotionKeyframePreview(d.program, [key]);
  expect(() => retime({ value: -1, rate: 1 })).toThrow("Negative keyframe time");
  expect(() => retime({ value: 1, rate: 1 })).toThrow("already occupied");
  expect(() => retime({ value: 1, rate: 0 })).toThrow();
  for (const ids of [[], [key, key], ["missing"]])
    expect(() => createMotionKeyframePreview(d.program, ids)).toThrow();
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { locked: true } });
  expect(() =>
    createMotionKeyframePreview(
      compileMotion(d.engine.getSnapshot().project, { compositionId: "page" }),
      [key],
    ),
  ).toThrow();
  expect(d.program.layers[0]!.properties[0]!.keys[0]!.time).toEqual({ value: 0, rate: 1 });
});
