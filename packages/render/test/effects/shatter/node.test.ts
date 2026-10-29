import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { shatterNode } from "../../../src/effects/shatter/node";
import { graphNodes, nodeFixture } from "../node-fixture";

it("keeps source sampling and all continuous controls on one stable GPU graph without an atlas", () => {
  const fixture = nodeFixture("shatter"),
    effect = createEffect("shatter"),
    node = shatterNode(fixture),
    key = node.getCacheKey();
  const parameters = { ...fixture.controls.parameters },
    colors = { ...fixture.controls.colors };
  updateEffectUniforms(
    fixture.controls,
    {
      ...effect,
      amount: 0.4,
      scale: 96,
      seed: 987,
      settings: {
        ...effect.settings,
        pattern: "cellular",
        ior: 1.8,
        cutout: true,
        tintColor: "#ffccaa",
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
  expect(fixture.controls.parameters.ior!.value).toBe(1.8);
  expect(fixture.controls.parameters.pattern!.value).toBe(1);
  expect(fixture.controls.parameters.cutout!.value).toBe(1);
  expect(graphNodes(node).has(fixture.source)).toBe(true);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
