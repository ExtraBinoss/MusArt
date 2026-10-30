import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { effectStages } from "../../src/effects/pipeline";
import { gradientStages } from "../../src/effects/gradient/pipeline";
import { transitionStages } from "../../src/effects/transition/pipeline";
import { EFFECT_NODES } from "../../src/effects/registry";
it("shares the exact stage resolver between primitive, gradient and transition effects", () => {
  const gradient = createEffect("gradient", { settings: { treatment: "glass" } }),
    transition = createEffect("transition", { settings: { style: "defocus" } });
  expect(effectStages(gradient)).toEqual(gradientStages(gradient));
  expect(effectStages(transition)).toBe(transitionStages(transition));
  expect(effectStages(createEffect("brightness"))).toEqual([
    { key: "brightness", builder: EFFECT_NODES.brightness, final: true },
  ]);
  expect(() => effectStages({ ...createEffect("brightness"), type: "toString" as never })).toThrow(
    "inconnu",
  );
});
