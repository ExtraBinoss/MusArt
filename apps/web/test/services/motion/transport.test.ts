import { describe, expect, it, vi } from "vitest";
import { EditorEngine, createProject, createPage, createLayer } from "@musart/core";
import {
  MotionTransport,
  createMotionTransport,
  type MotionScheduler,
} from "../../../src/services/motion/transport";

function clock() {
  let now = 0,
    sequence = 0;
  const pending = new Map<number, () => void>();
  const scheduler: MotionScheduler = {
    now: () => now,
    request: (callback) => {
      const id = ++sequence;
      pending.set(id, callback);
      return id;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  };
  return {
    scheduler,
    pending,
    advance(ms: number) {
      now += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}
function setup() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({ id: "page", layers: [createLayer("rectangle", { id: "item", x: 50 })] }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.transaction([
    {
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "item", property: "x" },
      time: { value: 0, rate: 1 },
      value: 0,
    },
    {
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "item", property: "x" },
      time: { value: 2, rate: 1 },
      value: 200,
    },
  ]);
  const timer = clock();
  const source = new MotionTransport(engine, timer.scheduler);
  return { engine, source, timer };
}

describe("imperative Motion transport", () => {
  it("coalesces key timing drafts, updates the current pose and restores it without authoring edits", () => {
    const { engine, source, timer } = setup();
    source.seek({ value: 1, rate: 2 });
    const before = engine.getSnapshot();
    const id = before.project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[1]!.id;
    const draft = source.beginKeyframePreview([id])!;
    for (const value of [-1, -2, -3]) draft.update({ value, rate: 4 });
    expect(timer.pending.size).toBe(1);
    expect(source.readFrame()!.layers[0]!.x).toBe(50);
    timer.advance(16);
    expect(source.readFrame()!.layers[0]!.x).toBe(80);
    expect(source.isPreviewing()).toBe(true);
    expect(engine.getSnapshot()).toBe(before);
    draft.update({ value: -2, rate: 1 });
    timer.advance(16);
    expect(source.readFrame()!.layers[0]!.x).toBe(50);
    expect(source.isPreviewing()).toBe(false);
    draft.update({ value: -1, rate: 1 });
    draft.clear();
    timer.advance(16);
    expect(timer.pending.size).toBe(0);
    expect(source.readFrame()!.layers[0]!.x).toBe(50);
    expect(engine.getSnapshot()).toBe(before);
    source.dispose();
  });

  it("retires drafts after replacement, canonical changes, last unsubscribe and disposal", () => {
    const { engine, source, timer } = setup();
    const stop = source.subscribe(() => {});
    const id =
      engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[1]!.id;
    const old = source.beginKeyframePreview([id])!,
      next = source.beginKeyframePreview([id])!;
    old.update({ value: -1, rate: 1 });
    old.clear();
    expect(timer.pending.size).toBe(0);
    next.update({ value: -1, rate: 1 });
    engine.execute({ type: "renameProject", name: "Changed" });
    expect(timer.pending.size).toBe(0);
    next.update({ value: -1, rate: 1 });
    expect(timer.pending.size).toBe(0);
    source.beginKeyframePreview([id])!.update({ value: -1, rate: 1 });
    stop();
    expect(timer.pending.size).toBe(0);
    const disposed = source.beginKeyframePreview([id])!;
    disposed.update({ value: -1, rate: 1 });
    source.dispose();
    disposed.update({ value: -1, rate: 1 });
    expect(timer.pending.size).toBe(0);
    expect(source.readFrame()).toBeNull();
  });
  it("does not schedule twice when a frame listener restarts playback", () => {
    const { source, timer } = setup();
    let restarted = false;
    const stop = source.subscribe(() => {
      if (source.read().time.value > 0 && !restarted) {
        restarted = true;
        source.seek({ value: 1, rate: 4 });
        source.play();
      }
    });
    source.play();
    timer.advance(500);
    expect(timer.pending.size).toBe(1);
    source.dispose();
    stop();
    expect(timer.pending.size).toBe(0);
  });

  it("observes document/page changes on a tick even without subscribers", () => {
    const { engine, source, timer } = setup();
    source.play();
    engine.execute({ type: "addPage", page: createPage() });
    timer.advance(500);
    expect(source.read().playing).toBe(false);
    expect(source.readFrame()).toBeNull();
    expect(timer.pending.size).toBe(0);
    source.dispose();
  });
  it("finishes fractional durations at their exact rational endpoint", () => {
    const { engine, source, timer } = setup();
    engine.execute({ type: "setMotionDuration", duration: { value: 2, rate: 3 } });
    source.setPlaybackMode("once");
    source.play();
    timer.advance(1000);
    expect(source.read().time).toEqual({ value: 2, rate: 3 });
    expect(source.read().playing).toBe(false);
    expect(source.readFrame()!.layers[0]!.visible).toBe(true);
    expect(source.readFrame()!.layers[0]!.x).toBeCloseTo(200 / 3);
    source.dispose();
  });
  it("seeks backwards/randomly and exposes the exact end pose without editing history", () => {
    const { engine, source } = setup();
    const before = engine.getSnapshot();
    for (const [value, rate, expected] of [
      [3, 2, 150],
      [1, 4, 25],
      [2, 1, 200],
      [-1, 1, 0],
      [99, 1, 200],
    ]) {
      source.seek({ value: value!, rate: rate! });
      expect(source.readFrame()!.layers[0]!.x).toBe(expected);
      expect(source.readFrame()!.layers[0]!.visible).toBe(true);
    }
    expect(engine.getSnapshot()).toBe(before);
    source.dispose();
  });

  it.each(["once", "loop", "pingPong"] as const)(
    "derives %s playback from a monotonic anchor",
    (mode) => {
      const { engine, source, timer } = setup();
      const before = engine.getSnapshot();
      source.setPlaybackMode(mode);
      source.play();
      timer.advance(500);
      expect(source.readFrame()!.layers[0]!.x).toBeCloseTo(50);
      timer.advance(2000);
      expect(source.readFrame()!.layers[0]!.x).toBeCloseTo(
        mode === "once" ? 200 : mode === "loop" ? 50 : 150,
      );
      expect(source.read().playing).toBe(mode !== "once");
      expect(engine.getSnapshot()).toBe(before);
      source.dispose();
      expect(timer.pending.size).toBe(0);
    },
  );

  it("freezes inactive compositions and retains independent playheads", () => {
    const { engine, source, timer } = setup();
    const stop = source.subscribe(() => {});
    source.seek({ value: 1, rate: 2 });
    source.play();
    engine.execute({ type: "addPage", page: createPage({ id: "second" }) });
    expect(timer.pending.size).toBe(0);
    expect(source.read().compositionId).toBe("second");
    expect(source.readFrame()).toBeNull();
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    source.seek({ value: 1, rate: 1 });
    engine.setPage("page");
    expect(source.read().time).toEqual({ value: 1, rate: 2 });
    expect(source.read().playing).toBe(false);
    expect(source.readFrame()!.layers[0]!.x).toBe(50);
    engine.setPage("second");
    expect(source.read().time).toEqual({ value: 1, rate: 1 });
    stop();
    source.dispose();
  });

  it("renders the base in Static and recompiles after authored changes without stale frames", () => {
    const { engine, source } = setup();
    const stop = source.subscribe(() => {});
    source.seek({ value: 1, rate: 1 });
    expect(source.readFrame()!.layers[0]!.x).toBe(100);
    engine.execute({ type: "setCompositionMode", mode: "static" });
    expect(source.readFrame()).toBeNull();
    engine.execute({ type: "updateLayers", ids: ["item"], patch: { x: 99 } });
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    expect(source.readFrame()!.layers[0]!.x).toBe(100);
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "item", property: "x" },
      time: { value: 1, rate: 1 },
      value: 123,
    });
    expect(source.readFrame()!.layers[0]!.x).toBe(123);
    stop();
    source.dispose();
  });

  it("cleans subscription/scheduling and does not resurrect a paused/disposed callback", () => {
    const { source, timer } = setup();
    const listener = vi.fn(() => {
      if (source.read().playing) source.pause();
    });
    const stop = source.subscribe(listener);
    source.play();
    expect(timer.pending.size).toBe(0);
    stop();
    source.play();
    expect(timer.pending.size).toBe(1);
    const last = source.subscribe(() => {});
    last();
    expect(timer.pending.size).toBe(0);
    source.dispose();
    source.dispose();
    source.play();
    source.seek({ value: 1, rate: 1 });
    expect(source.readFrame()).toBeNull();
    expect(() => source.subscribe(() => {})).toThrow("disposed");
  });

  it("shares the engine-scoped source and replaces it after disposal", () => {
    const { engine, source } = setup();
    source.dispose();
    const shared = createMotionTransport(engine);
    expect(createMotionTransport(engine)).toBe(shared);
    shared.dispose();
    const replacement = createMotionTransport(engine);
    expect(replacement).not.toBe(shared);
    replacement.dispose();
  });
});
