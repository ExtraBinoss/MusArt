import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "../../../src/document/factories";
import { EFFECT_CATALOG } from "../../../src/effects/catalog";
import type { MotionPropertyTarget } from "../../../src/motion/properties/model";
import {
  effectMotionCapabilityInventory,
  LAYER_MOTION_LIMITATIONS,
  listMotionProperties,
  readMotionValue,
  resolveLayerMotionProperty,
  resolveMotionProperty,
  validateMotionValue,
} from "../../../src/motion/properties/registry";

it("enumerates every catalog control without hiding conditional/dormant parameters", () => {
  const page = createPage({
    layers: Object.values(EFFECT_CATALOG).map((definition) =>
      createLayer(definition.source ? "text" : "rectangle", {
        effects: [createEffect(definition.type)],
      }),
    ),
  });
  const descriptors = listMotionProperties(page);
  const addresses = descriptors.map((descriptor) => JSON.stringify(descriptor.target));
  expect(new Set(addresses).size).toBe(addresses.length);
  for (const layer of page.layers) {
    const effect = layer.effects[0]!;
    const macros = effectMotionCapabilityInventory(effect.type).filter(
      (capability) => capability.status === "macro",
    );
    for (const parameter of EFFECT_CATALOG[effect.type].parameters) {
      if (
        macros.some((macro) => macro.property === parameter.key && parameter.scope === "settings")
      )
        continue;
      const target: MotionPropertyTarget = {
        kind: parameter.scope === "settings" ? "effectSetting" : "effect",
        layerId: layer.id,
        effectId: effect.id,
        property: parameter.key as never,
      };
      const descriptor = resolveMotionProperty(page, target)!;
      expect(descriptor, `${effect.type}.${parameter.key}`).not.toBeNull();
      expect(addresses).toContain(JSON.stringify(target));
      expect(() => validateMotionValue(descriptor, descriptor.value)).not.toThrow();
    }
  }
});

it("reads exact values and rejects missing, stale, foreign and malformed target addresses", () => {
  const effect = createEffect("gradient"),
    layer = createLayer("rectangle", { x: 12, effects: [effect] });
  const page = createPage({ layers: [layer] });
  const target: MotionPropertyTarget = { kind: "layer", layerId: layer.id, property: "x" };
  expect(readMotionValue(page, target)).toBe(12);
  expect(resolveLayerMotionProperty({ ...layer, id: "replacement" }, target)).toBeNull();
  for (const invalid of [
    { ...target, layerId: "missing" },
    { ...target, property: "__proto__" },
    { ...target, kind: "arbitrary" },
    { kind: "effect", layerId: layer.id, effectId: "missing", property: "amount" },
    { kind: "effect", layerId: layer.id, effectId: effect.id, property: "settings.time" },
    { kind: "effectSetting", layerId: layer.id, effectId: effect.id, property: "constructor" },
  ]) {
    expect(resolveMotionProperty(page, invalid as MotionPropertyTarget)).toBeNull();
    expect(() => readMotionValue(page, invalid as MotionPropertyTarget)).toThrow();
  }
  expect(resolveMotionProperty(createPage(), target)).toBeNull();
  expect(
    resolveMotionProperty({ ...page, layers: [{ ...layer, x: Infinity }] }, target),
  ).toBeNull();
});

it("does not expose document or caller-owned target objects as descriptor metadata", () => {
  const layer = createLayer("text"),
    page = createPage({ layers: [layer] });
  const target = { kind: "layer", layerId: layer.id, property: "fill" } as const;
  const descriptor = resolveMotionProperty(page, target)!;
  expect(descriptor.target).toEqual(target);
  expect(descriptor.target).not.toBe(target);
  expect(descriptor.kind).toBe("color");
  expect(listMotionProperties(createPage())).toEqual([]);
  expect(LAYER_MOTION_LIMITATIONS["fillGradient.stops"]).toMatch(/durable IDs/);
});
