import { describe, expect, it } from "vitest";
import { ditherNode } from "../../../src/effects/dither/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
describe("dither node", () => {
  it("connects quantization, block size, seed and color uniforms while retaining per-pixel source alpha", () => {
    const fixture = nodeFixture("dither");
    const node = ditherNode(fixture);
    const graph = graphNodes(node);
    expectSourceAlpha(node, fixture.input);
    for (const control of Object.entries(fixture.controls)
      .filter(([name]) =>
        ["amount", "scale", "levels", "color", "sourceFlipY", "seed", "logicalResolution"].includes(
          name,
        ),
      )
      .map(([, node]) => node))
      expect(graph.has(control as never)).toBe(true);
    expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
    fixture.dispose();
  });
});
