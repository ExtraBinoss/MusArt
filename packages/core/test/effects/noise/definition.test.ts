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
  NOISE_ALGORITHMS,
  NOISE_DEFAULT_SETTINGS,
  NOISE_DEFINITION,
} from "../../../src/effects/noise/definition";

it("declares distinct real 3D fields, bounded fractal work and immutable portable defaults", () => {
  expect(NOISE_ALGORITHMS).toEqual([
    "perlin",
    "value",
    "cell",
    "worley",
    "fbm",
    "ridged",
    "turbulence",
  ]);
  expect(NOISE_DEFINITION.defaults).toMatchObject({
    enabled: true,
    scale: 128,
    seed: 42,
    color: false,
    time: 0,
    settings: NOISE_DEFAULT_SETTINGS,
  });
  expect(Object.isFrozen(NOISE_DEFINITION)).toBe(true);
  expect(Object.isFrozen(NOISE_DEFAULT_SETTINGS)).toBe(true);
  expect(new Set(NOISE_DEFINITION.parameters.map((parameter) => parameter.key)).size).toBe(
    NOISE_DEFINITION.parameters.length,
  );
  for (const parameter of NOISE_DEFINITION.parameters) {
    const value = getEffectParameter(createEffect("noise"), parameter);
    expect(() => validateEffectParameter(parameter, value)).not.toThrow();
    if (parameter.kind !== "number") continue;
    expect(Number.isFinite(parameter.min) && Number.isFinite(parameter.max)).toBe(true);
    expect(parameter.max).toBeGreaterThan(parameter.min);
    expect(parameter.step).toBeGreaterThan(0);
    expect(() => validateEffectParameter(parameter, parameter.max + 1)).toThrow();
  }
  expect(
    NOISE_DEFINITION.parameters.find((parameter) => parameter.key === "octaves"),
  ).toMatchObject({ min: 1, max: 6, integer: true });
  expect(
    NOISE_DEFINITION.parameters.find((parameter) => parameter.key === "lacunarity"),
  ).toMatchObject({ min: 1, max: 3 });
  expect(NOISE_DEFINITION.parameters.find((parameter) => parameter.key === "jitter")).toMatchObject(
    { visibleWhen: { key: "algorithm", values: ["worley"] } },
  );
});

it("edits noise settings through one validated command and restores exact seed/time/settings with undo", () => {
  const effect = createEffect("noise"),
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot().project;
  const parameter = NOISE_DEFINITION.parameters.find((parameter) => parameter.key === "algorithm")!;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, ...patchEffectParameter(effect, parameter, "ridged") }] },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).toMatchObject({
    seed: 42,
    time: 0,
    settings: { algorithm: "ridged" },
  });
  expect(engine.getSnapshot().canUndo).toBe(true);
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...effect, settings: { algorithm: "invented" } }] },
    }),
  ).toThrow();
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.algorithm).toBe(
    "ridged",
  );
});
