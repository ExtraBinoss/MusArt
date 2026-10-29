import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { MathNode } from "three/webgpu";
import { rippleNode } from "../../../src/effects/ripple/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("connects every radial/refraction parameter and deterministic time without raster-density inputs", () => {
  const fixture = nodeFixture("ripple");
  const node = rippleNode(fixture);
  const graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  for (const control of Object.values(fixture.controls.parameters))
    expect(graph.has(control)).toBe(true);
  for (const control of [
    fixture.controls.amount,
    fixture.controls.time,
    fixture.controls.logicalResolution,
    fixture.controls.sourceFlipY,
  ])
    expect(graph.has(control)).toBe(true);
  for (const control of [
    fixture.controls.resolution,
    fixture.controls.pixelFootprint,
    fixture.controls.randomSeed,
  ])
    expect(graph.has(control)).toBe(false);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});

it("updates wave and time uniforms in place while raster density changes leave document coordinates intact", () => {
  const fixture = nodeFixture("ripple");
  const node = rippleNode(fixture);
  const identities = { ...fixture.controls.parameters };
  updateEffectUniforms(
    fixture.controls,
    createEffect("ripple", {
      time: 2.5,
      settings: {
        centerX: 0.2,
        centerY: 0.7,
        innerRadius: 32,
        radius: 256,
        amplitude: 18,
        direction: "inward",
      },
    }),
    384,
    216,
    { width: 1920, height: 1080 },
  );
  for (const [key, value] of Object.entries(identities)) {
    expect(fixture.controls.parameters[key]).toBe(value);
    expect(graphNodes(node).has(value)).toBe(true);
  }
  expect(fixture.controls.parameters.centerX!.value).toBe(0.2);
  expect(fixture.controls.parameters.centerY!.value).toBe(0.7);
  expect(fixture.controls.parameters.innerRadius!.value).toBe(32);
  expect(fixture.controls.parameters.radius!.value).toBe(256);
  expect(fixture.controls.parameters.amplitude!.value).toBe(18);
  expect(fixture.controls.parameters.direction!.value).toBe(1);
  expect(fixture.controls.time.value).toBe(2.5);
  expect(fixture.controls.logicalResolution.value.toArray()).toEqual([1920, 1080]);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});

it("reduces spatial and temporal cycles independently before combining large legal times", () => {
  const fixture = nodeFixture("ripple");
  const graph = graphNodes(rippleNode(fixture));
  const reductions = [...graph].filter(
    (node) => node instanceof MathNode && node.method === "fract",
  );
  const spatial = reductions.find((node) => {
    const branch = graphNodes(node);
    return branch.has(fixture.controls.logicalResolution) && !branch.has(fixture.controls.time);
  });
  const temporal = reductions.find((node) => {
    const branch = graphNodes(node);
    return branch.has(fixture.controls.time) && !branch.has(fixture.controls.logicalResolution);
  });
  expect(spatial).toBeDefined();
  expect(temporal).toBeDefined();
  expect(graphNodes(temporal!).has(fixture.controls.parameters.speed!)).toBe(true);
  expect(graphNodes(spatial!).has(fixture.controls.parameters.wavelength!)).toBe(true);
  expect(
    reductions.some((node) => {
      const branch = graphNodes(node);
      return branch.has(spatial!) && branch.has(temporal!);
    }),
  ).toBe(true);
  updateEffectUniforms(
    fixture.controls,
    createEffect("ripple", {
      time: 86400,
      settings: { speed: 1024, wavelength: 2 },
    }),
    1920,
    1080,
  );
  expect(fixture.controls.time.value).toBe(86400);
  expect(fixture.controls.parameters.speed!.value).toBe(1024);
  expect(fixture.controls.parameters.wavelength!.value).toBe(2);
  fixture.dispose();
});
