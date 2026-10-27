import { expect, it } from "vitest";
import { gradientFinishNode } from "../../../src/effects/gradient/finish";
import { nodeFixture } from "../node-fixture";
it("finishes GPU texture colors while clipping to original source coverage", () => {
  const f = nodeFixture("gradient");
  expect(gradientFinishNode(f).isNode).toBe(true);
  expect(gradientFinishNode({ ...f, backdrop: f.source }).isNode).toBe(true);
  expect(f.getGlyphAtlas).not.toHaveBeenCalled();
  f.dispose();
});
