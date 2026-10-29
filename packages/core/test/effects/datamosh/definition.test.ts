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
  DATAMOSH_DEFAULT_SETTINGS,
  DATAMOSH_DEFINITION,
} from "../../../src/effects/datamosh/definition";

it("defines bounded spatial corruption with deterministic phase and no history/codec claims", () => {
  expect(DATAMOSH_DEFINITION.defaults).toMatchObject({
    amount: 1,
    levels: 32,
    seed: 42,
    time: 0,
    settings: DATAMOSH_DEFAULT_SETTINGS,
  });
  expect(Object.isFrozen(DATAMOSH_DEFAULT_SETTINGS)).toBe(true);
  expect(new Set(DATAMOSH_DEFINITION.parameters.map((p) => p.key)).size).toBe(13);
  expect(
    DATAMOSH_DEFINITION.parameters.some((p) =>
      ["frameHistory", "motionVectors", "iframe"].includes(p.key),
    ),
  ).toBe(false);
  for (const parameter of DATAMOSH_DEFINITION.parameters) {
    expect(() =>
      validateEffectParameter(parameter, getEffectParameter(createEffect("datamosh"), parameter)),
    ).not.toThrow();
    if (parameter.kind !== "number") continue;
    expect(() => validateEffectParameter(parameter, parameter.min)).not.toThrow();
    expect(() => validateEffectParameter(parameter, parameter.max)).not.toThrow();
    expect(() => validateEffectParameter(parameter, parameter.min - parameter.step)).toThrow();
    expect(() => validateEffectParameter(parameter, Infinity)).toThrow();
    expect(() => validateEffectParameter(parameter, parameter.max + parameter.step)).toThrow();
  }
});

it("commits block settings once, rejects foreign/invalid data atomically, and restores with undo/redo", () => {
  const effect = createEffect("datamosh"),
    layer = createLayer("rectangle", { effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot().project;
  const descriptor = DATAMOSH_DEFINITION.parameters.find((p) => p.key === "density")!;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, ...patchEffectParameter(effect, descriptor, 0) }] },
  });
  const edited = engine.getSnapshot().project;
  expect(edited.pages[0]!.layers[0]!.effects[0]!.settings!.density).toBe(0);
  for (const settings of [{ density: -1 }, { blockSize: 1 }, { rate: 31 }, { frameHistory: 5 }]) {
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: [layer.id],
        patch: { effects: [{ ...effect, settings }] },
      }),
    ).toThrow();
    expect(engine.getSnapshot().project).toEqual(edited);
  }
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(edited);
  expect(createEffect("datamosh").settings!.density).toBe(0.45);
});
