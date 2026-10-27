import { expect, it } from "vitest";
import { GRADIENT_STYLES } from "@musart/core";
import { uv } from "three/tsl";
import {
  gradientColor,
  gradientFieldNode,
  GRADIENT_FIELDS,
} from "../../../src/effects/gradient/field";
import { nodeFixture } from "../node-fixture";
it("registers every field once behind a stable runtime style uniform", () => {
  expect(Object.keys(GRADIENT_FIELDS)).toEqual(GRADIENT_STYLES);
  const fixture = nodeFixture("gradient");
  const node = gradientFieldNode(fixture),
    color = gradientColor(uv(), fixture.controls.gradient!);
  expect(node.isNode).toBe(true);
  expect(color.isNode).toBe(true);
  const key = node.getCacheKey();
  fixture.controls.gradient!.style.value = 5;
  expect(node.getCacheKey()).toBe(key);
  expect(() =>
    gradientFieldNode({ ...fixture, controls: { ...fixture.controls, gradient: null } }),
  ).toThrow("uniforms");
  fixture.dispose();
});
