import { expect, it } from "vitest";
import { createLayer } from "@musart/core";
import { shapeControls, shapeNode, updateShape } from "../../src/surface/shapes";
it("keeps rectangle, ellipse, fill and stroke as GPU SDF uniforms", () => {
  const controls = shapeControls();
  const node = shapeNode(controls);
  const key = node.getCacheKey();
  updateShape(
    controls,
    createLayer("rectangle", {
      width: 100,
      height: 60,
      radius: 100,
      strokeWidth: 3,
      fill: "#ff000080",
    }),
    2,
  );
  expect(controls.size.value.toArray()).toEqual([200, 120]);
  expect(controls.radius.value).toBe(60);
  expect(controls.strokeWidth.value).toBe(6);
  expect(controls.fill.value.w).toBe(128 / 255);
  updateShape(controls, createLayer("ellipse"), 1);
  expect(controls.ellipse.value).toBe(1);
  expect(node.getCacheKey()).toBe(key);
});
