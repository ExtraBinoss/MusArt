import { expect, test } from "vitest";
import { brand } from "../../../src/ui/brand/config";
test("shares the Melt identity, original Dahlia look and SVG asset contract", () => {
  expect(brand).toMatchObject({
    name: "Melt",
    colors: { primary: "#8B5CF6", action: "#7C3AED", foreground: "#FFFFFF", onPrimary: "#FFFFFF" },
    mascot: { shape: "fleur8", expression: "surpris", eyes: "capsule" },
  });
  expect(brand.assets.icon).toBe("branding/melt.svg");
  expect(brand.assets.maskableIcon).toBe("branding/melt-maskable.svg");
});
