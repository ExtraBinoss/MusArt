import { expect, test } from "vitest";
import {
  arcRender,
  particles,
  RINGS,
  SWOOSH,
  COMET_RIBBONS,
} from "../../../../src/ui/brand/engine/decor";
test("keeps decor finite, ordered in front/back paths and deterministic at an explicit clock", () => {
  for (const seed of [...RINGS, ...SWOOSH, ...COMET_RIBBONS]) {
    const arc = arcRender(seed, 0.75, 100, "test", 0.4);
    expect(arc.opacity).toBe(0.4);
    expect(arc.id).toBe("test");
    expect(arc.front + arc.back).not.toMatch(/NaN|Infinity/);
    expect(arc.grad.stops.length).toBeGreaterThan(1);
    expect(arc.width).toBeGreaterThan(0);
  }
  expect(particles(-1, 100)).toEqual([]);
  expect(particles(10, 100)).toEqual([]);
  expect(particles(0.3, 100)).toEqual(particles(0.3, 100));
  expect(particles(0.3, 100).length).toBeGreaterThan(0);
});
