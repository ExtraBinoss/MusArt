import { describe, expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { createEffectUniforms, updateEffectUniforms } from "../../../src/effects/shared/uniforms";
describe("stable effect uniforms", () => {
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
