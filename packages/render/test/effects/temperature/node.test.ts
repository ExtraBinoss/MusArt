import { expect, it } from "vitest";
import { temperatureNode } from "../../../src/effects/temperature/node";
import { expectSourceAlpha, nodeFixture, graphNodes } from "../node-fixture";
it("preserves source alpha and keeps temperature parameters as stable GPU uniforms", () => {
  const fixture = nodeFixture("temperature");
  const node = temperatureNode(fixture);
  expectSourceAlpha(node, fixture.input);
  const key = node.getCacheKey();
  fixture.controls.amount.value = 0.37;
  fixture.controls.scale.value = 3;
  fixture.controls.color.value = 1;
  expect(node.getCacheKey()).toBe(key);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  fixture.dispose();
});
