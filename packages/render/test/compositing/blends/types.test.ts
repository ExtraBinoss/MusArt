import { expectTypeOf, it } from "vitest";
import type { BlendFunction, RGB } from "../../../src/compositing/blends/types";
it("types all blend functions as RGB-to-RGB expressions", () => {
  expectTypeOf<BlendFunction>().returns.toEqualTypeOf<RGB>();
});
