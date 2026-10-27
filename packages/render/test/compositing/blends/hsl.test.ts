import { expect, it } from "vitest";
import { vec3 } from "three/tsl";
import * as modes from "../../../src/compositing/blends/hsl";
it("builds finite-guarded hsl color expressions for black, white and colored inputs", () => {
  for (const color of [vec3(0), vec3(1), vec3(0.2, 0.7, 0.4)])
    for (const blend of [modes.hue, modes.saturationBlend, modes.color, modes.luminosity])
      expect(blend(color, vec3(0.7, 0.3, 0.1)).isNode).toBe(true);
});
