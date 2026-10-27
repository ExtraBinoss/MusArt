import { expect, it } from "vitest";
import { parseColor } from "../../../src/compositing/nodes/color";
it("parses raw sRGB with explicit alpha without color-space conversion", () => {
  expect(parseColor("transparent").toArray()).toEqual([0, 0, 0, 0]);
  expect(parseColor("TRANSPARENT").toArray()).toEqual([0, 0, 0, 0]);
  expect(parseColor("#fff").toArray()).toEqual([1, 1, 1, 1]);
  expect(parseColor("#f00f").toArray()).toEqual([1, 0, 0, 1]);
  expect(parseColor("#899cb4").toArray()).toEqual([137 / 255, 156 / 255, 180 / 255, 1]);
  expect(parseColor("#00000080").w).toBe(128 / 255);
  expect(() => parseColor("red")).toThrow("Couleur");
});
