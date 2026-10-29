import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { compileMotion } from "../../src/motion/compile";
import { evaluateMotion } from "../../src/motion/evaluate";
import { applyMotionFrame } from "../../src/motion/frame";
import type { CompositionMotion } from "../../src/motion/model";

function fixture() {
  const motion: CompositionMotion = {
    version: 1,
    initialized: true,
    mode: "motion",
    duration: { value: 3, rate: 1 },
    frameRate: { numerator: 30, denominator: 1 },
    tracks: [
      {
        id: "hero-track",
        layerId: "hero",
        start: { value: 0, rate: 1 },
        end: null,
        properties: [
          {
            id: "hero-x",
            target: { kind: "layer", layerId: "hero", property: "x" },
            keyframes: [
              { id: "hero-x-a", time: { value: 0, rate: 1 }, value: 80 },
              { id: "hero-x-b", time: { value: 1, rate: 1 }, value: 100 },
            ],
          },
        ],
      },
      {
        id: "mask-track",
        layerId: "mask",
        start: { value: 1, rate: 1 },
        end: { value: 2, rate: 1 },
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
            mask: { layerId: "mask", enabled: true, inverted: false },
          }),
          createLayer("ellipse", { id: "mask", maskSource: true }),
          createLayer("rectangle", { id: "static" }),
        ],
      }),
    ],
  });
}

test("materializes values while retaining unchanged layer and canonical identities", () => {
  const program = compileMotion(fixture(), { compositionId: "cover" });
  const frame = applyMotionFrame(program, evaluateMotion(program, { value: 1, rate: 1 }));
  expect(frame.layers[0]!.x).toBe(100);
  expect(frame.layers[0]).not.toBe(program.composition.layers[0]);
  expect(frame.layers[1]).toBe(program.composition.layers[1]);
  expect(frame.layers[2]).toBe(program.composition.layers[2]);
  expect(program.composition.layers[0]!.x).toBe(80);
  expect(frame.motion).toBe(program.composition.motion);
  expect(Object.isFrozen(frame.layers[0])).toBe(true);
});

test("keeps temporally inactive mask identity/attachment but removes its source coverage", () => {
  const program = compileMotion(fixture(), { compositionId: "cover" });
  const frame = applyMotionFrame(program, evaluateMotion(program, { value: 0, rate: 1 }));
  expect(frame.layers[1]).toMatchObject({ id: "mask", maskSource: true, visible: false });
  expect(frame.layers[0]!.mask).toBe(program.composition.layers[0]!.mask);
  expect(frame.layers[0]!.visible).toBe(true);
  expect(frame.layers[2]).toBe(program.composition.layers[2]);
});

test("returns the exact compiled composition for a Static or unchanged frame", () => {
  const project = fixture();
  project.pages[0]!.motion!.mode = "static";
  const program = compileMotion(project, { compositionId: "cover" });
  expect(applyMotionFrame(program, evaluateMotion(program, { value: 100, rate: 1 }))).toBe(
    program.composition,
  );
  project.pages[0]!.motion!.mode = "motion";
  project.pages[0]!.motion!.tracks[0]!.properties = [];
  const unchanged = compileMotion(project, { compositionId: "cover" });
  expect(applyMotionFrame(unchanged, evaluateMotion(unchanged, { value: 1, rate: 1 }))).toBe(
    unchanged.composition,
  );
});

test("rejects mismatched plans and enforces temporal absence after animated visibility", () => {
  const project = fixture();
  const track = project.pages[0]!.motion!.tracks[0]!;
  track.end = { value: 1, rate: 1 };
  track.properties.push({
    id: "hero-visible",
    target: { kind: "layer", layerId: "hero", property: "visible" },
    keyframes: [{ id: "visible-key", time: { value: 0, rate: 1 }, value: true }],
  });
  const program = compileMotion(project, { compositionId: "cover" });
  const plan = evaluateMotion(program, { value: 2, rate: 1 });
  expect(applyMotionFrame(program, plan).layers[0]!.visible).toBe(false);
  expect(() => applyMotionFrame(program, { ...plan, compositionId: "other" })).toThrow();
  expect(() => applyMotionFrame(program, { ...plan, mode: "static" })).toThrow();
  const recompiled = compileMotion(project, { compositionId: "cover" });
  expect(() => applyMotionFrame(recompiled, plan)).toThrow();
});
