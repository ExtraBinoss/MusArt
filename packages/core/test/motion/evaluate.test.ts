import { expect, test } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { compileMotion } from "../../src/motion/compile";
import { evaluateMotion } from "../../src/motion/evaluate";
import { frameTime } from "../../src/motion/time";
import type { CompositionMotion, MotionPropertyTrack } from "../../src/motion/model";

function property(
  id: string,
  field: "x" | "fill" | "visible",
  values: (number | string | boolean)[],
): MotionPropertyTrack {
  return {
    id,
    target: { kind: "layer", layerId: "hero", property: field },
    keyframes: values.map((value, index) => ({
      id: `${id}-${index}`,
      time: { value: index * 2, rate: 1 },
      value,
    })),
  };
}

function fixture() {
  const x = property("x", "x", [0, 100, 200]);
  x.keyframes[1]!.easing = { type: "hold" };
  const motion: CompositionMotion = {
    version: 1,
    initialized: true,
    mode: "motion",
    duration: { value: 4, rate: 1 },
    frameRate: { numerator: 30000, denominator: 1001 },
    tracks: [
      {
        id: "group-track",
        layerId: "group",
        start: { value: 1, rate: 1 },
        end: { value: 3, rate: 1 },
        properties: [],
      },
      {
        id: "hero-track",
        layerId: "hero",
        start: { value: 0, rate: 1 },
        end: { value: 2, rate: 1 },
        properties: [
          x,
          property("fill", "fill", ["#000", "#fff"]),
          property("visible", "visible", [false, true]),
          {
            id: "empty",
            target: { kind: "layer", layerId: "hero", property: "opacity" },
            keyframes: [],
          },
        ],
      },
      {
        id: "later-track",
        layerId: "later",
        start: { value: 5, rate: 1 },
        end: { value: 6, rate: 1 },
        properties: [],
      },
    ],
  };
  return createProject({
    pages: [
      createPage({
        id: "cover",
        motion,
        layers: [
          createLayer("rectangle", {
            id: "hero",
            parentId: "group",
            effects: [createEffect("noise", { id: "noise", time: 7 })],
          }),
          createLayer("group", { id: "group" }),
          createLayer("ellipse", { id: "solo", visible: false }),
          createLayer("rectangle", { id: "later", parentId: "group" }),
        ],
      }),
    ],
  });
}

test("intersects nested parent/child intervals in canonical order with half-open ends", () => {
  const program = compileMotion(fixture(), { compositionId: "cover" });
  expect(evaluateMotion(program, { value: -1, rate: 1 }).activeLayerIds).toEqual([]);
  expect(evaluateMotion(program, { value: 0, rate: 1 }).activeLayerIds).toEqual(["solo"]);
  expect(evaluateMotion(program, { value: 1, rate: 1 }).activeLayerIds).toEqual([
    "hero",
    "group",
    "solo",
  ]);
  expect(evaluateMotion(program, { value: 2, rate: 1 }).activeLayerIds).toEqual(["group", "solo"]);
  expect(evaluateMotion(program, { value: 3, rate: 1 }).activeLayerIds).toEqual(["solo"]);
  expect(evaluateMotion(program, { value: 4, rate: 1 }).activeLayerIds).toEqual([]);
});

test("binary search selects exact rational keys, incoming HOLD and retained off-range keys", () => {
  const program = compileMotion(fixture(), { compositionId: "cover" });
  const valueAt = (value: number, rate = 1) =>
    evaluateMotion(program, { value, rate }).values[0]!.value;
  expect(valueAt(-1)).toBe(0);
  expect(valueAt(1)).toBe(0);
  expect(valueAt(200, 100)).toBe(100);
  expect(valueAt(3)).toBe(150);
  expect(valueAt(4)).toBe(200);
  expect(valueAt(100)).toBe(200);
  expect(evaluateMotion(program, { value: 1, rate: 1 }).values).toHaveLength(3);
  expect(evaluateMotion(program, { value: 1, rate: 1 }).values[1]!.value).toBe("#808080ff");
  expect(evaluateMotion(program, { value: 1, rate: 1 }).values[2]!.value).toBe(false);
  expect(evaluateMotion(program, { value: 2, rate: 1 }).values[2]!.value).toBe(true);
});

