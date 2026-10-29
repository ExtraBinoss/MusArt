import { expect, it } from "vitest";
import { cyanotypeNode, cyanotypeWash } from "../../../src/effects/cyanotype/node";
import { uniform, vec2 } from "three/tsl";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
it("connects all tonal, seeded paper and color controls while preserving original alpha", () => {
  const d = nodeFixture("cyanotype"),
    node = cyanotypeNode(d),
    graph = graphNodes(node);
  expectSourceAlpha(node, d.input);
  for (const control of Object.values(d.controls.parameters)) expect(graph.has(control)).toBe(true);
  for (const color of Object.values(d.controls.colors)) expect(graph.has(color)).toBe(true);
  expect(graph.has(d.controls.randomSeedUint)).toBe(true);
  expect(graph.has(d.controls.randomSeed)).toBe(false);
  expect(graph.has(d.controls.logicalResolution)).toBe(true);
  expect(graph.has(d.controls.time)).toBe(false);
  expect(graph.has(d.controls.pixelFootprint)).toBe(false);
  expect(cyanotypeWash(vec2(1.5, 2.5), uniform(42)).isNode).toBe(true);
  expect(cyanotypeWash(vec2(1.5, 2.5), uniform(2 ** 30 + 1, "uint")).isNode).toBe(true);
  d.dispose();
});
