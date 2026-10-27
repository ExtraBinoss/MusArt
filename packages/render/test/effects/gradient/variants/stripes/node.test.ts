import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { uv } from "three/tsl";
import { fieldContext } from "../../../../../src/effects/gradient/shared/field";
import { createGradientUniforms } from "../../../../../src/effects/gradient/shared/uniforms";
import { stripesField } from "../../../../../src/effects/gradient/variants/stripes/node";
it("constructs the stripes field from the shared bounded palette and explicit clock", () => {
  const u = createGradientUniforms(createEffect("gradient")),
    result = stripesField(fieldContext(uv(), u));
  expect(result.color.isNode).toBe(true);
  expect(result.height.isNode).toBe(true);
  const key = result.color.getCacheKey();
  u.time.value = 2;
  expect(result.color.getCacheKey()).toBe(key);
});
