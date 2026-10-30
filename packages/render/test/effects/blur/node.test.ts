import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { effectFootprint } from "../../../src/effects/shared/footprint";
import { effectStages } from "../../../src/effects/pipeline";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { nodeFixture } from "../node-fixture";
it("softens RGBA on two axes while keeping admitted bounds stable across amount animation", () => {
  const fixture = nodeFixture("blur");
  const radius = fixture.controls.scale,
    amount = fixture.controls.amount;
  for (const value of [0, 0.5, 1]) {
    const effect = createEffect("blur", { amount: value, scale: 20 });
    updateEffectUniforms(fixture.controls, effect, 320, 240);
    expect(fixture.controls.scale).toBe(radius);
    expect(fixture.controls.amount).toBe(amount);
    expect(radius.value * amount.value).toBe(20 * value);
    expect(effectFootprint([effect])).toEqual({ left: 65, top: 65, right: 65, bottom: 65 });
    expect(effectStages(effect).map((stage) => stage.final)).toEqual([false, true]);
  }
  expect(effectFootprint([createEffect("blur", { enabled: false })])).toEqual({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  });
  fixture.dispose();
});
