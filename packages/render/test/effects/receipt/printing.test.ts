import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { vec2 } from "three/tsl";
import { receiptInk } from "../../../src/effects/receipt/printing";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { nodeFixture } from "../node-fixture";

it("keeps nine source stamps and all thermal dot modes on one uniform-driven graph", () => {
  const f = nodeFixture("receipt"),
    effect = createEffect("receipt"),
    graph = receiptInk(vec2(80, 90), f),
    key = graph.getCacheKey();
  for (const mode of ["ordered", "stochastic", "threshold"]) {
    updateEffectUniforms(
      f.controls,
      {
        ...effect,
        scale: 12,
        seed: 987,
        settings: {
          ...effect.settings,
          mode,
          dotSpread: 0.4,
          dotSoftness: 0.6,
          marginX: 0.45,
          marginY: 0.45,
          wear: 1,
          invert: true,
          fit: "stretch",
        },
      },
      320,
      240,
    );
    expect(graph.getCacheKey()).toBe(key);
  }
  expect(f.controls.parameters.mode!.value).toBe(2);
  expect(f.controls.parameters.wear!.value).toBe(1);
  expect(f.controls.parameters.fit!.value).toBe(1);
  expect(graph.isNode).toBe(true);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
