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
test("thumbnail geometry adds a mask while row edges and labels retain normal insertion", () => {
  const shape = createLayer("rectangle"),
    bounds = { top: 0, height: 40 },
    thumbnail = { left: 10, top: 8, width: 24, height: 24 };
  expect(getDropPosition(shape, 20, bounds, false, { clientX: 20, thumbnail })).toBe("mask");
  expect(getDropPosition(shape, 20, bounds, false, { clientX: 8, thumbnail })).toBe("mask");
  expect(getDropPosition(shape, 20, bounds, false, { clientX: 45, thumbnail })).toBe("after");
  expect(getDropPosition(shape, 2, bounds, false, { clientX: 20, thumbnail })).toBe("before");
  expect(getDropPosition(shape, 38, bounds, false, { clientX: 20, thumbnail })).toBe("after");
  expect(
    getDropPosition(shape, 20, bounds, false, {
      clientX: 20,
      thumbnail: { ...thumbnail, width: 0 },
    }),
  ).toBe("after");
});
