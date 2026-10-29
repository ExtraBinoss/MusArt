import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { flashlightNode } from "../../../src/effects/flashlight/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("illuminates only source coverage and uses every authored elliptical control", () => {
  const fixture = nodeFixture("flashlight");
  const node = flashlightNode(fixture),
    graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  for (const uniform of Object.values(fixture.controls.parameters))
    expect(graph.has(uniform)).toBe(true);
  expect(graph.has(fixture.controls.colors.lightColor!)).toBe(true);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  expect(graph.has(fixture.controls.randomSeedUint)).toBe(true);
  expect(graph.has(fixture.controls.randomSeed)).toBe(false);
  expect(graph.has(fixture.controls.pixelFootprint)).toBe(false);
  expect(graph.has(fixture.controls.time)).toBe(false);
  const original = fixture.controls.parameters.radius;
  updateEffectUniforms(
    fixture.controls,
    createEffect("flashlight", {
      settings: { radius: 1.2, aspect: 2, rotation: 30, invert: true, lightColor: "#ff0000" },
    }),
    160,
    120,
    { width: 640, height: 480 },
  );
  expect(fixture.controls.parameters.radius).toBe(original);
  expect(original!.value).toBe(1.2);
  expect(fixture.controls.parameters.invert!.value).toBe(1);
  expect(fixture.controls.colors.lightColor!.value.toArray()).toEqual([1, 0, 0]);
  fixture.dispose();
});
