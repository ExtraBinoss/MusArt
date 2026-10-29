import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  planMotionInitialization,
  getEffectDefinition,
  getEffectParameter,
  patchEffectParameter,
  EFFECT_CATALOG,
  GRADIENT_PRESETS,
  type EffectType,
  type MotionPropertyTarget,
} from "@musart/core";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { getMotionAuthoring } from "../../../src/state/session/motion-authoring";
import {
  addMotionPropertyKey,
  addMotionPropertyKeys,
  captureMotionEdit,
  hasMotionKeys,
  isMotionEditCurrent,
  motionLayerCommands,
  motionPreviewPatch,
  motionPropertyTrack,
} from "../../../src/state/session/motion-edit";

function fixture(type: EffectType = "noise") {
  const effect = createEffect(type, { id: "fx" });
  const layer = createLayer("rectangle", { id: "shape", x: 10, effects: [effect] });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "page", layers: [layer] })] }),
  );
  engine.select([layer.id]);
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(engine.getSnapshot()),
  });
  const transport = createMotionTransport(engine);
  const page = () => engine.getSnapshot().project.pages[0]!;
  return { engine, transport, page, effect, layer };
}
const x: MotionPropertyTarget = { kind: "layer", layerId: "shape", property: "x" };

test("first key captures the pose, later edits upsert exact keys and one transaction undoes all edited values", () => {
  const d = fixture();
  addMotionPropertyKey(d.engine, x);
  expect(hasMotionKeys(d.page(), x)).toBe(true);
  expect(motionPropertyTrack(d.page(), x)?.keyframes[0]?.value).toBe(10);
  d.transport.seek({ value: 1, rate: 1 });
  const before = d.engine.getSnapshot();
  const origin = captureMotionEdit(d.engine, x);
  const commands = motionLayerCommands(d.engine, origin, ["shape"], { x: 80, y: 90 });
  d.engine.transaction(commands);
  expect(d.page().layers[0]).toMatchObject({ x: 10, y: 90 });
  expect(motionPropertyTrack(d.page(), x)?.keyframes.map((key) => key.value)).toEqual([10, 80]);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  d.engine.redo();
  d.engine.transaction(
    motionLayerCommands(d.engine, captureMotionEdit(d.engine, x), ["shape"], { x: 100 }),
  );
  expect(motionPropertyTrack(d.page(), x)?.keyframes.map((key) => key.value)).toEqual([10, 100]);
  d.transport.seek({ value: 1, rate: 2 });
  expect(d.transport.readFrame()?.layers[0]?.x).toBe(55);
});

test("Static edits only the base design even with Auto-key enabled and retained tracks", () => {
  const d = fixture();
  addMotionPropertyKey(d.engine, x);
  getMotionAuthoring(d.engine).set(true);
  d.engine.execute({ type: "setCompositionMode", mode: "static" });
  const tracks = d.page().motion!.tracks;
  d.engine.transaction(
    motionLayerCommands(d.engine, captureMotionEdit(d.engine, x), ["shape"], { x: 120 }),
  );
  expect(d.page().layers[0]!.x).toBe(120);
  expect(d.page().motion!.tracks).toEqual(tracks);
  expect(d.transport.readFrame()).toBeNull();
});

test("Auto-key is explicit, time/revision changes reject stale gestures and unknown targets are rejected", () => {
  const d = fixture();
  let origin = captureMotionEdit(d.engine, x);
  expect(motionLayerCommands(d.engine, origin, ["shape"], { x: 30 })[0]).toMatchObject({
    type: "updateLayers",
  });
  getMotionAuthoring(d.engine).set(true);
  origin = captureMotionEdit(d.engine, x);
  d.engine.transaction(motionLayerCommands(d.engine, origin, ["shape"], { x: 40 }));
  expect(d.page().layers[0]!.x).toBe(10);
  expect(motionPropertyTrack(d.page(), x)?.keyframes).toHaveLength(1);
  origin = captureMotionEdit(d.engine, x);
  d.transport.seek({ value: 1, rate: 1 });
  expect(isMotionEditCurrent(d.engine, origin)).toBe(false);
  expect(motionLayerCommands(d.engine, origin, ["shape"], { x: 50 })).toEqual([]);
  origin = captureMotionEdit(d.engine, x);
  d.engine.execute({ type: "renameProject", name: "Changed" });
  expect(motionLayerCommands(d.engine, origin, ["shape"], { x: 60 })).toEqual([]);
  expect(() => addMotionPropertyKey(d.engine, { ...x, layerId: "missing" })).toThrow();
});

