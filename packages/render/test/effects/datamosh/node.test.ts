import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { datamoshNode } from "../../../src/effects/datamosh/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";

it("retains original source alpha and one static shader graph for all spatial/phase controls", () => {
  const f = nodeFixture("datamosh"),
    node = datamoshNode(f),
    key = node.getCacheKey();
  expectSourceAlpha(node, f.input);
  expect(graphNodes(node).has(f.source)).toBe(true);
  const identities = { ...f.controls.parameters };
  updateEffectUniforms(
    f.controls,
    createEffect("datamosh", {
      amount: 0.5,
      seed: 9321,
      levels: 8,
      time: 3.5,
      settings: {
        blockSize: 48,
        density: 1,
        displacement: 96,
        direction: -90,
        angleVariation: 120,
        coherence: 0,
        smear: 1,
        chromaShift: 12,
        rate: 4,
      },
    }),
    3840,
    2160,
    { width: 1920, height: 1080 },
  );
  for (const [key, uniform] of Object.entries(identities))
    expect(f.controls.parameters[key]).toBe(uniform);
  expect(f.controls.parameters.blockSize!.value).toBe(48);
  expect(f.controls.parameters.density!.value).toBe(1);
  expect(f.controls.parameters.direction!.value).toBe(-90);
  expect(f.controls.parameters.coherence!.value).toBe(0);
  expect(f.controls.parameters.smear!.value).toBe(1);
  expect(f.controls.parameters.rate!.value).toBe(4);
  expect(f.controls.levels.value).toBe(7);
  expect(f.controls.randomSeed.value).toBe(9321);
  expect(f.controls.randomSeedUint.value).toBe(9321);
  expect(f.controls.time.value).toBe(3.5);
  expect(f.controls.logicalResolution.value.toArray()).toEqual([1920, 1080]);
  expect(node.getCacheKey()).toBe(key);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
