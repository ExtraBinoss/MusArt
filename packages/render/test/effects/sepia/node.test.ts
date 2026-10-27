import { expect, it } from "vitest";
import { sepiaNode } from "../../../src/effects/sepia/node";
import { expectSourceAlpha, nodeFixture, graphNodes } from "../node-fixture";
it("preserves source alpha and keeps sepia parameters as stable GPU uniforms", () => {
  const fixture = nodeFixture("sepia");
  const node = sepiaNode(fixture);
  expectSourceAlpha(node, fixture.input);
  const key = node.getCacheKey();
  fixture.controls.amount.value = 0.37;
  fixture.controls.scale.value = 3;
  fixture.controls.color.value = 1;
  expect(node.getCacheKey()).toBe(key);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  fixture.dispose();
});
