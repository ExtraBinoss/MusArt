import { expect, it } from "vitest";
import { createEffect, createLayer, createPage, transformPoint } from "@musart/core";
import { moveRadialHandle, radialGeometry } from "../../../src/canvas/effects/radial-geometry";

it("edits normalized centers through rotated nested owner transforms and preserves siblings", () => {
  const effect = createEffect("ripple"),
    group = createLayer("group", { x: 50, y: 20, width: 400, height: 300, rotation: 25 }),
    layer = createLayer("image", {
      parentId: group.id,
      width: 200,
      height: 100,
      rotation: 35,
      effects: [effect],
    }),
    page = createPage({ layers: [group, layer] }),
    geometry = radialGeometry(page, layer, effect)!;
  const next = moveRadialHandle(
    page,
    layer,
    effect,
    "center",
    transformPoint(geometry.matrix, { x: 50, y: 80 }),
  );
  expect(next.settings!.centerX).toBeCloseTo(0.25);
  expect(next.settings!.centerY).toBeCloseTo(0.8);
  expect(next.settings!.amplitude).toBe(effect.settings!.amplitude);
  expect(effect.settings!.centerX).toBe(0.5);
});
it("clamps protected and exterior radii in document units, with no viewport input", () => {
  const effect = createEffect("ripple", {
    settings: { centerX: 0, centerY: 0, radius: 100, innerRadius: 20 },
  });
  const layer = createLayer("image", { x: 0, y: 0, width: 200, height: 100, effects: [effect] }),
    page = createPage({ layers: [layer] });
  expect(moveRadialHandle(page, layer, effect, "radius", { x: 5, y: 0 }).settings!.radius).toBe(20);
  expect(
    moveRadialHandle(page, layer, effect, "innerRadius", { x: 150, y: 0 }).settings!.innerRadius,
  ).toBe(100);
  expect(
    moveRadialHandle(page, layer, effect, "center", { x: -500, y: 500 }).settings,
  ).toMatchObject({ centerX: 0, centerY: 1 });
});
it("maps rotated elliptical relative radii without effect-specific switches", () => {
  const effect = createEffect("flashlight", {
    settings: { centerX: 0, centerY: 0, aspect: 2, rotation: 90 },
  });
  const layer = createLayer("image", { x: 0, y: 0, width: 200, height: 100, effects: [effect] }),
    page = createPage({ layers: [layer] });
  expect(radialGeometry(page, layer, effect)).toMatchObject({
    radius: 68,
    innerRadius: null,
    rotation: 90,
  });
  expect(
    moveRadialHandle(page, layer, effect, "radius", { x: 0, y: 100 }).settings!.radius,
  ).toBeCloseTo(0.5);
  const plain = createEffect("brightness");
  expect(radialGeometry(page, layer, plain)).toBeNull();
  expect(moveRadialHandle(page, layer, plain, "radius", { x: 1, y: 1 })).toBe(plain);
});
