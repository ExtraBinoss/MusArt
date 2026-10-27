import { expect, it } from "vitest";
import { grayscaleNode } from "../../../src/effects/grayscale/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
it("mixes luminance through the stable amount uniform and preserves original alpha", () => {
  const fixture = nodeFixture("grayscale");
  const node = grayscaleNode(fixture);
  expectSourceAlpha(node, fixture.input);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
