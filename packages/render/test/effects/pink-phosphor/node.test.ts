import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { pinkPhosphorNode } from "../../../src/effects/pink-phosphor/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, nodeFixture } from "../node-fixture";

it("retains original coverage, authored pitch and stable explicit-time/palette uniforms", () => {
  const fixture = nodeFixture("pink-phosphor"),
    node = pinkPhosphorNode(fixture),
    key = node.getCacheKey(),
    time = fixture.controls.time,
    radius = fixture.controls.parameters.glowRadius,
    color = fixture.controls.colors.phosphor;
  expectSourceAlpha(node, fixture.input);
  updateEffectUniforms(
    fixture.controls,
    createEffect("pink-phosphor", {
      time: 4,
      scale: 8,
      seed: 191,
      settings: {
        glowRadius: 24,
        exposure: 2,
        gamma: 0.5,
        contrast: 2,
        grain: 0,
        flicker: 0,
        speed: 0,
        phosphor: "#55ff88",
      },
    }),
    240,
    160,
    { width: 960, height: 640 },
  );
  expect(node.getCacheKey()).toBe(key);
  expect(fixture.controls.time).toBe(time);
  expect(time.value).toBe(4);
  expect(fixture.controls.parameters.glowRadius).toBe(radius);
  expect(radius!.value).toBe(24);
  expect(fixture.controls.colors.phosphor).toBe(color);
  expect(fixture.controls.logicalResolution.value.toArray()).toEqual([960, 640]);
  expect(fixture.controls.parameters.speed!.value).toBe(0);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
