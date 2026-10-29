import { expect, it } from "vitest";
import { uniform, vec3 } from "three/tsl";
import { Vector3 } from "three/webgpu";
import { noiseField, valueNoise3d } from "../../../src/effects/noise/fields";
import { graphNodes } from "../node-fixture";

it("builds a smooth 3D value field from the complete authored position rather than output density", () => {
  const point = uniform(new Vector3(0.25, 0.5, 0.75)),
    field = valueNoise3d(point),
    key = field.getCacheKey();
  expect(field.isNode).toBe(true);
  expect(graphNodes(field).has(point)).toBe(true);
  expect(field.getCacheKey()).toBe(key);
});

it("selects every algorithm and fractal bound with uniforms without replacing the shader graph", () => {
  const controls = {
      algorithm: uniform(0),
      octaves: uniform(4),
      lacunarity: uniform(2),
      persistence: uniform(0.5),
      jitter: uniform(1),
    },
    point = vec3(0.25, -1.75, 2.5),
    field = noiseField(point, controls),
    key = field.getCacheKey();
  for (let algorithm = 0; algorithm < 7; algorithm++) {
    controls.algorithm.value = algorithm;
    controls.octaves.value = algorithm % 2 ? 6 : 1;
    controls.lacunarity.value = algorithm % 2 ? 3 : 1;
    controls.persistence.value = algorithm % 2 ? 0 : 1;
    controls.jitter.value = algorithm % 2 ? 1 : 0;
    expect(field.isNode).toBe(true);
    expect(field.getCacheKey()).toBe(key);
  }
});
