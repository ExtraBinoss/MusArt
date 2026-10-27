import { describe, expect, it } from "vitest";
import { ditherNode } from "../../../src/effects/dither/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
describe("dither node", () => {
  it("connects quantization, block size, seed and color uniforms while retaining per-pixel source alpha", () => {
    const fixture = nodeFixture("dither");
    const node = ditherNode(fixture);
    const graph = graphNodes(node);
    expectSourceAlpha(node, fixture.input);
    for (const control of Object.values(fixture.controls)) expect(graph.has(control)).toBe(true);
    expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
    fixture.dispose();
  });
});
