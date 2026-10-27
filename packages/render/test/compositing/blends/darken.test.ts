import { expect, it } from "vitest";
import { vec3 } from "three/tsl";
import * as modes from "../../../src/compositing/blends/darken";
it("builds finite-guarded darken color expressions for black, white and colored inputs", () => {
  for (const color of [vec3(0), vec3(1), vec3(0.2, 0.7, 0.4)])
    for (const blend of [
      modes.darken,
      modes.multiply,
      modes.linearBurn,
      modes.colorBurn,
      modes.darkerColor,
    ])
      expect(blend(color, vec3(0.7, 0.3, 0.1)).isNode).toBe(true);
});
