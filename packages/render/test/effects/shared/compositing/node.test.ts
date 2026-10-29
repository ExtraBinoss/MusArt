import { expect, it } from "vitest";
import { createEffect, EFFECT_COMPOSITE_MODES } from "@musart/core";
import { uniform, vec4 } from "three/tsl";
import {
  compositeEffect,
  mixEffectCoverage,
} from "../../../../src/effects/shared/compositing/node";
import {
  createEffectUniforms,
  updateEffectUniforms,
} from "../../../../src/effects/shared/uniforms";
it("keeps all effect blends and Porter-Duff operators on a stable GPU graph", () => {
  const effect = createEffect("gradient"),
    u = createEffectUniforms(effect, 10, 20);
  const graph = compositeEffect(vec4(0.2, 0.3, 0.4, 0.5), vec4(0.8, 0.9, 0.1, 0.5), u),
    key = graph.getCacheKey();
  for (const composite of EFFECT_COMPOSITE_MODES) {
    updateEffectUniforms(
      u,
      { ...effect, composite, blendMode: "multiply", amount: 0.5, opacity: 0.8 },
      10,
      20,
    );
    expect(u.composite.value).toBe(EFFECT_COMPOSITE_MODES.indexOf(composite));
    expect(u.opacity.value).toBe(0.4);
    expect(graph.getCacheKey()).toBe(key);
  }
});
it("retains one coverage-interpolation graph for zero, partial and full effect amount", () => {
  const amount = uniform(0),
    graph = mixEffectCoverage(vec4(1, 0, 0, 1), vec4(0, 0, 0, 0), amount);
  const key = graph.getCacheKey();
  for (const value of [0, 0.5, 1]) {
    amount.value = value;
    expect(graph.getCacheKey()).toBe(key);
  }
  // Actual red-source edge/partial-alpha values are verified in CRT/Shatter native PNG tests.
  expect(graph.isNode).toBe(true);
});
