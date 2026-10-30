import { expect, test } from "vitest";
import { mascotTint } from "../../../src/ui/brand/tint";
import { brand } from "../../../src/ui/brand/config";
test("shares the brand center with a lighter and darker sRGB endpoint", () => {
  expect(mascotTint.map((stop) => stop.offset)).toEqual(["0%", "48%", "100%"]);
  expect(mascotTint[1]!.color).toBe(brand.colors.primary);
  expect(new Set(mascotTint.map((stop) => stop.color)).size).toBe(3);
  expect(Object.isFrozen(mascotTint)).toBe(true);
});
