import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";
import { observeReplayTransitions } from "../../src/animation/transitions";
import * as delta from "../../src/animation/delta";
import type { ReplayTransition } from "../../src/animation/model";
import type { EnginePort } from "../../src/document/model";

test("captures exact immutable transitions without detailed command cloning or replay diffing", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle", { id: "r" })] })] }),
  );
  const detailed = vi.spyOn(engine, "subscribeCommands"),
    diff = vi.spyOn(delta, "diffReplayState");
  const transitions: ReplayTransition[] = [];
  let time = 0;
  const stop = observeReplayTransitions(engine, {
    now: () => time,
    checkpointInterval: 2,
    onTransition: (value) => transitions.push(value),
  });
  time = 20;
  engine.execute({ type: "updateLayers", ids: ["r"], patch: { x: 12 } });
  time = 10;
  engine.execute({ type: "updateLayers", ids: ["r"], patch: { x: 24 } });
  engine.select(["r"]);
  expect(transitions).toHaveLength(2);
  expect(transitions.map((value) => [value.at, value.checkpoint])).toEqual([
    [20, false],
    [20, true],
  ]);
  expect(transitions[0]!.before.pages[0]!.layers[0]!.x).not.toBe(12);
  expect(transitions[0]!.after.pages[0]!.layers[0]!.x).toBe(12);
  expect(transitions[1]!.before).toBe(transitions[0]!.after);
  expect(transitions[1]!.snapshot.project.pages[0]!.layers[0]!.x).toBe(24);
  expect(transitions[0]!.types).toEqual(["updateLayers"]);
  expect(transitions[0]!.commands).toBeUndefined();
  expect(Object.isFrozen(transitions[0])).toBe(true);
  expect(detailed).not.toHaveBeenCalled();
  expect(diff).not.toHaveBeenCalled();
  stop();
  engine.undo();
  expect(transitions).toHaveLength(2);
});

test("supports detailed observation and summary fallback on compatible custom engines", () => {
  const engine = new EditorEngine(),
    custom = Object.create(engine) as EnginePort;
  Object.defineProperty(custom, "subscribeCommitInfo", { value: undefined });
  const summaries: ReplayTransition[] = [],
    full: ReplayTransition[] = [];
  const stopSummary = observeReplayTransitions(custom, {
    onTransition: (value) => summaries.push(value),
  });
  const stopFull = observeReplayTransitions(engine, {
    commandMode: "full",
    onTransition: (value) => full.push(value),
  });
  engine.execute({ type: "renameProject", name: "Captured" });
  expect(summaries[0]!.commands).toBeUndefined();
  expect(full[0]!.commands).toEqual([{ type: "renameProject", name: "Captured" }]);
  stopFull();
  stopSummary();
});
