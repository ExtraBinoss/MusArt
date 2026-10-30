import { describe, expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
} from "../../../src/document/factories";
import { parseProject, serializeProject } from "../../../src/document/serialization";
import { compileMotion } from "../../../src/motion/compile";
import { evaluateMotion } from "../../../src/motion/evaluate";
import { applyMotionFrame } from "../../../src/motion/frame";
import { EditorEngine } from "../../../src/session/engine";
import type { ApplyMotionTransitionCommand } from "../../../src/motion/transitions/model";

const time = (value: number, rate = 1) => ({ value, rate });
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ id: "page", layers: [createLayer("rectangle", { id: "layer" })] })],
    }),
  );
  const page = () => engine.getSnapshot().project.pages[0]!;
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "setMotionTrackRange",
    trackId: page().motion!.tracks[0]!.id,
    start: time(1, 2),
    end: time(2),
  });
  const command: ApplyMotionTransitionCommand = {
    type: "applyMotionTransition",
    layerId: "layer",
    style: "iris",
    placement: "in",
    duration: time(1, 2),
  };
  return { engine, page, command };
}

describe("headless transition authoring", () => {
  it("targets one repeated occurrence and keeps another occurrence's progress keys independent", () => {
    const { engine, page, command } = fixture();
    engine.execute(command);
    const original = page().motion!.tracks[0]!;
    engine.execute({ type: "duplicateMotionOccurrence", trackId: original.id, start: time(3) });
    const copy = page().motion!.tracks[1]!;
    const before = engine.getSnapshot();
    expect(() => engine.execute(command)).toThrow("Choose a Motion occurrence");
    expect(engine.getSnapshot()).toBe(before);
    engine.execute({
      ...command,
      trackId: copy.id,
      effectId: page().layers[0]!.effects[0]!.id,
      placement: "out",
    });
    expect(page().motion!.tracks[0]!.properties).toEqual(original.properties);
    expect(page().motion!.tracks[1]!.properties[0]!.keyframes.map((key) => key.time)).toEqual([
      time(4),
      time(9, 2),
    ]);
    engine.undo();
    expect(engine.getSnapshot().project).toBe(before.project);
    expect(() => engine.execute({ ...command, trackId: "missing" })).toThrow();
  });
  it("creates effect and two rational progress keys in one undo; Static keeps the unchanged base", () => {
    const { engine, page, command } = fixture();
    const before = engine.getSnapshot().project;
    engine.execute(command);
    const effect = page().layers[0]!.effects[0]!;
    const keys = page().motion!.tracks[0]!.properties[0]!;
    expect(effect).toMatchObject({ type: "transition", settings: { progress: 1, style: "iris" } });
    expect(keys.target).toEqual({
      kind: "effectSetting",
      layerId: "layer",
      effectId: effect.id,
      property: "progress",
    });
    expect(keys.keyframes.map(({ time, value }) => ({ time, value }))).toEqual([
      { time: time(1, 2), value: 0 },
      { time: time(1), value: 1 },
    ]);
    const project = engine.getSnapshot().project;
    const program = compileMotion(project, { compositionId: page().id });
    for (const [seconds, progress] of [
      [0.75, 0.5],
      [1.5, 1],
      [0.5, 0],
      [0.75, 0.5],
    ]) {
      const frame = evaluateMotion(program, time(Math.round(seconds! * 1000), 1000));
      expect(
        applyMotionFrame(program, frame).layers[0]!.effects[0]!.settings!.progress,
      ).toBeCloseTo(progress!);
    }
    expect(parseProject(serializeProject(project))).toEqual(project);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(page().layers[0]!.effects[0]!.id).toBe(effect.id);
    engine.execute({ type: "setCompositionMode", mode: "static" });
    expect(page().layers[0]!.effects[0]!.settings!.progress).toBe(1);
    expect(page().motion!.tracks[0]!.properties).toHaveLength(1);
  });

  it("authors exit keys ending at the clip boundary, supports easing, and replaces a chosen progress channel", () => {
    const { engine, page, command } = fixture();
    engine.execute(command);
    const id = page().layers[0]!.effects[0]!.id;
    engine.execute({
      ...command,
      effectId: id,
      placement: "out",
      style: "wipe",
      direction: "right",
      easing: { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
    });
    expect(page().layers[0]!.effects).toHaveLength(1);
    expect(page().layers[0]!.effects[0]!.settings).toMatchObject({
      style: "wipe",
      direction: "right",
      progress: 1,
    });
    const keys = page().motion!.tracks[0]!.properties[0]!.keyframes;
    expect(keys.map(({ time, value }) => ({ time, value }))).toEqual([
      { time: time(3, 2), value: 1 },
      { time: time(2), value: 0 },
    ]);
    expect(keys[1]!.easing).toMatchObject({ type: "cubicBezier", x1: 0.42 });
  });

  it("rejects invalid intervals, operators, locked layers and stale effect IDs atomically", () => {
    const { engine, page, command } = fixture();
    const invalid = [
      { duration: time(0) },
      { duration: time(-1) },
      { duration: time(2) },
      { duration: time(1, 0) },
      { style: "missing" },
      { placement: "between" },
      { effectId: "gone" },
      { direction: "diagonal" },
    ];
    for (const patch of invalid) {
      const before = engine.getSnapshot();
      expect(() =>
        engine.execute({ ...command, ...patch } as ApplyMotionTransitionCommand),
      ).toThrow();
      expect(engine.getSnapshot()).toBe(before);
    }
    engine.execute({
      type: "updateLayers",
      ids: ["layer"],
      patch: { effects: [createEffect("blur", { id: "blur" })] },
    });
    expect(() => engine.execute({ ...command, effectId: "blur" })).toThrow("transition");
    engine.execute({ type: "updateLayers", ids: ["layer"], patch: { locked: true } });
    expect(() => engine.execute(command)).toThrow();
    engine.execute({ type: "setCompositionMode", mode: "static" });
    expect(() => engine.execute(command)).toThrow("Motion");
    expect(page().layers[0]!.effects).toHaveLength(1);
  });
});
