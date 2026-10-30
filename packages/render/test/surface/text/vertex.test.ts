import { expect, it } from "vitest";
import { glyphPosition, glyphVertex } from "../../../src/surface/text/vertex";
it("constructs dynamic vertex positions and distinct matching layer/font-space varyings in TSL", () => {
  const vertex = glyphVertex();
  expect(glyphPosition().isNode).toBe(true);
  expect(vertex.position.isNode).toBe(true);
  expect(vertex.coordinate.isVaryingNode).toBe(true);
  expect(vertex.pixel.isVaryingNode).toBe(true);
  expect(vertex.coordinate).not.toBe(vertex.pixel);
});
