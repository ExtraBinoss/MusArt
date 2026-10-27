import { expect, it } from "vitest";
import { vec3 } from "three/tsl";
import * as modes from "../../../src/compositing/blends/contrast";
it("builds finite-guarded contrast color expressions for black, white and colored inputs", () => {
  for (const color of [vec3(0), vec3(1), vec3(0.2, 0.7, 0.4)])
    for (const blend of [
      modes.overlay,
      modes.hardLight,
      modes.softLight,
      modes.vividLight,
      modes.linearLight,
      modes.pinLight,
      modes.hardMix,
    ])
      expect(blend(color, vec3(0.7, 0.3, 0.1)).isNode).toBe(true);
});
