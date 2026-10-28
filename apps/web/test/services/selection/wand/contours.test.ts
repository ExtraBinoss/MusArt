import { expect, it } from "vitest";
import { selectionContour } from "../../../../src/services/selection/wand/contours";
it("outlines selected pixels and holes without changing exact alpha coverage", () => {
  const alpha = new Uint8Array([255, 128, 255, 255, 0, 255, 255, 255, 255]),
    before = alpha.slice(),
    result = selectionContour(alpha, 3, 3);
  expect(result.selected).toBe(8);
  expect(result.simplified).toBe(false);
  expect(result.path).toContain("M0 0H3");
  expect(result.path).toContain("M1 1H2");
  expect(result.path).toContain("M1 2H2");
  expect(alpha).toEqual(before);
  expect(selectionContour(new Uint8Array(4), 2, 2)).toEqual({
    path: "",
    selected: 0,
    simplified: false,
  });
});
it("bounds only display complexity while retaining the full selected-pixel count", () => {
  const width = 256,
    alpha = new Uint8Array(width * width);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) alpha[y * width + x] = x % 2 && y % 2 ? 255 : 0;
  const result = selectionContour(alpha, width, width);
  expect(result.selected).toBe((width * width) / 4);
  expect(result.simplified).toBe(true);
  expect(result.path.split("M").length - 1).toBeLessThanOrEqual(8192);
  const edge = selectionContour(new Uint8Array(2050).fill(255), 2050, 1);
  expect(edge.path).toContain("H2050");
  expect(edge.path).not.toContain("2052");
});
