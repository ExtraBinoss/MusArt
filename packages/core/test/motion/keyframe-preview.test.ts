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
    const draft = createMotionKeyframePreview(d.program, ids).sample(delta);
    expect(d.engine.getSnapshot().project).toBe(d.project);
    expect(draft.composition.layers).toBe(d.program.composition.layers);
    expect(draft.layers[1]).toBe(d.program.layers[1]);
    expect(draft.layers[0]!.properties[0]!.target).toBe(d.program.layers[0]!.properties[0]!.target);
    expect(Object.isFrozen(draft.layers[0]!.properties[0]!.keys)).toBe(true);
    d.engine.execute({ type: "moveMotionKeyframes", keyframeIds: ids, delta });
    const committed = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
    expect(draft.composition.motion).toEqual(committed.composition.motion);
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
    const draft = retime.sample(delta),
      property = draft.layers[0]!.properties[0]!;
    expect(property.segments).toBe(d.program.layers[0]!.properties[0]!.segments);
    expect(property.keys[2]!.time).toEqual({
      value: delta.value + 2 * delta.rate,
      rate: delta.rate,
    });
  }
  expect(retime.sample({ value: 0, rate: 1 })).toBe(d.program);
});

test("preflights negative times and exact rational collisions without compiling a draft", () => {
  const d = setup(),
    preview = createMotionKeyframePreview(d.program, [d.keys[0]!.id]);
  expect(preview.accepts({ value: -1, rate: 2 })).toBe(false);
  expect(preview.accepts({ value: 2, rate: 2 })).toBe(false);
  expect(preview.accepts({ value: 1, rate: 0 })).toBe(false);
  expect(preview.accepts({ value: 0, rate: 1 })).toBe(true);
  expect(preview.accepts({ value: 1, rate: 3 })).toBe(true);
  expect(preview.accepts({ value: 3, rate: 2 })).toBe(true);
  const all = createMotionKeyframePreview(
    d.program,
    d.keys.map((key) => key.id),
  );
  expect(all.accepts({ value: 1, rate: 1 })).toBe(true);
  expect(all.accepts({ value: -1, rate: 1000 })).toBe(false);
});

test("rejects negative times, collisions, missing/duplicate selections and locked layers without mutating the program", () => {
  const d = setup(),
    key = d.keys[0]!.id;
  const retime = createMotionKeyframePreview(d.program, [key]);
  expect(() => retime.sample({ value: -1, rate: 1 })).toThrow("Negative keyframe time");
  expect(() => retime.sample({ value: 1, rate: 1 })).toThrow("already occupied");
  expect(() => retime.sample({ value: 1, rate: 0 })).toThrow();
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

test("v2 drafts and committed retiming preserve signed pre-roll keys while sampling only the authored time", () => {
  const d = setup();
  const track = d.project.pages[0]!.motion!.tracks[0]!;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: track.id,
    start: { value: 3, rate: 1 },
  });
  const program = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
  const keyId = track.properties[0]!.keyframes[0]!.id;
  const preview = createMotionKeyframePreview(program, [keyId]);
  const delta = { value: -1, rate: 2 };
  expect(preview.accepts(delta)).toBe(true);
  const draft = preview.sample(delta);
  expect(draft.composition.motion!.tracks[0]!.properties[0]!.keyframes[0]!.time).toEqual(delta);
  d.engine.execute({ type: "moveMotionKeyframes", keyframeIds: [keyId], delta });
  const committed = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
  for (const value of [0, 1, 2, 7])
    expect(evaluateMotion(draft, { value, rate: 2 })).toEqual(
      evaluateMotion(committed, { value, rate: 2 }),
    );
  expect(program.composition.motion!.tracks[0]!.properties[0]!.keyframes[0]!.time.value).toBe(0);
});
