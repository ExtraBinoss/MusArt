import { expect, it } from "vitest";
import { items } from "../../src/catalogs/icons";
it("retains every Lucide path as stroke geometry", () => {
  expect(items).toHaveLength(1848);
  expect(items.every((item) => item.id.startsWith("lucide:") && item.strokeOnly)).toBe(true);
});
