import { it, expect } from "vitest";
import { validateMaskSource, validateMaskGraph } from "../../src/masks/validation";
import { box, asset } from "../support/fixture";
it("validates exactly one asset or layer source, modes and booleans", () => {
  validateMaskSource(
    { assetId: "asset", enabled: true, inverted: false },
    { asset: asset("asset") },
  );
  validateMaskSource({ layerId: "source", mode: "luminance", enabled: false, inverted: true }, {});
  for (const mask of [
    null,
    { enabled: true, inverted: false },
    { assetId: "a", layerId: "b", enabled: true, inverted: false },
    { assetId: "missing", enabled: true, inverted: false },
    { layerId: "source", mode: "red", enabled: true, inverted: false },
    { layerId: "source", enabled: 1, inverted: false },
  ])
    expect(() => validateMaskSource(mask, {})).toThrow();
});
it("rejects missing references and cyclic group/mask dependencies, including excessive depth", () => {
  const a = box("a", 0, 0, { mask: { layerId: "b", enabled: true, inverted: false } }),
    b = box("b", 0, 0, { mask: { layerId: "a", enabled: true, inverted: false } });
  expect(() => validateMaskGraph([a, b])).toThrow("Cyclic");
  expect(() => validateMaskGraph([a])).toThrow("missing");
  const chain = Array.from({ length: 130 }, (_, index) =>
    box(
      `n${index}`,
      0,
      0,
      index < 129 ? { mask: { layerId: `n${index + 1}`, enabled: true, inverted: false } } : {},
    ),
  );
  expect(() => validateMaskGraph(chain)).toThrow("Cyclic");
  validateMaskGraph([
    box("group", 0, 0, { kind: "group" }),
    box("child", 0, 0, { parentId: "group" }),
    box("target", 0, 0, { mask: { layerId: "child", enabled: true, inverted: false } }),
  ]);
});
