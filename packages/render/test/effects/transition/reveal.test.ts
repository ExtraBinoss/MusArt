import { expect, it } from "vitest";
import { TextureNode } from "three/webgpu";
import * as operators from "../../../src/effects/transition/reveal";
import { transitionField } from "../../../src/effects/transition/shared";
import { graphNodes, nodeFixture } from "../node-fixture";

it("keeps the reveal family explicit and finite", () => {
  expect(Object.keys(operators)).toHaveLength(5);
  expect(new Set(Object.values(operators)).size).toBe(5);
});
it.each(Object.entries(operators))(
  "builds %s from deterministic authored progress with bounded texture samples",
  (_name, operator) => {
    const f = nodeFixture("transition"),
      field = transitionField(f),
      node = operator(field);
    expect(node.isNode).toBe(true);
    const graph = graphNodes(node);
    expect(graph.has(f.controls.parameters.progress!)).toBe(true);
    expect(graph.has(f.controls.time)).toBe(false);
    expect(graph.has(f.controls.resolution)).toBe(false);
    expect(graph.has(f.controls.pixelFootprint)).toBe(false);
    const samples = [...graph].filter(
      (child) => child instanceof TextureNode && child.value === f.input && child.uvNode !== null,
    );
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(9);
    expect(f.getGlyphAtlas).not.toHaveBeenCalled();
    const key = node.getCacheKey();
    f.controls.parameters.progress!.value = 0.375;
    expect(node.getCacheKey()).toBe(key);
    f.dispose();
  },
);
