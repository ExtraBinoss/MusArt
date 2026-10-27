import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import {
  hasFill,
  hasStroke,
  parseVectorGeometry,
  strokeWidth,
  vectorGeometryKey,
  vectorParts,
} from "../../../src/surface/vector/geometry";
const layer = () =>
  createLayer("vector", {
    width: 24,
    height: 24,
    vector: {
      viewBox: "10 20 24 24",
      parts: [{ path: "M10 20h10v10h-10z", matrix: [1, 0, 0, 1, 2, 3], fillRule: "evenodd" }],
    },
  });
it("triangulates viewBox paths once and keeps paint values outside geometry identity", () => {
  const l = layer(),
    key = vectorGeometryKey(l),
    parts = parseVectorGeometry(l);
  expect(parts).toHaveLength(1);
  parts[0]!.geometry.computeBoundingBox();
  expect(parts[0]!.geometry.boundingBox!.min.x).toBe(12);
  expect(parts[0]!.geometry.boundingBox!.min.y).toBe(23);
  expect(parts[0]!.partIndex).toBe(0);
  expect(
    vectorGeometryKey({
      ...l,
      fill: "#ff0000",
      vector: { ...l.vector!, parts: [{ ...l.vector!.parts![0]!, fill: "#00ff00", opacity: 0.5 }] },
    }),
  ).toBe(key);
  parts.forEach((p) => p.geometry.dispose());
  expect(vectorParts({ viewBox: "0 0 1 1" })).toEqual([{ path: "" }]);
  expect(() => vectorGeometryKey({ ...l, vector: undefined })).toThrow("absente");
  expect(() => parseVectorGeometry({ ...l, vector: undefined })).toThrow("absente");
});
it("handles stroke-only paths, widths, explicit none and empty paths", () => {
  const l = layer();
  l.vector!.strokeOnly = true;
  l.vector!.parts = [
    {
      path: "M10 20L20 30",
      stroke: "#123456",
      strokeWidth: 3,
      linecap: "square",
      linejoin: "bevel",
    },
  ];
  expect(hasFill(l, l.vector!.parts[0]!)).toBe(false);
  expect(hasStroke(l, l.vector!.parts[0]!)).toBe(true);
  expect(strokeWidth(l, l.vector!.parts[0]!)).toBe(3);
  l.vector!.preserveColors = true;
  expect(strokeWidth(l, {} as never)).toBe(1);
  l.strokeWidth = 4;
  expect(strokeWidth(l, {} as never)).toBe(4);
  l.vector!.preserveColors = false;
  expect(strokeWidth(l, l.vector!.parts[0]!)).toBe(4);
  const parts = parseVectorGeometry(l);
  expect(parts[0]!.kind).toBe("stroke");
  parts.forEach((p) => p.geometry.dispose());
  expect(hasStroke(l, { path: "", stroke: "none" })).toBe(false);
  l.vector!.parts = [{ path: "M0 0" }];
  expect(parseVectorGeometry(l)).toEqual([]);
});
it("disposes already-built geometry if later path parsing fails", () => {
  const l = layer(),
    parse = vi.spyOn(SVGLoader.prototype, "parse");
  const original = SVGLoader.prototype.parse;
  parse
    .mockImplementationOnce(function (this: SVGLoader, xml: string) {
      return original.call(this, xml);
    })
    .mockImplementationOnce(() => {
      throw new Error("parse failed");
    });
  l.vector!.parts!.push({ path: "broken" });
  expect(() => parseVectorGeometry(l)).toThrow("parse failed");
  parse.mockRestore();
});
