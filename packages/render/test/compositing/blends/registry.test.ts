import { expect, it } from "vitest";
import { BLEND_MODES } from "@musart/core";
import { uniform, vec3 } from "three/tsl";
import {
  BLEND_FUNCTIONS,
  GPU_BLEND_MODES,
  blendModeId,
  blendRGB,
} from "../../../src/compositing/blends/registry";
it("covers the canonical catalogue and uses a runtime uniform without rebuilding shaders", () => {
  expect(GPU_BLEND_MODES).toEqual(BLEND_MODES);
  expect(Object.isFrozen(BLEND_FUNCTIONS)).toBe(true);
  const mode = uniform(0);
  const node = blendRGB(vec3(0.2), vec3(0.8), mode);
  const key = node.getCacheKey();
  for (const name of GPU_BLEND_MODES) {
    mode.value = blendModeId(name);
    expect(node.getCacheKey()).toBe(key);
  }
  expect(() => blendModeId("unsupported")).toThrow("inconnu");
});
