import { expect, it } from "vitest";
import { contrastNode } from "../../../src/effects/contrast/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
it("adjusts RGB contrast through the stable amount uniform and preserves original alpha", () => {
  const fixture = nodeFixture("contrast");
  const node = contrastNode(fixture);
  expectSourceAlpha(node, fixture.input);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
