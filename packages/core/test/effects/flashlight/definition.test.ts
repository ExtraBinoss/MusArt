import { expect, it } from "vitest";
import { createEffect, validateProject, createProject, createLayer } from "../../../src/index";
import { FLASHLIGHT_DEFINITION } from "../../../src/effects/flashlight/definition";
import { getEffectParameter, patchEffectParameter } from "../../../src/effects/parameters";

it("declares adjustable document-space elliptical illumination with valid defaults", () => {
  const effect = createEffect("flashlight");
  expect(Object.isFrozen(FLASHLIGHT_DEFINITION.defaults.settings)).toBe(true);
  expect(FLASHLIGHT_DEFINITION.gizmo).toMatchObject({
    centerX: "centerX",
    centerY: "centerY",
    radius: "radius",
    radiusUnits: "relative-min",
    aspect: "aspect",
    rotation: "rotation",
  });
  for (const parameter of FLASHLIGHT_DEFINITION.parameters) {
    const value = getEffectParameter(effect, parameter);
    expect(patchEffectParameter(effect, parameter, value)).toBeDefined();
  }
  const project = createProject();
  project.pages[0]!.layers = [createLayer("rectangle", { effects: [effect] })];
  expect(() => validateProject(project)).not.toThrow();
  const radius = FLASHLIGHT_DEFINITION.parameters.find((p) => p.key === "radius")!;
  expect(() => patchEffectParameter(effect, radius, 0)).toThrow();
});
