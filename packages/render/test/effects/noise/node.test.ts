import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { noiseNode } from "../../../src/effects/noise/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("preserves source alpha and seeded explicit-time noise on one stable GPU graph", () => {
  const fixture = nodeFixture("noise"),
    node = noiseNode(fixture),
    key = node.getCacheKey(),
    parameters = { ...fixture.controls.parameters },
    colors = { ...fixture.controls.colors },
    effect = createEffect("noise");
  expectSourceAlpha(node, fixture.input);
  expect(graphNodes(node).has(fixture.source)).toBe(true);
  updateEffectUniforms(
    fixture.controls,
    {
      ...effect,
      amount: 0.4,
      scale: 256,
      seed: 1234,
      color: true,
      time: 3.5,
      settings: {
        algorithm: "worley",
        jitter: 0.25,
        offsetX: 128,
        offsetY: -64,
        offsetZ: 1.5,
        speed: 0.5,
        contrast: 1.2,
        brightness: 0.1,
        gamma: 1.1,
        invert: true,
        mode: "add",
        lowColor: "#102030",
        highColor: "#80c0ff",
      },
    },
    432,
    768,
    { width: 1080, height: 1920 },
  );
  expect(node.getCacheKey()).toBe(key);
  for (const [name, value] of Object.entries(parameters))
    expect(fixture.controls.parameters[name]).toBe(value);
  for (const [name, value] of Object.entries(colors))
    expect(fixture.controls.colors[name]).toBe(value);
  expect(fixture.controls.parameters.algorithm!.value).toBe(3);
  expect(fixture.controls.parameters.mode!.value).toBe(1);
  expect(fixture.controls.parameters.offsetX!.value).toBe(128);
  expect(fixture.controls.parameters.offsetY!.value).toBe(-64);
  expect(fixture.controls.parameters.offsetZ!.value).toBe(1.5);
  expect(fixture.controls.parameters.invert!.value).toBe(1);
  expect(fixture.controls.time.value).toBe(3.5);
  expect(fixture.controls.logicalResolution.value.toArray()).toEqual([1080, 1920]);
  expect(fixture.controls.resolution.value.toArray()).toEqual([432, 768]);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
