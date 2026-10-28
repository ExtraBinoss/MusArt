import { expect, test } from "vitest";
import { createLayer } from "@musart/core";
import { alignmentReference } from "../../../../src/components/properties/alignment/reference";
test("chooses group for siblings, selection bounds for roots and page for safe cross-hierarchy alignment", () => {
  const a = createLayer("rectangle"),
    b = createLayer("rectangle"),
    group = createLayer("group");
  expect(alignmentReference([])).toBe("page");
  expect(alignmentReference([group])).toBe("page");
  expect(alignmentReference([a, b])).toBe("selection");
  expect(alignmentReference([{ ...a, parentId: group.id }])).toBe("parent");
  expect(
    alignmentReference([
      { ...a, parentId: group.id },
      { ...b, parentId: group.id },
    ]),
  ).toBe("parent");
  expect(alignmentReference([a, { ...b, parentId: group.id }])).toBe("page");
});
