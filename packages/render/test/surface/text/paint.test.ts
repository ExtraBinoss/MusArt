import { expect, it } from "vitest";
import { createLayer } from "@musart/core";
import { textPaint, textPaintNode, updateTextPaint } from "../../../src/surface/text/paint";
it("updates stable solid/gradient uniforms including alpha, all eight stops and radial mode", () => {
  const controls = textPaint(),
    solid = controls.solid,
    colors = controls.colors;
  const layer = createLayer("text", { fill: "#ff000080" });
  updateTextPaint(controls, layer);
  expect(controls.mode.value).toBe(0);
  expect(controls.solid.value.w).toBeCloseTo(128 / 255);
  const stops = Array.from({ length: 8 }, (_, index) => ({
    offset: index / 7,
    color: index % 2 ? "#ffffff" : "#00000000",
  }));
  updateTextPaint(controls, { ...layer, fillGradient: { kind: "linear", angle: 90, stops } });
  expect(controls.mode.value).toBe(1);
  expect(controls.count.value).toBe(8);
  expect(controls.angle.value).toBeCloseTo(Math.PI / 2);
  expect(controls.offsets[7]!.value).toBe(1);
  updateTextPaint(controls, {
    ...layer,
    fillGradient: { kind: "radial", angle: 0, stops: [stops[0]!, stops[7]!] },
  });
  expect(controls.mode.value).toBe(2);
  expect(controls.count.value).toBe(2);
  expect(controls.solid).toBe(solid);
  expect(controls.colors).toBe(colors);
  expect(textPaintNode(controls).isNode).toBe(true);
});
