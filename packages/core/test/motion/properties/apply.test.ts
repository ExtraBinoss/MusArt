import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
} from "../../../src/document/factories";
import { validateProject } from "../../../src/document/validation";
import type { Layer } from "../../../src/document/model";
import { EFFECT_CATALOG } from "../../../src/effects/catalog";
import { applyMotionValue, applyMotionValues } from "../../../src/motion/properties/apply";
import type {
  MotionPropertyDescriptor,
  MotionPropertyTarget,
  MotionValue,
} from "../../../src/motion/properties/model";
import {
  listMotionProperties,
  resolveLayerMotionProperty,
} from "../../../src/motion/properties/registry";

function changedValue(descriptor: MotionPropertyDescriptor): MotionValue {
  switch (descriptor.kind) {
    case "number":
      return descriptor.value === descriptor.min ? descriptor.max : descriptor.min;
    case "integer":
      return descriptor.value === descriptor.min ? descriptor.max : descriptor.min;
    case "boolean":
      return !descriptor.value;
    case "choice":
      return descriptor.options.find((option) => option !== descriptor.value)!;
    case "color":
      return descriptor.value.toLowerCase() === "#123456" ? "#654321" : "#123456";
    case "string":
      return descriptor.value === "changed" ? "another" : "changed";
  }
}

it("batches owned drafts, preserves no-op identity and restores true default replacement", () => {
  const layer = createLayer("rectangle", {
    id: "layer",
    effects: [
      createEffect("brightness", { id: "effect" }),
      createEffect("blur", { id: "untouched" }),
    ],
  });
  const target = {
    kind: "effect",
    layerId: layer.id,
    effectId: "effect",
    property: "composite",
  } as const;
  expect(resolveLayerMotionProperty(layer, target)?.value).toBe("default");
  expect(applyMotionValue(layer, target, "default")).toBe(layer);
  const changed = applyMotionValues(layer, [
    { target: { kind: "layer", layerId: layer.id, property: "x" }, value: 10 },
    { target: { kind: "layer", layerId: layer.id, property: "y" }, value: 20 },
    {
      target: { kind: "effect", layerId: layer.id, effectId: "effect", property: "amount" },
      value: 0.4,
    },
    { target, value: "source-over" },
  ]);
  expect(changed).toMatchObject({ x: 10, y: 20 });
  expect(changed.effects[0]).toMatchObject({ amount: 0.4, composite: "source-over" });
  expect(changed.effects[1]).toBe(layer.effects[1]);
  expect(layer.effects[0]!.composite).toBeUndefined();
  const restored = applyMotionValue(changed, target, "default");
  expect(Object.hasOwn(restored.effects[0]!, "composite")).toBe(false);
  expect(() =>
    applyMotionValues(layer, [
      { target, value: "source-over" },
      { target: { kind: "layer", layerId: "missing", property: "x" }, value: 2 },
    ]),
  ).toThrow();
  expect(layer.effects[0]!.composite).toBeUndefined();
});

it("applies every exposed layer/effect setting without corrupting portable documents", () => {
  const layer = createLayer("text", {
    effects: Object.values(EFFECT_CATALOG).map((definition) => createEffect(definition.type)),
  });
  const page = createPage({ layers: [layer] });
  const before = JSON.stringify(layer);
  for (const descriptor of listMotionProperties(page)) {
    const value = changedValue(descriptor);
    const updated = applyMotionValue(layer, descriptor.target, value);
    expect(resolveLayerMotionProperty(updated, descriptor.target)?.value).toBe(value);
    expect(() =>
      validateProject(createProject({ pages: [{ ...page, layers: [updated] }] })),
    ).not.toThrow();
  }
  expect(JSON.stringify(layer)).toBe(before);
});

it("clones only affected paint/effect branches and retains no-op identities", () => {
  const effect = createEffect("gradient"),
    unrelated = createEffect("blur");
  const layer = createLayer("rectangle", {
    effects: [effect, unrelated],
    fillGradient: {
      kind: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#000" },
        { offset: 1, color: "#fff" },
      ],
    },
  });
  const target: MotionPropertyTarget = { kind: "layer", layerId: layer.id, property: "x" };
  expect(applyMotionValue(layer, target, layer.x)).toBe(layer);
  const moved = applyMotionValue(layer, target, 200);
  expect(moved).not.toBe(layer);
  expect(moved.effects).toBe(layer.effects);
  expect(moved.fillGradient).toBe(layer.fillGradient);
  const rotated = applyMotionValue(layer, { ...target, property: "fillGradient.angle" }, 90);
  expect(rotated.fillGradient?.angle).toBe(90);
  expect(rotated.fillGradient?.stops).toBe(layer.fillGradient?.stops);
  const radial = applyMotionValue(layer, { ...target, property: "fillGradient.kind" }, "radial");
  expect(radial.fillGradient?.kind).toBe("radial");
  const edited = applyMotionValue(
    layer,
    { kind: "effectSetting", layerId: layer.id, effectId: effect.id, property: "color0" },
    "#123456",
  );
  expect(edited.effects[0]?.settings?.color0).toBe("#123456");
  expect(edited.effects[1]).toBe(unrelated);
  expect(edited.effects[0]?.settings).not.toBe(effect.settings);
  const disabled = applyMotionValue(
    layer,
    { kind: "effect", layerId: layer.id, effectId: effect.id, property: "enabled" },
    false,
  );
  expect(disabled.effects[0]?.enabled).toBe(false);
  expect(effect.enabled).toBe(true);
});

it("materializes only the animated optional setting and never performs a preset macro", () => {
  const effect = createEffect("noise", { settings: undefined }),
    layer = createLayer("rectangle", { effects: [effect] });
  const target: MotionPropertyTarget = {
    kind: "effectSetting",
    layerId: layer.id,
    effectId: effect.id,
    property: "octaves",
  };
  const updated = applyMotionValue(layer, target, 5);
  expect(updated.effects[0]?.settings).toEqual({ octaves: 5 });
  expect(effect.settings).toBeUndefined();
  const gradient = createEffect("gradient");
  const gradientLayer = { ...layer, effects: [gradient] };
  expect(() =>
    applyMotionValue(
      gradientLayer,
      { ...target, effectId: gradient.id, property: "preset" },
      "citrus",
    ),
  ).toThrow();
});

it("rejects invalid values/stale targets without mutating the input", () => {
  const layer: Layer = Object.freeze(createLayer("rectangle"));
  const target: MotionPropertyTarget = { kind: "layer", layerId: layer.id, property: "opacity" };
  expect(() => applyMotionValue(layer, target, 2)).toThrow();
  expect(() => applyMotionValue(layer, { ...target, layerId: "replacement" }, 0.5)).toThrow();
  expect(() =>
    applyMotionValue(layer, { ...target, property: "__proto__" } as never, "bad"),
  ).toThrow();
  expect(() =>
    applyMotionValue(
      layer,
      { kind: "effect", layerId: layer.id, effectId: "missing", property: "amount" },
      0.5,
    ),
  ).toThrow();
  expect(layer.opacity).toBe(1);
});
