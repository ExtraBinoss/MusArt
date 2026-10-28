import { describe, expect, it } from "vitest";
import { asciiNode } from "../../../src/effects/ascii/node";
import { TextureNode } from "three/webgpu";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
describe("ASCII node", () => {
  it("uses a shared atlas and dynamic color, retaining exact source alpha outside glyph ink", () => {
    const fixture = nodeFixture("ascii");
    const node = asciiNode(fixture);
    const graph = graphNodes(node);
    expectSourceAlpha(node, fixture.input);
    expect(fixture.getGlyphAtlas).toHaveBeenCalledTimes(1);
    for (const key of ["amount", "scale", "logicalResolution", "pixelFootprint", "color"] as const)
      expect(graph.has(fixture.controls[key])).toBe(true);
    expect(
      [...graph].filter((node) => node instanceof TextureNode && node.value === fixture.atlas),
    ).toHaveLength(4);
    const key = node.getCacheKey();
    fixture.controls.pixelFootprint.value.set(0.25, 0.25);
    expect(node.getCacheKey()).toBe(key);
    expect(graph.has(fixture.controls.levels)).toBe(false);
    fixture.dispose();
  });
});
