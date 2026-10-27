import { expect, it } from "vitest";
import { items } from "../../src/catalogs/shapes";
it("retains the 72 gallery paths and their original viewboxes", () => {
  expect(items).toHaveLength(72);
  expect(items.every((item) => item.viewBox === "0 0 256 256" && item.path)).toBe(true);
});
