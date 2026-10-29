import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { circleNode } from "../../../src/effects/circle/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { graphNodes, nodeFixture } from "../node-fixture";

it("connects every circle, color and opacity control, using only document coordinates for the screen", () => {
  const f = nodeFixture("circle"),
    graph = graphNodes(circleNode(f));
  for (const parameter of Object.values(f.controls.parameters))
    expect(graph.has(parameter)).toBe(true);
  for (const color of Object.values(f.controls.colors)) expect(graph.has(color)).toBe(true);
  for (const control of [f.controls.amount, f.controls.logicalResolution, f.controls.sourceFlipY])
    expect(graph.has(control)).toBe(true);
  for (const control of [
    f.controls.resolution,
    f.controls.pixelFootprint,
    f.controls.time,
    f.controls.randomSeed,
  ])
    expect(graph.has(control)).toBe(false);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});

it("updates scalar/select/color uniforms in place without changing screen density or allocating an atlas", () => {
  const f = nodeFixture("circle"),
    graph = graphNodes(circleNode(f));
  const parameters = { ...f.controls.parameters },
    colors = { ...f.controls.colors };
  updateEffectUniforms(
    f.controls,
    createEffect("circle", {
      settings: {
        spacing: 24,
        rotation: -30,
        polarity: "highlights",
        foreground: "#ff8000",
        backgroundOpacity: 0,
      },
    }),
    3840,
    2160,
    { width: 1920, height: 1080 },
  );
  for (const [key, node] of Object.entries(parameters)) {
    expect(f.controls.parameters[key]).toBe(node);
    expect(graph.has(node)).toBe(true);
  }
  for (const [key, node] of Object.entries(colors)) {
    expect(f.controls.colors[key]).toBe(node);
    expect(graph.has(node)).toBe(true);
  }
  expect(f.controls.parameters.spacing!.value).toBe(24);
  expect(f.controls.parameters.rotation!.value).toBe(-30);
  expect(f.controls.parameters.polarity!.value).toBe(1);
  expect(f.controls.parameters.backgroundOpacity!.value).toBe(0);
  expect(f.controls.colors.foreground!.value.toArray()).toEqual([1, 128 / 255, 0]);
  expect(f.controls.logicalResolution.value.toArray()).toEqual([1920, 1080]);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
