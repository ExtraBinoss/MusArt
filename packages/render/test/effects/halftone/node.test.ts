import { expect, it } from "vitest";
import { halftoneNode } from "../../../src/effects/halftone/node";
import { expectSourceAlpha, nodeFixture, graphNodes } from "../node-fixture";
it("preserves source alpha and keeps halftone parameters as stable GPU uniforms", () => {
  const fixture = nodeFixture("halftone");
  const node = halftoneNode(fixture);
  expectSourceAlpha(node, fixture.input);
  const key = node.getCacheKey();
  fixture.controls.amount.value = 0.37;
  fixture.controls.scale.value = 3;
  fixture.controls.color.value = 1;
  expect(node.getCacheKey()).toBe(key);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  expect(graphNodes(node).has(fixture.controls.logicalResolution)).toBe(true);
  expect(graphNodes(node).has(fixture.controls.resolution)).toBe(false);
  fixture.dispose();
});
