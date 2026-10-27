import { expect, it } from "vitest";
import { GRADIENT_STYLES, GRADIENT_TREATMENTS } from "../../../src/effects/gradient/model";
it("keeps the seven fields and six treatment choices stable and immutable", () => {
  expect(GRADIENT_STYLES).toEqual([
    "mesh",
    "silk",
    "aurora",
    "liquid",
    "radial",
    "waves",
    "stripes",
  ]);
  expect(GRADIENT_TREATMENTS).toEqual(["none", "ascii", "dither", "blocks", "glass", "folds"]);
  expect(Object.isFrozen(GRADIENT_STYLES)).toBe(true);
  expect(Object.isFrozen(GRADIENT_TREATMENTS)).toBe(true);
});
