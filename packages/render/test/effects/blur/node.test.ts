import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { blurNode } from "../../../src/effects/blur/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
it("keeps radius amount and scale live in one graph while preserving the uncluttered source alpha", () => {
  const fixture = nodeFixture("blur");
  const node = blurNode(fixture);
  const graph = graphNodes(node);
  expectSourceAlpha(node, fixture.input);
  expect(graph.has(fixture.controls.amount)).toBe(true);
  expect(graph.has(fixture.controls.scale)).toBe(true);
  expect(graph.has(fixture.controls.logicalResolution)).toBe(true);
  const cacheKey = node.getCacheKey();
  updateEffectUniforms(
    fixture.controls,
    createEffect("blur", { amount: 0.5, scale: 20 }),
    1920,
    1080,
  );
  expect(fixture.controls.amount.value * fixture.controls.scale.value).toBe(10);
  expect(node.getCacheKey()).toBe(cacheKey);
  fixture.dispose();
});
