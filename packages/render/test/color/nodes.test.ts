import { expect, it } from "vitest";
import { vec3 } from "three/tsl";
import { colorControls, colorNode, cmykProof } from "../../src/color/nodes";
it("keeps color-space conversion and generic ink proof as alpha-preserving stable GPU graphs", () => {
  const c = colorControls(),
    node = colorNode(c);
  const key = node.getCacheKey();
  for (const mode of [0, 1, 2, 3]) {
    c.mode.value = mode;
    c.premultiplied.value = 1;
    expect(node.getCacheKey()).toBe(key);
  }
  expect(cmykProof(vec3(0.2, 0.6, 0.9)).isNode).toBe(true);
});
