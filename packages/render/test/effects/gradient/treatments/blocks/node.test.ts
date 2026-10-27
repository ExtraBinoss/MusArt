import { expect, it } from "vitest";
import { blocksNode } from "../../../../../src/effects/gradient/treatments/blocks/node";
import { nodeFixture } from "../../../node-fixture";
it("samples GPU texture data for blocks without CPU resources or glyph allocations", () => {
  const f = nodeFixture("gradient"),
    node = blocksNode(f),
    key = node.getCacheKey();
  f.controls.gradient!.size.value = 12;
  expect(node.getCacheKey()).toBe(key);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
