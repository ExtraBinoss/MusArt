import { expect, test } from "vitest";
import { PROFILE_SAMPLES, PROFILES } from "../../../../src/ui/brand/engine/profiles";
test("retains measured radial samples with one common closed-path topology", () => {
  expect(PROFILE_SAMPLES).toBe(64);
  for (const radii of Object.values(PROFILES)) {
    expect(radii).toHaveLength(64);
    expect(radii.every((r) => Number.isFinite(r) && r > 0)).toBe(true);
  }
});
