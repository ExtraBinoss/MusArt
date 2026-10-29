import { expect, it } from "vitest";
import { vec2, uniform } from "three/tsl";
import { noise2d } from "../../../src/effects/shared/noise";
import { graphNodes } from "../node-fixture";
it("hashes integer pixel coordinates with a stable full seed uniform", () => {
  const seed = uniform(42),
    node = noise2d(vec2(3, 7), seed);
  const key = node.getCacheKey();
  seed.value = 1337;
  expect(node.getCacheKey()).toBe(key);
  expect(node.isNode).toBe(true);
});
it("accepts an unsigned uniform directly so high seed bits reach the integer hash", () => {
  const seed = uniform(2 ** 30, "uint"),
    node = noise2d(vec2(3, 7), seed),
    key = node.getCacheKey();
  expect(graphNodes(node).has(seed)).toBe(true);
  seed.value = 2 ** 30 + 1;
  expect(node.getCacheKey()).toBe(key);
  expect(seed.value).toBe(1073741825);
});
