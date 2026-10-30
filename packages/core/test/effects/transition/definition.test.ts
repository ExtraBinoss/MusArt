import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "../../../src/document/factories";
import { validateEffectExtensions } from "../../../src/effects/validation";
import { TRANSITION_DEFINITION } from "../../../src/effects/transition/definition";
import { TRANSITION_CATALOG } from "../../../src/effects/transition/catalog";
import { resolveMotionProperty } from "../../../src/motion/properties/registry";

it("validates every operator and makes progress an ordinary generic animation property", () => {
  expect(TRANSITION_DEFINITION.coverage).toBe("reduce");
  const effect = createEffect("transition", { id: "transition" });
  expect(effect.settings?.progress).toBe(1);
  const page = createPage({
    layers: [createLayer("rectangle", { id: "layer", effects: [effect] })],
  });
  const target = {
    kind: "effectSetting",
    layerId: "layer",
    effectId: effect.id,
    property: "progress",
  } as const;
  expect(resolveMotionProperty(page, target)).toMatchObject({
    kind: "number",
    interpolation: "continuous",
    min: 0,
    max: 1,
    value: 1,
  });
  for (const { id } of TRANSITION_CATALOG)
    expect(() =>
      validateEffectExtensions({ ...effect, settings: { ...effect.settings, style: id } }),
    ).not.toThrow();
  for (const settings of [
    { style: "missing" },
    { progress: 1.1 },
    { progress: -0.1 },
    { softness: 0 },
    { detail: 3.1 },
    { direction: "diagonal" },
  ])
    expect(() => validateEffectExtensions({ ...effect, settings })).toThrow();
});
