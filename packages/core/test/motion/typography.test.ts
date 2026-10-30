import { expect, test } from "vitest";
import {
  applyMotionFrame,
  captureMotionAnimationPreset,
  compileMotion,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  MOTION_ANIMATION_PRESETS,
  parseProject,
  prepareMorphShape,
  serializeProject,
  validateShapeMorph,
  type ShapeMorph,
} from "../../src/index";
const contours = [
  {
    hole: false,
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as [number, number][],
  },
];
const geometry: ShapeMorph = {
  version: 1,
  shapes: [
    {
      frames: [
        { at: 0, box: [0, 0, 1, 1], contours },
        {
          at: 1,
          box: [0, 0, 1, 1],
          contours: [
            ...contours,
            {
              hole: true,
              points: [
                [0.3, 0.3],
                [0.7, 0.3],
                [0.7, 0.7],
                [0.3, 0.7],
              ],
            },
          ],
        },
      ],
    },
  ],
};
function fixture(kind: "text" | "rectangle" = "text") {
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ layers: [createLayer(kind, { id: "subject", text: "HELLO" })] })],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const trackId = page().motion!.tracks[0]!.id;
  const add = (start = 0) =>
    engine.execute({
      type: "addMotionAnimation",
      trackId,
      preset: MOTION_ANIMATION_PRESETS.find((p) => p.id === "type-inflate")!,
      start: { value: start, rate: 1 },
      duration: { value: 1, rate: 1 },
    });
  return { engine, page, add };
}
test("morph preparation matches winding and grows missing holes continuously without mutating authored contours", () => {
  const before = structuredClone(geometry);
  validateShapeMorph(geometry);
  const prepared = prepareMorphShape(geometry.shapes[0]!.frames);
  expect(prepared.map((frame) => frame.contours.map((contour) => contour.points.length))).toEqual([
    [256, 64],
    [256, 64],
  ]);
  expect(new Set(prepared[0]!.contours[1]!.points.map((point) => point.join(","))).size).toBe(1);
  expect(geometry).toEqual(before);
  const reversed = prepareMorphShape(
    [...geometry.shapes[0]!.frames].reverse().map((frame, i) => ({ ...frame, at: i })),
  );
  expect(reversed[1]!.contours[1]!.points.every((point) => point.every(Number.isFinite))).toBe(
    true,
  );
});
test("morph data rejects invalid states, contours and nonfinite values", () => {
  for (const change of [
    (data: ShapeMorph) => {
      data.shapes[0]!.frames[1]!.at = 0;
    },
    (data: ShapeMorph) => {
      data.shapes[0]!.frames[0]!.contours = [];
    },
    (data: ShapeMorph) => {
      data.shapes[0]!.frames[0]!.contours[0]!.points[0] = [NaN, 0];
    },
    (data: ShapeMorph) => {
      data.shapes[0]!.frames[0]!.contours[0]!.hole = true;
    },
  ]) {
    const copy = structuredClone(geometry);
    change(copy);
    expect(() => validateShapeMorph(copy)).toThrow();
  }
});
test("independent letter morph blocks choose the latest started source, support disabling and undo, and survive serialization", () => {
  const d = fixture();
  d.add();
  const first = d.page().motion!.tracks[0]!.animations![0]!;
  d.add(2);
  const second = d.page().motion!.tracks[0]!.animations![1]!;
  const sample = (time: number) => {
    const project = d.engine.getSnapshot().project,
      program = compileMotion(project, { compositionId: d.page().id });
    return applyMotionFrame(program, evaluateMotion(program, { value: time * 1000, rate: 1000 }))
      .layers[0]!.effects;
  };
  expect(sample(0.5).map((effect) => effect.enabled)).toEqual([true, false]);
  expect(sample(2.5).map((effect) => effect.enabled)).toEqual([false, true]);
  expect(sample(0.5).map((effect) => effect.enabled)).toEqual([true, false]);
  d.engine.execute({
    type: "updateMotionAnimation",
    animationId: second.id,
    patch: { enabled: false },
  });
  expect(sample(2.5).map((effect) => effect.enabled)).toEqual([true, false]);
  d.engine.execute({
    type: "updateMotionAnimation",
    animationId: first.id,
    patch: { enabled: false },
  });
  expect(sample(2.5).map((effect) => effect.enabled)).toEqual([false, false]);
  d.engine.undo();
  expect(sample(2.5).map((effect) => effect.enabled)).toEqual([true, false]);
  expect(parseProject(serializeProject(d.engine.getSnapshot().project))).toEqual(
    d.engine.getSnapshot().project,
  );
});
test("saved typography includes live stagger/intensity values and applying to an unsupported object fails atomically", () => {
  const d = fixture();
  d.add();
  const layer = d.page().layers[0]!,
    animation = d.page().motion!.tracks[0]!.animations![0]!;
  d.engine.execute({
    type: "updateLayerPatches",
    patches: [
      {
        id: layer.id,
        patch: {
          effects: layer.effects.map((effect) => ({
            ...effect,
            amount: 0.4,
            settings: { ...effect.settings, stagger: 0.2, order: "reverse" },
          })),
        },
      },
    ],
  });
  const saved = captureMotionAnimationPreset(d.page(), layer.id, animation, "My letters", "saved");
  expect(saved.effects[0]).toMatchObject({
    amount: 0.4,
    settings: { stagger: 0.2, order: "reverse" },
  });
  const image = fixture("rectangle"),
    before = image.engine.getSnapshot();
  expect(() => image.add()).toThrow();
  expect(image.engine.getSnapshot()).toBe(before);
});

test("an occurrence without letter animation restores the original text geometry", () => {
  const d = fixture();
  d.add();
  const first = d.page().motion!.tracks[0]!;
  d.engine.execute({
    type: "setMotionTrackRange",
    trackId: first.id,
    start: { value: 0, rate: 1 },
    end: { value: 1, rate: 1 },
  });
  d.engine.execute({
    type: "addMotionOccurrence",
    layerId: "subject",
    start: { value: 2, rate: 1 },
    end: { value: 3, rate: 1 },
  });
  const program = compileMotion(d.engine.getSnapshot().project, { compositionId: d.page().id });
  const plan = evaluateMotion(program, { value: 5, rate: 2 });
  expect(applyMotionFrame(program, plan).layers[0]!.effects[0]!.enabled).toBe(false);
  const addresses = plan.values.map((value) => JSON.stringify(value.target));
  expect(new Set(addresses).size).toBe(addresses.length);
});
