import { expect, test } from "vitest";
import { createLayer } from "@musart/core";
import { completeDrawing, resizeDrawing } from "../../../src/canvas/interaction/drawing";

test("text drawing uses the chosen rectangle in every direction and ignores shape aspect modifiers", () => {
  const layer = createLayer("text");
  const from = { x: 200, y: 150 };
  expect(resizeDrawing(layer, from, { x: 40, y: 90 }, true)).toMatchObject({
    x: 40,
    y: 90,
    width: 160,
    height: 60,
  });
  expect(resizeDrawing(layer, from, { x: 320, y: 200 }, false)).toMatchObject({
    x: 200,
    y: 150,
    width: 120,
    height: 50,
  });
  expect(resizeDrawing(layer, from, from, false)).toMatchObject({ width: 1, height: 1 });
  const tiny = resizeDrawing(layer, from, { x: 201, y: 250 }, false);
  expect(completeDrawing(tiny, true)).toBe(tiny);
  expect(completeDrawing(tiny, false)).toMatchObject({ width: 360, height: 100 });
});

test("shape aspect constraints keep the opposite corner anchored and retain click defaults", () => {
  const layer = createLayer("rectangle");
  const frame = resizeDrawing(layer, { x: 200, y: 150 }, { x: 100, y: 120 }, true);
  expect(frame).toMatchObject({ x: 100, y: 50, width: 100, height: 100 });
  expect(completeDrawing(frame, true)).toBe(frame);
  expect(
    completeDrawing(resizeDrawing(layer, { x: 0, y: 0 }, { x: 0, y: 0 }, false), false),
  ).toMatchObject({ width: 180, height: 140 });
});
