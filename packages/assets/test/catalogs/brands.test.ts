import { expect, it } from "vitest";
import { items } from "../../src/catalogs/brands";
it("retains original multicolor brand parts and their source-specific attribution", () => {
  expect(items).toHaveLength(57);
  expect(items.find((item) => item.id === "brand-google")!.parts!.length).toBeGreaterThan(1);
  expect(
    items.every((item) => item.source && item.license && item.attribution?.includes("Source:")),
  ).toBe(true);
});
