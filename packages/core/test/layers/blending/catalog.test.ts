import { it, expect } from "vitest";
import {
  BLEND_MODES,
  BLEND_CATALOG,
  getBlendDefinition,
} from "../../../src/layers/blending/catalog";
it("provides26 stable Photoshop/W3C identifiers without prototype fallthrough", () => {
  expect(BLEND_MODES).toHaveLength(26);
  expect(new Set(BLEND_MODES).size).toBe(26);
  expect(BLEND_MODES).toContain("linear-dodge");
  expect(BLEND_MODES).toContain("luminosity");
  expect(getBlendDefinition("darker-color").category).toBe("darken");
  expect(getBlendDefinition("lighter-color").category).toBe("lighten");
  for (const id of BLEND_MODES) {
    expect(getBlendDefinition(id)).toBe(BLEND_CATALOG[id]);
    expect(getBlendDefinition(id).nameKey).toBe(`blend.${id}`);
    expect(Object.isFrozen(BLEND_CATALOG[id])).toBe(true);
  }
  expect(() => getBlendDefinition("toString" as never)).toThrow();
});
