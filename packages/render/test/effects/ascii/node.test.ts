import { describe, expect, it } from "vitest";
import { asciiNode } from "../../../src/effects/ascii/node";
import { expectSourceAlpha, graphNodes, nodeFixture } from "../node-fixture";
describe("ASCII node", () => {
  it("uses a shared atlas and dynamic color, retaining exact source alpha outside glyph ink", () => {
    const fixture = nodeFixture("ascii");
    const node = asciiNode(fixture);
    const graph = graphNodes(node);
    expectSourceAlpha(node, fixture.input);
    expect(fixture.getGlyphAtlas).toHaveBeenCalledTimes(1);
    for (const key of ["amount", "scale", "resolution", "color"] as const)
      expect(graph.has(fixture.controls[key])).toBe(true);
    expect(graph.has(fixture.controls.levels)).toBe(false);
    fixture.dispose();
  });
});