test("Static keeps dormant tracks, base properties and all temporal presence", () => {
  const project = fixture();
  project.pages[0]!.motion!.mode = "static";
  const program = compileMotion(project, { compositionId: "cover" });
  expect(evaluateMotion(program, { value: 100, rate: 1 }).values).toEqual([]);
  expect(evaluateMotion(program, { value: 100, rate: 1 }).activeLayerIds).toEqual([
    "hero",
    "group",
    "solo",
    "later",
  ]);
  expect(program.composition.layers[0]!.x).toBe(80);
  expect(program.composition.motion!.tracks[1]!.properties[0]!.keyframes).toHaveLength(3);
});

test("HOLD never steps early when distinct rational timestamps round to the same seconds", () => {
  const project = fixture();
  const max = Number.MAX_SAFE_INTEGER;
  const keys = project.pages[0]!.motion!.tracks[1]!.properties[0]!.keyframes;
  keys.splice(2);
  keys[1]!.time = { value: max - 1, rate: max };
  const program = compileMotion(project, { compositionId: "cover" });
  expect(evaluateMotion(program, { value: max - 2, rate: max - 1 }).values[0]!.value).toBe(0);
  expect(evaluateMotion(program, keys[1]!.time).values[0]!.value).toBe(100);
});

test("terminal preview keeps left-limit presence while sampling the exact final pose", () => {
  const project = fixture();
  const tracks = project.pages[0]!.motion!.tracks;
  tracks[0]!.end = null;
  tracks[1]!.end = null;
  tracks[2]!.start = { value: 4, rate: 1 };
  const program = compileMotion(project, { compositionId: "cover" });
  const outputBoundary = evaluateMotion(program, { value: 4, rate: 1 });
  expect(outputBoundary.activeLayerIds).toEqual([]);
  expect(outputBoundary.terminalPreview).toBe(false);
  const preview = evaluateMotion(program, { value: 40, rate: 10 }, { terminalPreview: true });
  expect(preview.activeLayerIds).toEqual(["hero", "group", "solo"]);
  expect(preview.values[0]!.value).toBe(200);
  expect(preview.time).toEqual({ value: 4, rate: 1 });
  expect(preview.terminalPreview).toBe(true);
  expect(
    evaluateMotion(program, { value: 3, rate: 1 }, { terminalPreview: true }).terminalPreview,
  ).toBe(false);
  expect(
    evaluateMotion(program, { value: 5, rate: 1 }, { terminalPreview: true }).activeLayerIds,
  ).toEqual([]);
});

test("reversing/random samples are identical and fixed effect phase never reads a clock", () => {
  const program = compileMotion(fixture(), { compositionId: "cover" });
  const fps = { numerator: 30000, denominator: 1001 };
  const indices = Array.from({ length: 121 }, (_, index) => index);
  const expected = indices.map((index) => evaluateMotion(program, frameTime(index, fps)));
  let random = 12345;
  for (let sample = 0; sample < 300; sample++) {
    random = (random * 1664525 + 1013904223) >>> 0;
    const index = random % indices.length;
    expect(evaluateMotion(program, frameTime(index, fps))).toEqual(expected[index]);
  }
  expect(program.composition.layers[0]!.effects[0]!.time).toBe(7);
  expect(() => evaluateMotion(program, { value: NaN, rate: 1 })).toThrow();
});

test("initialized empty timelines do not manufacture tracks or suppress canonical layers", () => {
  const project = fixture();
  project.pages[0]!.motion!.tracks = [];
  const program = compileMotion(project, { compositionId: "cover" });
  const frame = evaluateMotion(program, { value: 1, rate: 1 });
  expect(frame.values).toEqual([]);
  expect(frame.activeLayerIds).toEqual(["hero", "group", "solo", "later"]);
  expect(program.composition.motion!.tracks).toEqual([]);
});
