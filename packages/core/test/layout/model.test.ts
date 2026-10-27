import { it, expect, expectTypeOf } from "vitest";
import { ZERO_INSETS, type Insets, type WorkingColorSpace } from "../../src/layout/model";
it("has immutable zero spacing and explicit working spaces", () => {
  expect(ZERO_INSETS).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(Object.isFrozen(ZERO_INSETS)).toBe(true);
  expectTypeOf<Insets>().toEqualTypeOf<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>();
  expectTypeOf<WorkingColorSpace>().toEqualTypeOf<"srgb" | "display-p3" | "cmyk-proof">();
});
