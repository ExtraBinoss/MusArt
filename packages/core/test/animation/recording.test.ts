import { describe, it, expect, vi } from "vitest";
import { recordSession, observeReplay } from "../../src/animation/recording";
import { createPage, createProject } from "../../src/document/factories";
import { setup, box, asset } from "../support/fixture";
import type { ReplayEvent, CommandCommit } from "../../src/animation/model";
import type { Asset, SessionSnapshot } from "../../src/document/model";
import * as replayDelta from "../../src/animation/delta";
import { stateFromProject } from "../../src/animation/state";
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
        onEvent: (event) => {
          observed.push(event);
        },
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
    const stop = observeReplay(engine, {
      now: () => time,
      onEvent: (event) => {
        events.push(event);
      },
    });
    time = -10;
    engine.execute({ type: "renameProject", name: "Past" });
    expect(events[0]!.at).toBe(0);
    time = NaN;
    expect(() => engine.execute({ type: "renameProject", name: "Invalid clock" })).toThrow(
      "finite",
    );
    stop();
  });
  it("defers diffing and event freezing while capturing ordered summary transitions and their exact snapshots", async () => {
    const { engine } = setup([box("a")]),
      initial = stateFromProject(engine.getSnapshot().project),
      scheduled: (() => void | Promise<void>)[] = [],
      delivered: {
        event: ReplayEvent;
        assets: Record<string, Asset>;
        snapshot: SessionSnapshot;
      }[] = [],
      fullSubscription = vi.spyOn(engine, "subscribeCommands"),
      diff = vi.spyOn(replayDelta, "diffReplayState");
    let time = 0;
    const stop = observeReplay(engine, {
      commandMode: "summary",
      checkpointInterval: 2,
      now: () => time,
      schedule: (emit) => {
        scheduled.push(emit);
      },
      onEvent: async (event, assets, snapshot) => {
        await Promise.resolve();
        delivered.push({ event, assets, snapshot });
      },
    });
    engine.execute({ type: "setReplay", replay: null });
    time = 10;
    engine.transaction([
      { type: "updateLayers", ids: ["a"], patch: { x: 20 } },
      { type: "renameProject", name: "First" },
    ]);
    time = 20;
    engine.undo();
    time = 30;
    engine.redo();
    time = 40;
    engine.load({ ...engine.getSnapshot().project, name: "Same project load" });
    time = 50;
    engine.load(createProject({ id: "other-project", assets: { original: asset() } }));
    time = 60;
    engine.execute({ type: "renameProject", name: "Other project commit" });
    stop();
    time = 1000;
    engine.execute({ type: "renameProject", name: "Not observed" });
    expect(scheduled).toHaveLength(6);
    expect(delivered).toEqual([]);
    expect(diff).not.toHaveBeenCalled();
    expect(fullSubscription).not.toHaveBeenCalled();
    for (const emit of scheduled) await emit();
    expect(diff).toHaveBeenCalledTimes(6);
    expect(delivered.map(({ event }) => event.at)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(delivered.map(({ event }) => event.kind)).toEqual([
      "commit",
      "undo",
      "redo",
      "load",
      "load",
      "commit",
    ]);
    expect(delivered[0]!.event.commands).toEqual([
      { type: "updateLayers", summary: true },
      { type: "renameProject", summary: true },
    ]);
    expect(delivered[0]!.event.after).toBeUndefined();
    expect(delivered[1]!.event.after).toBeDefined();
    expect(delivered[3]!.event.after).toBeDefined();
    expect(delivered[4]!.assets).toEqual({ original: asset() });
    expect(delivered[5]!.assets).toEqual({});
    expect(delivered[0]!.snapshot.project.name).toBe("First");
    expect(delivered[5]!.snapshot.project.name).toBe("Other project commit");
    let state = initial;
    for (const { event, snapshot, assets } of delivered) {
      state = replayDelta.applyReplayDelta(state, event.delta);
      expect(state).toEqual(stateFromProject(snapshot.project));
      expect(event.pageId).toBe(snapshot.pageId);
      expect(event.projectId).toBe(snapshot.project.id);
      expect(Object.isFrozen(event)).toBe(true);
      expect(Object.isFrozen(assets)).toBe(true);
    }
  });
  it("falls back to detailed observation for summary mode on custom engine ports", () => {
    const { engine } = setup([box("a")]),
      { subscribeCommitInfo: _summary, ...custom } = engine,
      onEvent = vi.fn(),
      stop = observeReplay(custom, { commandMode: "summary", onEvent });
    engine.transaction([
      { type: "setReplay", replay: null },
      { type: "updateLayers", ids: ["a"], patch: { x: 80 } },
    ]);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent.mock.calls[0]![0].commands).toEqual([{ type: "updateLayers", summary: true }]);
    stop();
    const { subscribeCommands: _full, ...summaryOnly } = engine,
      stopSummaryOnly = observeReplay(summaryOnly, { commandMode: "summary", onEvent });
    engine.execute({ type: "renameProject", name: "Summary-only port" });
    expect(onEvent).toHaveBeenCalledTimes(2);
    stopSummaryOnly();
    expect(() => observeReplay(summaryOnly, { onEvent })).toThrow("observation");
    expect(() => observeReplay(engine, { commandMode: "invalid" as never, onEvent })).toThrow(
      "mode",
    );
  });
  it("returns one callback promise to its scheduler even when an emission is requested twice", async () => {
    const { engine } = setup(),
      scheduled: (() => void | Promise<void>)[] = [];
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
        finish = resolve;
      }),
      onEvent = vi.fn(() => pending),
      stop = observeReplay(engine, {
        commandMode: "summary",
        schedule: (emit) => {
          scheduled.push(emit);
        },
        onEvent,
      });
    engine.execute({ type: "renameProject", name: "Pending" });
    const first = scheduled[0]!();
    expect(first).toBe(pending);
    expect(scheduled[0]!()).toBe(first);
    expect(onEvent).toHaveBeenCalledOnce();
    finish();
    await first;
    stop();
  });
  it("captures each nested snapshot publication as a distinct deferred replay transition", async () => {
    const { engine } = setup(),
      initial = stateFromProject(engine.getSnapshot().project),
      emissions: (() => void | Promise<void>)[] = [],
      events: ReplayEvent[] = [];
    engine.subscribe(() => {
      if (engine.getSnapshot().project.name === "A")
        engine.execute({ type: "renameProject", name: "B" });
    });
    const stop = observeReplay(engine, {
      commandMode: "summary",
      schedule: (emit) => {
        emissions.push(emit);
      },
      onEvent: (event) => {
        events.push(event);
      },
    });
    engine.execute({ type: "renameProject", name: "A" });
    for (const emit of emissions) await emit();
    expect(events).toHaveLength(2);
    const first = replayDelta.applyReplayDelta(initial, events[0]!.delta),
      second = replayDelta.applyReplayDelta(first, events[1]!.delta);
    expect(first.name).toBe("A");
    expect(second.name).toBe("B");
    stop();
  });
  it("propagates synchronous scheduler/emitter failures and asynchronous callback rejections", async () => {
    const { engine } = setup(),
      error = new Error("Recording failed"),
      scheduled: (() => void | Promise<void>)[] = [],
      onEvent = vi.fn(() => {
        throw error;
      });
    let stop = observeReplay(engine, {
      commandMode: "summary",
      schedule: (emit) => {
        scheduled.push(emit);
      },
      onEvent,
    });
    engine.execute({ type: "renameProject", name: "Captured" });
    expect(() => scheduled[0]!()).toThrow(error);
    expect(() => scheduled[0]!()).toThrow(error);
    expect(onEvent).toHaveBeenCalledOnce();
    stop();
    stop = observeReplay(engine, {
      commandMode: "summary",
      schedule: () => {
        throw error;
      },
      onEvent: () => {},
    });
    expect(() => engine.execute({ type: "renameProject", name: "Scheduler failed" })).toThrow(
      error,
    );
    expect(engine.getSnapshot().project.name).toBe("Scheduler failed");
    stop();
    scheduled.length = 0;
    stop = observeReplay(engine, {
      commandMode: "summary",
      schedule: (emit) => {
        scheduled.push(emit);
      },
      onEvent: async () => {
        throw error;
      },
    });
    engine.execute({ type: "renameProject", name: "Async rejection" });
    await expect(scheduled[0]!()).rejects.toBe(error);
    stop();
    stop = observeReplay(engine, {
      onEvent: () => {
        throw error;
      },
    });
    expect(() => engine.execute({ type: "renameProject", name: "Sync callback" })).toThrow(error);
    stop();
  });
});
