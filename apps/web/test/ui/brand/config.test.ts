import { expect, test } from "vitest";
import { brand } from "../../../src/ui/brand/config";
test("shares the Melt identity, original Dahlia look and SVG asset contract", () => {
  expect(brand).toMatchObject({
    name: "Melt",
    colors: { primary: "#B39ADB", action: "#8763C8", foreground: "#FFFFFF", onPrimary: "#FFFFFF" },
    mascot: { shape: "fleur8", expression: "surpris", eyes: "capsule" },
  });
  expect(brand.assets.icon).toBe("branding/melt.svg");
  expect(brand.assets.maskableIcon).toBe("branding/melt-maskable.svg");
});
