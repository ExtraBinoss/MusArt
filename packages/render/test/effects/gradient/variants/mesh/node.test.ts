import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { uv } from "three/tsl";
import { fieldContext } from "../../../../../src/effects/gradient/shared/field";
import { createGradientUniforms } from "../../../../../src/effects/gradient/shared/uniforms";
import { meshField } from "../../../../../src/effects/gradient/variants/mesh/node";
it("constructs the mesh field from the shared bounded palette and explicit clock", () => {
  const u = createGradientUniforms(createEffect("gradient")),
    result = meshField(fieldContext(uv(), u));
  expect(result.color.isNode).toBe(true);
  expect(result.height.isNode).toBe(true);
  const key = result.color.getCacheKey();
  u.time.value = 2;
  expect(result.color.getCacheKey()).toBe(key);
});
