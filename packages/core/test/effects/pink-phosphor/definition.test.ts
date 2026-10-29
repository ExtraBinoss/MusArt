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
  PINK_PHOSPHOR_DEFINITION,
  PINK_PHOSPHOR_DEFAULT_SETTINGS,
} from "../../../src/effects/pink-phosphor/definition";

it("owns bounded explicit-phase pink emission metadata and immutable settings", () => {
  expect(PINK_PHOSPHOR_DEFINITION.nameKey).toBe("pink-phosphorFx:name");
  expect(PINK_PHOSPHOR_DEFINITION.defaults).toMatchObject({
    scale: 3,
    seed: 42,
    time: 0,
    settings: { glow: 0.3, background: "#100416", phosphor: "#ff4fa9", highlight: "#fff0fa" },
  });
  expect(Object.isFrozen(PINK_PHOSPHOR_DEFINITION)).toBe(true);
  expect(Object.isFrozen(PINK_PHOSPHOR_DEFAULT_SETTINGS)).toBe(true);
  for (const parameter of PINK_PHOSPHOR_DEFINITION.parameters) {
    expect(() =>
      validateEffectParameter(
        parameter,
        getEffectParameter(createEffect("pink-phosphor"), parameter),
      ),
    ).not.toThrow();
    if (parameter.kind !== "number") continue;
    expect(Number.isFinite(parameter.min) && Number.isFinite(parameter.max)).toBe(true);
    expect(parameter.step).toBeGreaterThan(0);
    expect(() => validateEffectParameter(parameter, parameter.max + 1)).toThrow();
  }
  expect(
    PINK_PHOSPHOR_DEFINITION.parameters.find((parameter) => parameter.key === "glowRadius"),
  ).toMatchObject({ min: 0, max: 32, unit: "px" });
});
it("commits a palette edit once and restores exact explicit time and settings through undo/redo", () => {
  const effect = createEffect("pink-phosphor", { time: 0.75 }),
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    original = engine.getSnapshot().project,
    parameter = PINK_PHOSPHOR_DEFINITION.parameters.find(
      (parameter) => parameter.key === "phosphor",
    )!;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, ...patchEffectParameter(effect, parameter, "#55ff88") }] },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).toMatchObject({
    time: 0.75,
    settings: { phosphor: "#55ff88" },
  });
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...effect, settings: { glowRadius: 100 } }] },
    }),
  ).toThrow();
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(original);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.phosphor).toBe(
    "#55ff88",
  );
});
