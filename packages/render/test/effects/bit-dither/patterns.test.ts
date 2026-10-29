import { expect, it } from "vitest";
import { uniform } from "three/tsl";
import { Vector2 } from "three/webgpu";
import { bayerThreshold } from "../../../src/effects/bit-dither/patterns";
import { graphNodes } from "../node-fixture";

it("builds each finite Bayer matrix from authored cell coordinates on a stable graph", () => {
  const point = uniform(new Vector2(1, 2));
  const fields = ([2, 4, 8] as const).map((order) => bayerThreshold(point, order));
  for (const field of fields) {
    const key = field.getCacheKey();
    expect(graphNodes(field).has(point)).toBe(true);
    point.value.set(-3, 11);
    expect(field.getCacheKey()).toBe(key);
  }
  expect(new Set(fields.map((field) => field.getCacheKey())).size).toBe(3);
});
