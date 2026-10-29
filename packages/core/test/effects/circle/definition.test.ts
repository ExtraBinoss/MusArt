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
import { CIRCLE_DEFAULT_SETTINGS, CIRCLE_DEFINITION } from "../../../src/effects/circle/definition";

it("declares an immutable static circular screen with real ink/paper coverage controls", () => {
  expect(CIRCLE_DEFINITION.type).toBe("circle");
  expect(CIRCLE_DEFINITION.defaults).toMatchObject({
    amount: 1,
    settings: CIRCLE_DEFAULT_SETTINGS,
  });
  expect(Object.isFrozen(CIRCLE_DEFINITION)).toBe(true);
  expect(Object.isFrozen(CIRCLE_DEFAULT_SETTINGS)).toBe(true);
  expect(new Set(CIRCLE_DEFINITION.parameters.map((p) => p.key)).size).toBe(11);
  expect(CIRCLE_DEFINITION.parameters.some((p) => ["seed", "time"].includes(p.key))).toBe(false);
  for (const parameter of CIRCLE_DEFINITION.parameters) {
    const value = getEffectParameter(createEffect("circle"), parameter);
    expect(() => validateEffectParameter(parameter, value)).not.toThrow();
    if (parameter.kind === "number") {
      expect(() => validateEffectParameter(parameter, parameter.min)).not.toThrow();
      expect(() => validateEffectParameter(parameter, parameter.max)).not.toThrow();
      expect(() => validateEffectParameter(parameter, parameter.min - parameter.step)).toThrow();
      expect(() => validateEffectParameter(parameter, parameter.max + parameter.step)).toThrow();
      expect(() => validateEffectParameter(parameter, NaN)).toThrow();
    }
    if (parameter.kind === "select")
      expect(() => validateEffectParameter(parameter, "invented")).toThrow();
    if (parameter.kind === "color")
      expect(() => validateEffectParameter(parameter, "url(ink)")).toThrow();
  }
  const a = createEffect("circle"),
    b = createEffect("circle");
  a.settings!.backgroundOpacity = 0;
  expect(b.settings!.backgroundOpacity).toBe(1);
});

it("validates opacity/color edits atomically and restores the exact screen settings with undo/redo", () => {
  const effect = createEffect("circle"),
    layer = createLayer("rectangle", { effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const before = engine.getSnapshot().project;
  const descriptor = CIRCLE_DEFINITION.parameters.find((p) => p.key === "backgroundOpacity")!;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, ...patchEffectParameter(effect, descriptor, 0) }] },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings).toMatchObject({
    backgroundOpacity: 0,
    foreground: "#151515",
  });
  const edited = engine.getSnapshot().project;
  for (const settings of [
    { backgroundOpacity: 2 },
    { foreground: "not-a-color" },
    { polarity: "sideways" },
    { spacing: 0 },
    { borrowedRadius: 5 },
  ]) {
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
});
