import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { compileMotion } from "../../src/motion/compile";
import { evaluateMotion } from "../../src/motion/evaluate";
import type { CompositionMotion } from "../../src/motion/model";

function fixture() {
  const motion: CompositionMotion = {
    version: 1,
    initialized: true,
    mode: "motion",
    duration: { value: 4, rate: 1 },
    frameRate: { numerator: 30000, denominator: 1001 },
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
              { id: "key-a", time: { value: 0, rate: 1 }, value: 0 },
              {
                id: "key-b",
                time: { value: 1, rate: 1 },
                value: 100,
                easing: { type: "cubicBezier", x1: 0, y1: 0, x2: 1, y2: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
  return createProject({
    pages: [
      createPage({ id: "cover", layers: [createLayer("rectangle", { id: "hero" })], motion }),
    ],
  });
}

test("compiles a deeply frozen independent composition and captured segments", () => {
  const project = fixture();
  const program = compileMotion(project, { compositionId: "cover" });
  const page = project.pages[0]!;
  page.layers[0]!.x = 999;
  page.motion!.tracks[0]!.properties[0]!.keyframes[1]!.value = 200;
  Object.assign(page.motion!.tracks[0]!.properties[0]!.keyframes[1]!.easing!, { y1: 20 });
  expect(program.composition).not.toBe(page);
  expect(program.composition.layers[0]!.x).toBe(80);
  expect(evaluateMotion(program, { value: 1, rate: 2 }).values[0]!.value).toBe(50);
  expect(Object.isFrozen(program)).toBe(true);
  expect(Object.isFrozen(program.composition.motion!.tracks[0]!.properties[0]!.keyframes)).toBe(
    true,
  );
  expect(() => {
    program.composition.layers[0]!.x = 2;
  }).toThrow();
});

test("old Static documents compile without timelines or fake authored tracks", () => {
  const project = createProject({
    pages: [createPage({ id: "cover", layers: [createLayer("ellipse", { id: "hero" })] })],
  });
  const program = compileMotion(project, { compositionId: "cover" });
  expect(program.mode).toBe("static");
  expect(program.duration).toBeNull();
  expect(program.layers[0]!.properties).toEqual([]);
  expect(evaluateMotion(program, { value: 1000, rate: 1 }).activeLayerIds).toEqual(["hero"]);
});

test("rejects unknown composition and invalid tracks while compiling", () => {
  expect(() => compileMotion(fixture(), { compositionId: "missing" })).toThrow();
  const project = fixture();
  project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[1]!.value = NaN;
  expect(() => compileMotion(project, { compositionId: "cover" })).toThrow();
});

test("does not reread or clone caller-owned project state during sampling", () => {
  const project = fixture();
  const program = compileMotion(project, { compositionId: "cover" });
  const read = vi.fn(() => {
    throw new Error("Caller project was touched after compilation");
  });
  Object.defineProperty(project, "pages", { get: read });
  for (let index = 0; index < 100; index++) evaluateMotion(program, { value: index, rate: 100 });
  expect(read).not.toHaveBeenCalled();
});
