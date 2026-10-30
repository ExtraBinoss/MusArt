import { expect, test } from "vitest";
import data from "../../../../src/ui/brand/engine/eye-fit-data";
import { SHAPES } from "../../../../src/ui/brand/engine/skins";
test("retains the generated fit table for every genuine shape and the Dahlia's wonder pose", () => {
  expect(Object.keys(data)).toEqual(SHAPES.map((shape) => shape.id));
  expect(data.fleur8!["idle|surpris"]).toEqual({ x: 0, y: 0 });
  expect(data.fleur8!["idle|neutre"]).toEqual({ x: -0.090761, y: 0.052401 });
  for (const poses of Object.values(data))
    for (const point of Object.values(poses))
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
});
