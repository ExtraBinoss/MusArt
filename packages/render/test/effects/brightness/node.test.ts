import { expect, it } from "vitest";
import { brightnessNode } from "../../../src/effects/brightness/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
it("adjusts RGB brightness through the stable amount uniform and preserves original alpha", () => {
  const fixture = nodeFixture("brightness");
  const node = brightnessNode(fixture);
  expectSourceAlpha(node, fixture.input);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
