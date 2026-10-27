import { expect, it } from "vitest";
import { posterizeNode } from "../../../src/effects/posterize/node";
import { expectSourceAlpha, nodeFixture, graphNodes } from "../node-fixture";
it("preserves source alpha and keeps posterize parameters as stable GPU uniforms", () => {
  const fixture = nodeFixture("posterize");
  const node = posterizeNode(fixture);
  expectSourceAlpha(node, fixture.input);
  const key = node.getCacheKey();
  fixture.controls.amount.value = 0.37;
  fixture.controls.scale.value = 3;
  fixture.controls.color.value = 1;
  expect(node.getCacheKey()).toBe(key);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  fixture.dispose();
});
