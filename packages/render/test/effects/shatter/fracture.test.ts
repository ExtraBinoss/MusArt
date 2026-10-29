import { expect, it } from "vitest";
import { uniform, vec2 } from "three/tsl";
import {
  cellularFracture,
  impactFracture,
  shatterHash,
} from "../../../src/effects/shatter/fracture";

it("builds both bounded fracture fields from authored positions and deterministic uniforms", () => {
  const seed = uniform(42, "uint"),
    jitter = uniform(0.6),
    size = uniform(72),
    spokes = uniform(18),
    position = vec2(180, 144),
    center = vec2(160, 120),
    cellular = cellularFracture(position, size, jitter, seed),
    impact = impactFracture(position, center, size, jitter, spokes, seed),
    hash = shatterHash(vec2(-3, 6), seed),
    keys = [cellular.getCacheKey(), impact.getCacheKey(), hash.getCacheKey()];
  seed.value = 2147483647;
  jitter.value = 1;
  size.value = 8;
  spokes.value = 48;
  expect([cellular.getCacheKey(), impact.getCacheKey(), hash.getCacheKey()]).toEqual(keys);
  expect(cellular.isNode && impact.isNode && hash.isNode).toBe(true);
  size.value = 512;
  jitter.value = 0;
  spokes.value = 6;
  expect(impact.getCacheKey()).toBe(keys[1]);
});
