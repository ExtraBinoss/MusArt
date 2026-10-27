import { expect, it } from "vitest";
import { SHAPE_CATALOG, shapeDefinition } from "../../src/catalogs/core-shapes";
it("preserves closed core geometry and finds definitions without fallback substitution", () => {
  expect(SHAPE_CATALOG).toHaveLength(30);
  expect(
    SHAPE_CATALOG.every((shape) => shape.path.startsWith("M") && shape.path.endsWith("Z")),
  ).toBe(true);
  expect(shapeDefinition("star-5")).toMatchObject({
    viewBox: "0 0 100 100",
    width: 100,
    height: 100,
  });
  expect(shapeDefinition("missing")).toBeUndefined();
});
