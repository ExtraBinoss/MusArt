import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectParameter,
  patchEffectParameter,
  validateEffectParameter,
} from "@musart/core";
import {
  BIT_DITHER_DEFINITION,
  BIT_DITHER_DEFAULT_SETTINGS,
  BIT_DITHER_METHODS,
} from "../../../src/effects/bit-dither/definition";

it("declares bounded two-color methods without changing the multilevel dither defaults", () => {
  expect(BIT_DITHER_METHODS).toEqual(["threshold", "bayer2", "bayer4", "bayer8", "interleaved"]);
  expect(BIT_DITHER_DEFINITION.nameKey).toBe("bit-ditherFx:name");
  expect(BIT_DITHER_DEFINITION.defaults).toMatchObject({
    amount: 1,
    scale: 1,
    seed: 42,
    settings: { method: "bayer4", threshold: 0.5, foreground: "#000000", background: "#ffffff" },
  });
  expect(Object.isFrozen(BIT_DITHER_DEFAULT_SETTINGS)).toBe(true);
  expect(createEffect("dither").settings).toBeUndefined();
  for (const parameter of BIT_DITHER_DEFINITION.parameters) {
    expect(() =>
      validateEffectParameter(parameter, getEffectParameter(createEffect("bit-dither"), parameter)),
    ).not.toThrow();
    if (parameter.kind !== "number") continue;
    expect(Number.isFinite(parameter.min) && Number.isFinite(parameter.max)).toBe(true);
    expect(() => validateEffectParameter(parameter, parameter.max + 1)).toThrow();
  }
  expect(
    BIT_DITHER_DEFINITION.parameters.find((parameter) => parameter.key === "strength"),
  ).toMatchObject({
    visibleWhen: { key: "method", values: ["bayer2", "bayer4", "bayer8", "interleaved"] },
  });
});

it("commits a palette/method edit once, rejects unknown modes and restores portable data with undo", () => {
  const effect = createEffect("bit-dither"),
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot().project,
    method = BIT_DITHER_DEFINITION.parameters.find((parameter) => parameter.key === "method")!;
  const changed = { ...effect, ...patchEffectParameter(effect, method, "interleaved") };
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: {
      effects: [{ ...changed, settings: { ...changed.settings, foreground: "#260b41" } }],
    },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).toMatchObject({
    settings: { method: "interleaved", foreground: "#260b41" },
  });
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...effect, settings: { method: "floyd-steinberg" } }] },
    }),
  ).toThrow();
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.method).toBe(
    "interleaved",
  );
});
