import { expect, it } from "vitest";
import { uniform, vec2 } from "three/tsl";
import { crtPhosphors } from "../../../src/effects/crt/phosphors";

it("builds every phosphor pattern through stable authored-coordinate uniforms", () => {
  const pitch = uniform(1.5),
    gap = uniform(0.12),
    pattern = uniform(0),
    result = crtPhosphors(vec2(123, 83), pitch, gap, pattern),
    key = result.getCacheKey();
  for (const choice of [0, 1, 2]) {
    pattern.value = choice;
    pitch.value = choice ? 12 : 1;
    gap.value = choice ? 0.8 : 0;
    expect(result.getCacheKey()).toBe(key);
    expect(result.isNode).toBe(true);
  }
});
