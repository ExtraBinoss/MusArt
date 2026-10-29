import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { crtNode } from "../../../src/effects/crt/node";
import { graphNodes, nodeFixture } from "../node-fixture";

it("keeps image sampling, time, all masks and every continuous control on one stable graph", () => {
  const fixture = nodeFixture("crt"),
    effect = createEffect("crt"),
    node = crtNode(fixture),
    key = node.getCacheKey(),
    parameters = { ...fixture.controls.parameters },
    colors = { ...fixture.controls.colors };
  for (const mask of ["shadow", "slot", "aperture"]) {
    updateEffectUniforms(
      fixture.controls,
      {
        ...effect,
        amount: 0.4,
        scale: 1,
        seed: 987,
        time: 123,
        settings: {
          ...effect.settings,
          mask,
          curvatureX: 0.5,
          glow: 2,
          cutout: true,
          tintColor: "#55ff88",
        },
      },
      320,
      240,
    );
    expect(node.getCacheKey()).toBe(key);
    for (const [name, value] of Object.entries(parameters))
      expect(fixture.controls.parameters[name]).toBe(value);
    for (const [name, value] of Object.entries(colors))
      expect(fixture.controls.colors[name]).toBe(value);
  }
  expect(fixture.controls.parameters.cutout!.value).toBe(1);
  expect(fixture.controls.parameters.curvatureX!.value).toBe(0.5);
  expect(fixture.controls.parameters.mask!.value).toBe(0);
  expect(fixture.controls.time.value).toBe(123);
  expect(graphNodes(node).has(fixture.source)).toBe(true);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
