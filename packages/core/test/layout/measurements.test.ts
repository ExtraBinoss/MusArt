import { it, expect } from "vitest";
import { createPage } from "../../src/document/factories";
import { layoutBoxes, measureLayer } from "../../src/layout/measurements";
import { box } from "../support/fixture";
import { transformPoint, getWorldMatrix } from "../../src/layers/geometry";
it("measures border, inner padding, outer margins and page safe-area distances", () => {
  const layer = box("a", 30, 40, {
      padding: { top: 5, right: 10, bottom: 15, left: 20 },
      margin: { top: 2, right: 3, bottom: 4, left: 5 },
    }),
    page = createPage({
      width: 1000,
      height: 800,
      margins: { top: 10, right: 20, bottom: 30, left: 15 },
      layers: [layer],
    });
  expect(layoutBoxes(layer)).toEqual({
    border: { x: 0, y: 0, width: 100, height: 80 },
    content: { x: 20, y: 5, width: 70, height: 60 },
    outer: { x: -5, y: -2, width: 108, height: 86 },
  });
  const measurement = measureLayer(page, "a");
  expect(measurement.distances).toEqual({ left: 15, top: 30, right: 850, bottom: 650 });
  expect(measurement.arrows[0]).toEqual({
    axis: "x",
    from: { x: 15, y: 80 },
    to: { x: 30, y: 80 },
    value: 15,
  });
  expect(measurement.content).toMatchObject({ x: 50, y: 45, width: 70, height: 60 });
  expect(layoutBoxes(box("plain")).content).toMatchObject({ width: 100, height: 80 });
});
it("transforms arrows through rotated ancestors and uses their padding bounds", () => {
  const parent = box("g", 100, 200, {
      kind: "group",
      width: 400,
      height: 300,
      rotation: 90,
      padding: { top: 10, right: 20, bottom: 30, left: 40 },
    }),
    child = box("c", 60, 70, { parentId: "g" }),
    page = createPage({ layers: [parent, child] });
  const result = measureLayer(page, "c");
  expect(result.distances).toEqual({ left: 20, top: 60, right: 220, bottom: 120 });
  const expected = transformPoint(getWorldMatrix(page, "g"), { x: 40, y: 110 });
  expect(result.arrows[0]!.from.x).toBeCloseTo(expected.x);
  expect(result.arrows[0]!.from.y).toBeCloseTo(expected.y);
  expect(result.bounds.width).toBeCloseTo(80);
  expect(() => measureLayer(page, "absent")).toThrow();
});
