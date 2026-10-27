import { expect, it } from "vitest";
import { EFFECT_COMPOSITE_MODES } from "../../src/effects/compositing";
it("exposes thirteen immutable and distinct Porter-Duff operators", () => {
  expect(EFFECT_COMPOSITE_MODES).toHaveLength(13);
  expect(new Set(EFFECT_COMPOSITE_MODES).size).toBe(13);
  expect(Object.isFrozen(EFFECT_COMPOSITE_MODES)).toBe(true);
  expect(EFFECT_COMPOSITE_MODES).toContain("destination-atop");
});
