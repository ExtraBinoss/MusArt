import { describe, expect, it } from "vitest";
import { vec2 } from "three/tsl";
import { bayer2, bayer4 } from "../../../src/effects/dither/bayer";
import { graphNodes } from "../node-fixture";
describe("Bayer TSL thresholds", () => {
  it("builds a stable two-level and four-level graph from the same pixel coordinate", () => {
    const point = vec2(3, 2);
    const two = bayer2(point);
    const four = bayer4(point);
    expect(two.isNode).toBe(true);
    expect(four.isNode).toBe(true);
    expect(graphNodes(two).has(point)).toBe(true);
    expect(graphNodes(four).has(point)).toBe(true);
    expect(graphNodes(four).size).toBeGreaterThan(graphNodes(two).size);
  });
});
