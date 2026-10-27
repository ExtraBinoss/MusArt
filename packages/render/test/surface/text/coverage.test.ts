import { expect, it } from "vitest";
import { DataTexture } from "three/webgpu";
import { glyphCoverage, glyphPosition } from "../../../src/surface/text/coverage";
it("builds Three TSL coverage and instanced position nodes without rasterization or shader strings", () => {
  const atlas = new DataTexture(new Float32Array(16), 2, 2);
  expect(glyphCoverage(atlas, 2).isNode).toBe(true);
  expect(glyphPosition().isNode).toBe(true);
  atlas.dispose();
});
