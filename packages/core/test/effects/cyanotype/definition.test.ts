import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectParameter,
  patchEffectParameter,
} from "../../../src/index";
import { CYANOTYPE_DEFINITION } from "../../../src/effects/cyanotype/definition";
it("validates every owned print control and restores its values as one undoable edit", () => {
  const effect = createEffect("cyanotype");
  expect(Object.isFrozen(CYANOTYPE_DEFINITION.defaults.settings)).toBe(true);
  for (const parameter of CYANOTYPE_DEFINITION.parameters) {
    const value = getEffectParameter(effect, parameter);
    expect(() => patchEffectParameter(effect, parameter, value)).not.toThrow();
    if (parameter.kind === "number")
      expect(() => patchEffectParameter(effect, parameter, parameter.max + 1)).toThrow();
  }
  const layer = createLayer("rectangle", { effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot().project;
  const exposure = CYANOTYPE_DEFINITION.parameters.find((p) => p.key === "exposure")!;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, ...patchEffectParameter(effect, exposure, 1.5) }] },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.exposure).toBe(
    1.5,
  );
  const edited = engine.getSnapshot().project;
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...effect, settings: { unknown: 1 } }] },
    }),
  ).toThrow();
  expect(engine.getSnapshot().project).toBe(edited);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(edited);
});
