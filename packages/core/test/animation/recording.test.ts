import { describe, it, expect, vi } from "vitest";
import { recordSession, observeReplay } from "../../src/animation/recording";
import { createPage, createProject } from "../../src/document/factories";
import { setup, box, asset } from "../support/fixture";
import type { ReplayEvent, CommandCommit } from "../../src/animation/model";
describe("committed replay observation", () => {
  it("records valid transactions once, excludes selection and invalid edits, and observes undo/redo", () => {
    const { engine } = setup([box("a")]);
    let time = 0;
    const commits: CommandCommit[] = [];
    const unsubscribe = engine.subscribeCommands((commit) => commits.push(commit));
    const recorder = recordSession(engine, { now: () => time, checkpointInterval: 2 });
    engine.select(["a"]);
    engine.setPage("page");
    expect(() =>
      engine.execute({ type: "updateLayers", ids: ["a"], patch: { opacity: 2 } }),
    ).toThrow();
    time = 100;
    engine.transaction([
      { type: "updateLayers", ids: ["a"], patch: { x: 20 } },
      { type: "updateLayers", ids: ["a"], patch: { y: 30 } },
    ]);
    time = 200;
    engine.undo();
    time = 300;
    engine.redo();
    const spec = recorder.stop();
    expect(spec.events.map((event) => event.kind)).toEqual(["commit", "undo", "redo"]);
    expect(spec.events.map((event) => event.at)).toEqual([100, 200, 300]);
    expect(spec.events[0]!.commands).toHaveLength(2);
    expect(spec.events[0]!.after).toBeUndefined();
    expect(spec.events[1]!.after).toBeDefined();
    expect(spec.events[0]!.delta).toEqual([
      { op: "set", path: ["pages", 0, "layers", 0, "x"], value: 20 },
      { op: "set", path: ["pages", 0, "layers", 0, "y"], value: 30 },
    ]);
    expect(Object.isFrozen(spec.events[0]!.delta)).toBe(true);
    expect(commits).toHaveLength(3);
    expect(Object.isFrozen(commits[0]!.commands)).toBe(true);
    expect(recorder.stop()).toBe(spec);
    expect(recorder.snapshot()).toBe(spec);
    unsubscribe();
    engine.execute({ type: "renameProject", name: "After" });
    expect(commits).toHaveLength(3);
    expect(recorder.snapshot().events).toHaveLength(3);
  });
  it("streams without retaining events and supplies future originals once instead of embedding bytes in deltas", () => {
    const { engine } = setup();
    let time = 0;
    const callback = vi.fn();
    const recorder = recordSession(engine, {
      now: () => time,
      retainEvents: false,
      onEvent: callback,
    });
    time = 20;
    engine.execute({
      type: "addLayers",
      layers: [box("image", 0, 0, { kind: "image", assetId: "original" })],
      assets: [asset()],
    });
    time = 40;
    engine.execute({ type: "updateLayers", ids: ["image"], patch: { x: 50 } });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0]![1]).toEqual({ original: asset() });
    expect(callback.mock.calls[1]![1]).toEqual({});
    expect(JSON.stringify(callback.mock.calls[0]![0])).not.toContain("data:image");
    const result = recorder.stop();
    expect(result.events).toEqual([]);
    expect(result.assets).toEqual({ original: asset() });
    expect(result.duration).toBe(40);
    recorder.dispose();
  });
  it("resynchronizes a same-project load and stops portable recording when changing projects", () => {
    const { engine } = setup([box("a")]);
    let time = 0;
    const observed: ReplayEvent[] = [];
    const stop = observeReplay(engine, {
        now: () => time,
        onEvent: (event) => observed.push(event),
      }),
      recorder = recordSession(engine, { now: () => time });
    time = 10;
    engine.load({ ...engine.getSnapshot().project, name: "Reopened" });
    expect(observed[0]!.kind).toBe("load");
    expect(observed[0]!.after).toBeDefined();
    time = 20;
    engine.load(createProject({ pages: [createPage()] }));
    expect(observed[1]!.after).toBeDefined();
    expect(recorder.snapshot().events).toHaveLength(1);
    const frozen = recorder.snapshot();
    time = 30;
    engine.execute({ type: "renameProject", name: "Other" });
    expect(recorder.snapshot()).toBe(frozen);
    stop();
  });
  it("excludes replay storage commands and cleans up disposed sessions, including a deterministic default clock", () => {
    const { engine } = setup();
    const callback = vi.fn();
    const recording = recordSession(engine, { onEvent: callback });
    engine.execute({ type: "setReplay", replay: null });
    expect(callback).not.toHaveBeenCalled();
    engine.execute({ type: "renameProject", name: "A" });
    expect(recording.snapshot().duration).toBeGreaterThan(0);
    recording.dispose();
    recording.dispose();
    const snapshot = recording.snapshot();
    engine.execute({ type: "renameProject", name: "B" });
    expect(recording.snapshot()).toBe(snapshot);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("validates optional observation capability, checkpoint limits and clocks explicitly", () => {
    const { engine } = setup();
    const { subscribeCommands: _subscribe, ...without } = engine;
    expect(() => recordSession(without)).toThrow("observation");
    for (const checkpointInterval of [0, 1.5, 10001])
      expect(() => observeReplay(engine, { checkpointInterval, onEvent: () => {} })).toThrow(
        "interval",
      );
    let time = 0;
    const events: ReplayEvent[] = [];
    const stop = observeReplay(engine, { now: () => time, onEvent: (event) => events.push(event) });
    time = -10;
    engine.execute({ type: "renameProject", name: "Past" });
    expect(events[0]!.at).toBe(0);
    time = NaN;
    expect(() => engine.execute({ type: "renameProject", name: "Invalid clock" })).toThrow(
      "finite",
    );
    stop();
  });
});
