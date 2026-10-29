import { expect, test } from "vitest";
import { validateFillGradient, type FillGradient } from "@musart/core";
import {
  gradientRamp,
  insertStop,
  replaceStop,
  stopBounds,
  stopColorFields,
  withHexColor,
  withOpacity,
} from "../../../../src/components/properties/gradient/paint";

const gradient: FillGradient = {
  kind: "linear",
  angle: 135,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 0.25, color: "#00ff0080" },
    { offset: 1, color: "#0000ff" },
  ],
};

test("keeps ordered stops and fixed endpoints when moving a stop, including hard edges", () => {
  expect(stopBounds(gradient, 0)).toEqual([0, 0]);
  expect(stopBounds(gradient, 1)).toEqual([0, 1]);
  expect(stopBounds(gradient, 2)).toEqual([1, 1]);
  const changed = replaceStop(gradient, 1, { offset: 3, color: "#123456" });
  expect(changed.stops[1]).toEqual({ offset: 1, color: "#123456" });
  expect(replaceStop(gradient, 1, { offset: -1 }).stops[1]?.offset).toBe(0);
  expect(replaceStop(gradient, 0, { offset: 0.5 }).stops[0]?.offset).toBe(0);
  expect(replaceStop(gradient, 2, { offset: 0.5 }).stops[2]?.offset).toBe(1);
  expect(gradient.stops[1]).toEqual({ offset: 0.25, color: "#00ff0080" });
  expect(changed.stops[0]).toBe(gradient.stops[0]);
  expect(() => validateFillGradient(changed)).not.toThrow();
});

test("inserts a sampled stop into the widest gap and respects the eight-stop bound", () => {
  const next = insertStop(gradient)!;
  expect(next.index).toBe(2);
  expect(next.gradient.stops[2]).toEqual({ offset: 0.625, color: "#008080c0" });
  expect(gradient.stops).toHaveLength(3);
  let current = next.gradient;
  while (current.stops.length < 8) current = insertStop(current)!.gradient;
  expect(insertStop(current)).toBeNull();
  expect(() => validateFillGradient(current)).not.toThrow();
});

test("projects a horizontal editing ramp independently from the paint angle or kind", () => {
  const css = "linear-gradient(90deg, #ff0000 0%, #00ff0080 25%, #0000ff 100%)";
  expect(gradientRamp(gradient)).toBe(css);
  expect(gradientRamp({ ...gradient, kind: "radial", angle: 50 })).toBe(css);
});

test("keeps RGB and alpha independent, supports explicit RGBA and rejects invalid hex", () => {
  expect(stopColorFields("#abc8")).toEqual({ hex: "#AABBCC", opacity: (136 / 255) * 100 });
  expect(stopColorFields("#abc")).toEqual({ hex: "#AABBCC", opacity: 100 });
  expect(withOpacity("#abc", 50)).toBe("#aabbcc80");
  expect(withOpacity("#abc8", 101)).toBe("#aabbcc");
  expect(withOpacity("transparent", -1)).toBe("#00000000");
  expect(withHexColor("#abcdef80", "#123456")).toBe("#12345680");
  expect(withHexColor("#abcdef80", "#123")).toBe("#11223380");
  expect(withHexColor("#abcdef80", "#123f")).toBe("#112233");
  expect(withHexColor("#abcdef80", "#11223344")).toBe("#11223344");
  expect(withHexColor("#abcdef80", "transparent")).toBe("#00000000");
  expect(withHexColor("#abcdef80", "wrong")).toBeNull();
});
