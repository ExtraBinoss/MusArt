import { describe, expect, it } from "vitest";
import { EFFECT_CATALOG } from "@musart/core";
import { createEffect } from "@musart/core";
import { EFFECT_NODES, scaleEffectPixels } from "../../src/effects/registry";
import { nodeFixture, expectSourceAlpha } from "./node-fixture";
describe("effect implementation registry", () => {
  it("implements every core catalogue type without a central type switch", () => {
    expect(Object.keys(EFFECT_NODES).sort()).toEqual(
      Object.keys(EFFECT_CATALOG)
        .filter((type) => type !== "gradient")
        .sort(),
    );
    expect(Object.isFrozen(EFFECT_NODES)).toBe(true);
    for (const type of Object.keys(EFFECT_NODES) as Array<keyof typeof EFFECT_NODES>) {
      const fixture = nodeFixture(type);
      expectSourceAlpha(EFFECT_NODES[type](fixture), fixture.input);
      fixture.dispose();
    }
  });
});

it("scales pixel treatments for export without changing the resolution-independent Gradient field", () => {
  const effect = createEffect("gradient", {
    scale: 0.5,
    settings: { size: 4, borderRadius: 3, grainScale: 2 },
  });
  expect(scaleEffectPixels(effect, 2)).toMatchObject({
    scale: 0.5,
    settings: { size: 8, borderRadius: 6, grainScale: 4 },
  });
  expect(effect.settings).toEqual({ size: 4, borderRadius: 3, grainScale: 2 });
  expect(scaleEffectPixels(createEffect("dither", { scale: 4 }), 2).scale).toBe(8);
  expect(scaleEffectPixels(createEffect("brightness", { scale: 4 }), 2).scale).toBe(4);
});
