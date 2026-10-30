import { expect, test } from "vitest";
import { RAYON, DEMI_VIEWBOX } from "../../../../src/ui/brand/engine/repere";
test("preserves the original engine's units and full-motion viewport", () => {
  expect(RAYON).toBe(100);
  expect(DEMI_VIEWBOX).toBe(158);
});
