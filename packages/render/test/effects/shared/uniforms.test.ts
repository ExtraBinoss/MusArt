import { describe, expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { createEffectUniforms, updateEffectUniforms } from "../../../src/effects/shared/uniforms";
describe("stable effect uniforms", () => {
  it("retains the full portable seed in a stable uint uniform without changing the legacy float port", () => {
    const effect = createEffect("noise"),
      controls = createEffectUniforms(effect, 64, 64),
      integer = controls.randomSeedUint,
      legacy = controls.randomSeed;
    expect(integer.nodeType).toBe("uint");
    for (const seed of [0, 2 ** 30, 2 ** 30 + 1, 2147483647]) {
      updateEffectUniforms(controls, { ...effect, seed }, 64, 64);
      expect(controls.randomSeedUint).toBe(integer);
      expect(controls.randomSeed).toBe(legacy);
      expect(integer.value).toBe(seed);
      expect(new Uint32Array([integer.value])[0]).toBe(seed);
      expect(legacy.value).toBe(seed);
    }
    expect(new Float32Array([2 ** 30, 2 ** 30 + 1])[0]).toBe(
      new Float32Array([2 ** 30, 2 ** 30 + 1])[1],
    );
  });
  it("updates values in place, including color mode, without changing node or vector identity", () => {
    const effect = createEffect("dither");
    const controls = createEffectUniforms(effect, 100, 200);
    const before = { ...controls };
    const resolution = controls.resolution.value;
    const seed = controls.seed.value;
    controls.sourceFlipY.value = 1;
    updateEffectUniforms(
      controls,
      { ...effect, amount: 0.25, scale: 5, levels: 8, color: true, seed: 7 },
      300,
      400,
    );
    for (const key of Object.keys(before) as Array<keyof typeof controls>)
      expect(controls[key]).toBe(before[key]);
    expect(controls.amount.value).toBe(0.25);
    expect(controls.scale.value).toBe(5);
    expect(controls.levels.value).toBe(7);
    expect(controls.color.value).toBe(1);
    expect(controls.sourceFlipY.value).toBe(1);
    expect(controls.seed.value).toBe(seed);
    expect(seed.toArray()).toEqual([3, 1]);
    expect(controls.resolution.value).toBe(resolution);
    expect(resolution.toArray()).toEqual([300, 400]);
  });
  it("bounds transient values and changes color without requiring a second material variant", () => {
    const controls = createEffectUniforms(
      createEffect("ascii", { amount: 2, scale: 0, levels: 1, color: true }),
      1,
      1,
    );
    expect(controls.amount.value).toBe(1);
    expect(controls.scale.value).toBe(1);
    expect(controls.levels.value).toBe(1);
    expect(controls.color.value).toBe(1);
    updateEffectUniforms(
      controls,
      createEffect("ascii", { amount: -1, scale: 0, levels: 0, color: false }),
      2,
      3,
    );
    expect(controls.amount.value).toBe(0);
    expect(controls.scale.value).toBe(1);
    expect(controls.levels.value).toBe(1);
    expect(controls.color.value).toBe(0);
  });
});

it.each([0.25, 0.5, 1, 2, 4])(
  "keeps authored motif sizes and seeds unchanged at raster density %s",
  (density) => {
    const effect = createEffect("grain", { amount: 0.7, scale: 1, seed: 9321 });
    const logical = { width: 31.25, height: 23.5 };
    const width = Math.ceil(logical.width * density),
      height = Math.ceil(logical.height * density);
    const controls = createEffectUniforms(effect, width, height, logical);
    expect(controls.scale.value).toBe(1);
    expect(controls.randomSeed.value).toBe(9321);
    expect(controls.logicalResolution.value.toArray()).toEqual([31.25, 23.5]);
    expect(controls.resolution.value.toArray()).toEqual([width, height]);
    expect(controls.pixelFootprint.value.toArray()).toEqual([31.25 / width, 23.5 / height]);
    const retained = { ...controls };
    updateEffectUniforms(controls, effect, width * 2, height * 2, logical);
    expect(controls.logicalResolution).toBe(retained.logicalResolution);
    expect(controls.pixelFootprint).toBe(retained.pixelFootprint);
    expect(controls.logicalResolution.value.toArray()).toEqual([31.25, 23.5]);
    expect(controls.scale.value).toBe(1);
  },
);
it("keeps gradient treatment, grain and corner dimensions in authored units at large density", () => {
  const effect = createEffect("gradient", {
    scale: 0.5,
    settings: { size: 480, grainScale: 5, borderRadius: 1024 },
  });
  const controls = createEffectUniforms(effect, 4096, 4096, { width: 1024, height: 1024 });
  expect(controls.gradient!.scale.value).toBe(0.5);
  expect(controls.gradient!.size.value).toBe(480);
  expect(controls.gradient!.grainScale.value).toBe(5);
  expect(controls.gradient!.borderRadius.value).toBe(1024);
  expect(controls.pixelFootprint.value.toArray()).toEqual([0.25, 0.25]);
  expect(effect.settings).toEqual({ size: 480, grainScale: 5, borderRadius: 1024 });
});
