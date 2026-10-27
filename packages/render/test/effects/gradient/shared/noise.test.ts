import { expect, it } from "vitest";
import { vec2 } from "three/tsl";
import {
  gradientHash,
  stripesHash,
  stripesNoise,
} from "../../../../src/effects/gradient/shared/noise";
it("builds integer-hash and eased noise graphs with distinct deterministic seed identities", () => {
  const p = vec2(3, -4),
    a = gradientHash(p),
    b = stripesHash(p),
    noise = stripesNoise(p);
  for (const node of [a, b, noise]) expect(node.isNode).toBe(true);
  expect(a.getCacheKey()).not.toBe(b.getCacheKey());
});
