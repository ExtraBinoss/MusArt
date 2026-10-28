import { expect, it } from "vitest";
import { gradientFinishNode } from "../../../src/effects/gradient/finish";
import { graphNodes, nodeFixture } from "../node-fixture";
it("finishes GPU texture colors while clipping to original source coverage", () => {
  const f = nodeFixture("gradient");
  const node = gradientFinishNode(f);
  expect(node.isNode).toBe(true);
  expect(graphNodes(node).has(f.controls.logicalResolution)).toBe(true);
  expect(graphNodes(node).has(f.controls.pixelFootprint)).toBe(true);
  expect(gradientFinishNode({ ...f, backdrop: f.source }).isNode).toBe(true);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
