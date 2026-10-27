import { expect, it } from "vitest";
import { foldsNode } from "../../../../../src/effects/gradient/treatments/folds/node";
import { nodeFixture } from "../../../node-fixture";
it("samples GPU texture data for folds without CPU resources or glyph allocations", () => {
  const f = nodeFixture("gradient"),
    node = foldsNode(f),
    key = node.getCacheKey();
  f.controls.gradient!.size.value = 12;
  expect(node.getCacheKey()).toBe(key);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
