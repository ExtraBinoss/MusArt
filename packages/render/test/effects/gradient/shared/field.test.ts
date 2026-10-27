import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { uniform, vec2 } from "three/tsl";
import {
  fieldContext,
  gradientPhase,
  normalizedPalette,
  palette,
  rotate,
} from "../../../../src/effects/gradient/shared/field";
import { createGradientUniforms } from "../../../../src/effects/gradient/shared/uniforms";
it("builds a bounded six-color field with one explicit periodic clock and normalized coordinates", () => {
  const u = createGradientUniforms(createEffect("gradient")),
    p = vec2(0.2, 0.7);
  const context = fieldContext(p, u);
  expect(context.controls).toBe(u);
  expect(context.position).toBe(p);
  for (const node of [
    context.phase,
    gradientPhase(u),
    context.domain,
    context.wave,
    rotate(p, uniform(0)),
    palette(uniform(1), u),
    normalizedPalette(uniform(0.8), u),
  ])
    expect(node.isNode).toBe(true);
  const key = context.domain.getCacheKey();
  u.time.value = 4;
  u.colorCount.value = 2;
  expect(context.domain.getCacheKey()).toBe(key);
});