test("effect drafts preserve other evaluated parameters and keyed optional fields do not alter base defaults", () => {
  const d = fixture();
  const opacity: MotionPropertyTarget = {
    kind: "effect",
    layerId: "shape",
    effectId: "fx",
    property: "opacity",
  };
  addMotionPropertyKey(d.engine, opacity);
  d.transport.seek({ value: 1, rate: 1 });
  const patch = { effects: [{ ...d.effect, opacity: 0.3 }] };
  const origin = captureMotionEdit(d.engine, opacity);
  const commands = motionLayerCommands(d.engine, origin, ["shape"], patch, {
    effectId: "fx",
    patch: { opacity: 0.3 },
  });
  expect(commands).toHaveLength(1);
  d.engine.transaction(commands);
  expect(d.page().layers[0]!.effects[0]!.opacity).toBeUndefined();
  const seed: MotionPropertyTarget = {
    kind: "effect",
    layerId: "shape",
    effectId: "fx",
    property: "seed",
  };
  const draft = motionPreviewPatch(
    d.engine,
    captureMotionEdit(d.engine, seed),
    ["shape"],
    { effects: [{ ...d.effect, seed: 9 }] },
    { effectId: "fx", patch: { seed: 9 } },
  );
  expect(draft.effects?.[0]).toMatchObject({ opacity: 0.3, seed: 9 });
  expect(d.page().layers[0]!.effects[0]!.seed).not.toBe(9);
});

test("coupled and multiple-owner keys are atomic and inherited locks roll back the entire batch", () => {
  const d = fixture();
  const targets: MotionPropertyTarget[] = ["width", "height"].map(
    (property) => ({ kind: "layer", layerId: "shape", property }) as MotionPropertyTarget,
  );
  addMotionPropertyKeys(d.engine, targets);
  d.transport.seek({ value: 1, rate: 1 });
  d.engine.transaction(
    motionLayerCommands(d.engine, captureMotionEdit(d.engine, targets), ["shape"], {
      width: 400,
      height: 200,
    }),
  );
  expect(
    targets.map((target) => motionPropertyTrack(d.page(), target)?.keyframes.at(-1)?.value),
  ).toEqual([400, 200]);
  const before = d.engine.getSnapshot().project;
  d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { locked: true } });
  const locked = d.engine.getSnapshot();
  expect(() => addMotionPropertyKeys(d.engine, targets)).toThrow();
  expect(d.engine.getSnapshot()).toBe(locked);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
});

