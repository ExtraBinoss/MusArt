import { expect, test } from "vitest";
import { createLayer } from "@musart/core";
import { getDropPosition, getDropCommand } from "../../../src/components/layers/drop-target";
test("distinguishes insertion edges, group body and explicit mask drops", () => {
  const shape = createLayer("rectangle"),
    group = createLayer("group");
  expect(getDropPosition(shape, 20, { top: 10, height: 40 }, false)).toBe("before");
  expect(getDropPosition(shape, 40, { top: 10, height: 40 }, false)).toBe("after");
  expect(getDropPosition(group, 30, { top: 10, height: 40 }, false)).toBe("inside");
  expect(getDropPosition(group, 11, { top: 10, height: 40 }, false)).toBe("before");
  expect(getDropPosition(shape, 20, { top: 10, height: 40 }, true)).toBe("mask");
  expect(getDropPosition(shape, 20, { top: 10, height: 0 }, false)).toBe("after");
  expect(getDropCommand("source", shape, "mask", [shape, group])).toEqual({
    type: "attachLayerMask",
    sourceId: "source",
    targetId: shape.id,
  });
  expect(getDropCommand("source", shape, "before", [shape, group])).toMatchObject({
    type: "reorderLayer",
    index: 1,
    parentId: null,
  });
  expect(getDropCommand("source", shape, "after", [shape, group])).toMatchObject({ index: 0 });
  expect(getDropCommand("source", group, "inside", [shape, group])).toMatchObject({
    index: 1,
    parentId: group.id,
  });
});
