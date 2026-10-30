import { expect, test } from "vitest";
import * as api from "../../../src/ui/brand";
test("exposes the copied complete geometry engine and reusable SVG morph interface", () => {
  expect(api.brand.name).toBe("Melt");
  expect(api.createDahliaEngine()).toBeInstanceOf(api.BotEngine);
  expect(api.svgInterpolator("opacity", 0, 1)!(0.5)).toBe(0.5);
  for (const name of ["MeltLogo", "BrandStatus", "MorphPath", "createBrandActivity"] as const)
    expect(api[name]).toBeDefined();
});
