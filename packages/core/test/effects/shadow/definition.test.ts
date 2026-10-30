import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  serializeProject,
  parseProject,
  validateProject,
} from "../../../src/index";
import { SHADOW_DEFINITION } from "../../../src/effects/shadow/definition";
import { patchEffectParameter } from "../../../src/effects/parameters";
it("keeps signed offsets, soft radius and color portable, validated and undoable", () => {
  const effect = createEffect("shadow");
  expect(Object.isFrozen(SHADOW_DEFINITION.defaults.settings)).toBe(true);
  const parameter = SHADOW_DEFINITION.parameters.find((p) => p.key === "offsetX")!;
  const patched = patchEffectParameter(effect, parameter, -12.5);
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({ layers: [createLayer("rectangle", { id: "card", effects: [effect] })] }),
      ],
    }),
  );
  const before = engine.getSnapshot().project;
  engine.execute({
    type: "updateLayers",
    ids: ["card"],
    patch: { effects: [{ ...effect, ...patched }] },
  });
  const after = engine.getSnapshot().project;
  expect(after.pages[0]!.layers[0]!.effects[0]!.settings!.offsetX).toBe(-12.5);
  expect(parseProject(serializeProject(after))).toEqual(after);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after);
  expect(() => patchEffectParameter(effect, parameter, 257)).toThrow();
  const radius = SHADOW_DEFINITION.parameters.find((p) => p.key === "radius")!;
  expect(() => patchEffectParameter(effect, radius, -1)).toThrow();
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: ["card"],
      patch: { effects: [createEffect("shadow", { settings: { unknown: 1 } })] },
    }),
  ).toThrow();
  expect(engine.getSnapshot().project).toEqual(after);
  const invalid = structuredClone(after);
  invalid.pages[0]!.layers[0]!.effects[0]!.settings!.shadowColor = "invalid-color";
  expect(() => validateProject(invalid)).toThrow();
});
