import { expect, it } from "vitest";
import { RIPPLE_DEFAULT_SETTINGS, RIPPLE_DEFINITION } from "../../../src/effects/ripple/definition";

it("declares a finite radial wave with an immutable protected center and explicit time", () => {
  expect(RIPPLE_DEFINITION.type).toBe("ripple");
  expect(RIPPLE_DEFINITION.defaults).toMatchObject({
    enabled: true,
    amount: 1,
    time: 0,
    settings: RIPPLE_DEFAULT_SETTINGS,
  });
  expect(RIPPLE_DEFAULT_SETTINGS.innerRadius).toBeLessThan(RIPPLE_DEFAULT_SETTINGS.radius);
  expect(Object.isFrozen(RIPPLE_DEFINITION)).toBe(true);
  expect(Object.isFrozen(RIPPLE_DEFINITION.defaults.settings)).toBe(true);
  expect(Object.isFrozen(RIPPLE_DEFAULT_SETTINGS)).toBe(true);
  expect(RIPPLE_DEFINITION.gizmo).toEqual({
    kind: "radial",
    centerX: "centerX",
    centerY: "centerY",
    radius: "radius",
    innerRadius: "innerRadius",
    radiusUnits: "document",
  });
  expect(new Set(RIPPLE_DEFINITION.parameters.map(({ key }) => key)).size).toBe(
    RIPPLE_DEFINITION.parameters.length,
  );
  for (const parameter of RIPPLE_DEFINITION.parameters) {
    if (parameter.kind !== "number") continue;
    expect(Number.isFinite(parameter.min)).toBe(true);
    expect(parameter.max).toBeGreaterThan(parameter.min);
    expect(parameter.step).toBeGreaterThan(0);
    if (parameter.scope === "settings") {
      expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
      expect(parameter.default).toBeLessThanOrEqual(parameter.max);
    }
  }
});

it("keeps the portable direction order explicit and omits unused randomness controls", () => {
  const direction = RIPPLE_DEFINITION.parameters.find((parameter) => parameter.key === "direction");
  expect(direction).toMatchObject({ kind: "select", default: "outward" });
  if (direction?.kind !== "select") throw new Error("Direction selector missing");
  expect(direction.options.map(({ value }) => value)).toEqual(["outward", "inward"]);
  expect(RIPPLE_DEFINITION.parameters.some((parameter) => parameter.key === "seed")).toBe(false);
  for (const key of ["centerX", "centerY"]) {
    expect(RIPPLE_DEFINITION.parameters.find((parameter) => parameter.key === key)).toMatchObject({
      min: 0,
      max: 1,
      displayScale: 100,
      unit: "%",
    });
  }
});
