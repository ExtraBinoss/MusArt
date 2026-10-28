import { expect, it } from "vitest";
import { glassNode } from "../../../../../src/effects/gradient/treatments/glass/node";
import { graphNodes, nodeFixture } from "../../../node-fixture";
it("samples GPU texture data for glass without CPU resources or glyph allocations", () => {
  const f = nodeFixture("gradient"),
    node = glassNode(f),
    key = node.getCacheKey();
  f.controls.gradient!.size.value = 12;
  expect(node.getCacheKey()).toBe(key);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  expect(graphNodes(node).has(f.controls.logicalResolution)).toBe(true);
  expect(graphNodes(node).has(f.controls.resolution)).toBe(true); // sampling clamps remain physical
  f.dispose();
});
