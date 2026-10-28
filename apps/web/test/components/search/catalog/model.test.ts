import { expect, test } from "vitest";
import { SEARCH_CATEGORIES } from "../../../../src/components/search/catalog/model";
test("declares unique categories covering editor commands and document navigation", () => {
  expect(new Set(SEARCH_CATEGORIES).size).toBe(SEARCH_CATEGORIES.length);
  expect(SEARCH_CATEGORIES).toEqual(
    expect.arrayContaining(["tools", "files", "layers", "pages", "help", "effects", "adjustments"]),
  );
});
