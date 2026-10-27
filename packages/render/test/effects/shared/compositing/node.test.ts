import { expect, it } from "vitest";
import { createEffect, EFFECT_COMPOSITE_MODES } from "@musart/core";
import { vec4 } from "three/tsl";
import { compositeEffect } from "../../../../src/effects/shared/compositing/node";
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