test("every catalog effect routes real typed parameter edits through the shared registry", () => {
  for (const type of Object.keys(EFFECT_CATALOG) as EffectType[]) {
    const d = fixture(type);
    const parameter = getEffectDefinition(type).parameters.find(
      (parameter) => parameter.scope !== "settings" || parameter.key !== "preset",
    )!;
    const value = getEffectParameter(d.effect, parameter);
    const next =
      parameter.kind === "number"
        ? value === parameter.min
          ? parameter.max
          : parameter.min
        : parameter.kind === "boolean"
          ? !value
          : parameter.kind === "color"
            ? "#123456"
            : (parameter.options.find((option) => option.value !== value)?.value ?? value);
    const target: MotionPropertyTarget =
      parameter.scope === "settings"
        ? { kind: "effectSetting", layerId: "shape", effectId: "fx", property: parameter.key }
        : {
            kind: "effect",
            layerId: "shape",
            effectId: "fx",
            property: parameter.key as Extract<
              MotionPropertyTarget,
              { kind: "effect" }
            >["property"],
          };
    addMotionPropertyKey(d.engine, target);
    d.transport.seek({ value: 1, rate: 1 });
    const patch = patchEffectParameter(d.effect, parameter, next);
    d.engine.transaction(
      motionLayerCommands(
        d.engine,
        captureMotionEdit(d.engine, target),
        ["shape"],
        { effects: [{ ...d.effect, ...patch }] },
        { effectId: "fx", patch },
      ),
    );
    expect(motionPropertyTrack(d.page(), target)?.keyframes.at(-1)?.value, type).toBe(next);
    expect(getEffectParameter(d.page().layers[0]!.effects[0]!, parameter), type).toBe(value);
  }
});
test("Auto-key expands a preset macro into actual parameter keys instead of an inert preset track", () => {
  const d = fixture("gradient");
  const parameter = getEffectDefinition("gradient").parameters.find(
    (parameter) => parameter.key === "preset",
  )!;
  const preset = GRADIENT_PRESETS.find((preset) => preset.id !== d.effect.settings?.preset)!;
  const patch = patchEffectParameter(d.effect, parameter, preset.id);
  getMotionAuthoring(d.engine).set(true);
  d.transport.seek({ value: 1, rate: 1 });
  const target = {
    kind: "effectSetting" as const,
    layerId: "shape",
    effectId: "fx",
    property: "preset",
  };
  d.engine.transaction(
    motionLayerCommands(
      d.engine,
      captureMotionEdit(d.engine, target),
      ["shape"],
      { effects: [{ ...d.effect, ...patch }] },
      { effectId: "fx", patch },
    ),
  );
  const properties = d.page().motion!.tracks[0]!.properties;
  expect(
    properties.some(
      ({ target }) => target.kind === "effectSetting" && target.property === "preset",
    ),
  ).toBe(false);
  expect(
    properties.some(
      ({ target }) => target.kind === "effectSetting" && target.property === "color0",
    ),
  ).toBe(true);
  expect(
    properties.some(({ target }) => target.kind === "effect" && target.property === "seed"),
  ).toBe(true);
  expect(d.page().layers[0]!.effects[0]!.scale).toBe(d.effect.scale);
  expect(d.page().layers[0]!.effects[0]!.settings?.color0).toBe(d.effect.settings?.color0);
});
test("gradient drafts preserve other evaluated channels and can key a return to the base angle", () => {
  const d = fixture();
  const gradient = {
    kind: "linear" as const,
    angle: 0,
    stops: [
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" },
    ],
  };
  d.engine.execute({ type: "updateLayers", ids: ["shape"], patch: { fillGradient: gradient } });
  const angle = {
    kind: "layer" as const,
    layerId: "shape",
    property: "fillGradient.angle" as const,
  };
  const kind = { kind: "layer" as const, layerId: "shape", property: "fillGradient.kind" as const };
  addMotionPropertyKey(d.engine, angle);
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: kind,
    time: { value: 0, rate: 1 },
    value: "radial",
  });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: angle,
    time: { value: 1, rate: 1 },
    value: 90,
  });
  d.transport.seek({ value: 1, rate: 1 });
  const origin = captureMotionEdit(d.engine, angle);
  expect(
    motionPreviewPatch(d.engine, origin, ["shape"], { fillGradient: { ...gradient, angle: 20 } })
      .fillGradient,
  ).toMatchObject({ kind: "radial", angle: 20 });
  d.engine.transaction(
    motionLayerCommands(d.engine, origin, ["shape"], { fillGradient: gradient }),
  );
  expect(motionPropertyTrack(d.page(), angle)?.keyframes.at(-1)?.value).toBe(0);
  expect(d.page().layers[0]!.fillGradient).toEqual(gradient);
});
