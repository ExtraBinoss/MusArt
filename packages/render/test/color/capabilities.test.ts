import { expect, it } from "vitest";
import { RENDER_CAPABILITIES } from "../../src/color/capabilities";
it("reports actual RGB raster formats and explicitly identifies generic non-ICC proof", () => {
  expect(RENDER_CAPABILITIES.rasterFormats).toEqual(["png", "jpeg", "webp"]);
  expect(RENDER_CAPABILITIES.nativeCmykExport).toBe(true);
  expect(RENDER_CAPABILITIES.iccProfileProof).toBe(true);
  expect(RENDER_CAPABILITIES.cmykProof).toContain("not an ICC");
  expect(Object.isFrozen(RENDER_CAPABILITIES)).toBe(true);
});
