import { expect, it } from "vitest";
import { vec2, uniform } from "three/tsl";
import { noise2d } from "../../../src/effects/shared/noise";
it("hashes integer pixel coordinates with a stable full seed uniform", () => {
  const seed = uniform(42),
    node = noise2d(vec2(3, 7), seed);
  const key = node.getCacheKey();
  seed.value = 1337;
  expect(node.getCacheKey()).toBe(key);
  expect(node.isNode).toBe(true);
});
