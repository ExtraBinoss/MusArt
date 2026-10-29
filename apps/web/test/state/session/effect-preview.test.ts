import { expect, it, vi } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
import {
  effectPreviewActivity,
  freezeEffectPreviews,
  startEffectPreview,
} from "../../../src/state/session/effect-preview";

function fixture() {
  const engine = new EditorEngine(createProject());
  let now = 0,
    id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const options = {
    time: 2,
    clock: {
      now: () => now,
      request: (cb: FrameRequestCallback) => {
        pending.set(++id, cb);
        return id;
      },
      cancel: (id: number) => pending.delete(id),
    },
    begin: vi.fn(),
    preview: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    stopped: vi.fn(),
  };
  return {
    engine,
    options,
    pending,
    tick(value: number) {
      now = value;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((cb) => cb(now));
    },
  };
}
it("caps publications, freezes the requested phase once, and releases its RAF", () => {
  const d = fixture(),
    finish = startEffectPreview(d.engine, d.options);
  expect(d.options.begin).toHaveBeenCalledOnce();
  d.tick(16);
  expect(d.options.preview).not.toHaveBeenCalled();
  d.tick(34);
  d.tick(68);
  expect(d.options.preview.mock.calls.map(([time]) => time)).toEqual([2.034, 2.068]);
  freezeEffectPreviews(d.engine);
  finish();
  expect(d.options.commit).toHaveBeenCalledExactlyOnceWith(2.068);
  expect(d.options.stopped).toHaveBeenCalledOnce();
  expect(d.pending.size).toBe(0);
  d.tick(5000);
  expect(d.options.preview).toHaveBeenCalledTimes(2);
});
it("cancels without an edit, bounds long phases, and isolates editors", () => {
  const a = fixture(),
    b = fixture();
  const finish = startEffectPreview(a.engine, a.options);
  startEffectPreview(b.engine, b.options);
  a.tick(86401000);
  expect(a.options.preview).toHaveBeenLastCalledWith(3);
  finish(false);
  expect(a.options.commit).not.toHaveBeenCalled();
  expect(a.options.cancel).toHaveBeenCalledOnce();
  expect(b.pending.size).toBe(1);
  startEffectPreview(b.engine, b.options); // Replaces the older live gesture.
  expect(b.options.cancel).toHaveBeenCalledOnce();
  freezeEffectPreviews(b.engine);
  expect(b.pending.size).toBe(0);
});
it("restores the original phase on start failure and keeps cleanup idempotent", () => {
  const d = fixture();
  d.options.begin.mockImplementation(() => {
    throw new Error("stale edit");
  });
  expect(() => startEffectPreview(d.engine, d.options)).toThrow("stale edit");
  expect(d.options.cancel).toHaveBeenCalledOnce();
  expect(d.pending.size).toBe(0);
  freezeEffectPreviews(d.engine);
  expect(d.options.stopped).toHaveBeenCalledOnce();
});
it("notifies background admission only at start/stop and cleans up a failed preview", () => {
  const d = fixture(),
    activity = effectPreviewActivity(d.engine),
    changed = vi.fn();
  const stop = activity.subscribe(changed);
  expect(activity.busy()).toBe(false);
  startEffectPreview(d.engine, d.options);
  expect(activity.busy()).toBe(true);
  expect(changed).toHaveBeenCalledOnce();
  d.tick(100);
  d.tick(200);
  expect(changed).toHaveBeenCalledOnce();
  d.options.preview.mockImplementation(() => {
    throw new Error("preview superseded");
  });
  expect(() => d.tick(300)).toThrow("preview superseded");
  expect(activity.busy()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(d.pending.size).toBe(0);
  expect(d.options.cancel).toHaveBeenCalledOnce();
  stop();
  startEffectPreview(d.engine, d.options);
  freezeEffectPreviews(d.engine, false);
  expect(changed).toHaveBeenCalledTimes(2);
});
it("cancels a stale editor even when load preserves IDs, while equivalent selection stays valid", () => {
  const d = fixture();
  const stop = vi.spyOn(d.engine, "subscribe");
  startEffectPreview(d.engine, d.options);
  d.engine.select([]);
  expect(effectPreviewActivity(d.engine).busy()).toBe(true);
  d.tick(100);
  d.engine.execute({ type: "renameProject", name: "Changed outside playback" });
  expect(d.options.cancel).toHaveBeenCalledOnce();
  expect(d.pending.size).toBe(0);
  expect(effectPreviewActivity(d.engine).busy()).toBe(false);
  expect(stop).toHaveBeenCalledOnce();
  const next = fixture();
  startEffectPreview(next.engine, next.options);
  next.engine.load(structuredClone(next.engine.getSnapshot().project));
  expect(next.options.cancel).toHaveBeenCalledOnce();
  expect(next.pending.size).toBe(0);
});
