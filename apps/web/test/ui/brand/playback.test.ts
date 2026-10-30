import { beforeEach, expect, test, vi } from "vitest";
import { createBrandPlayback, type BrandClock } from "../../../src/ui/brand/playback";
import { createDahliaEngine } from "../../../src/ui/brand/dahlia";

let hidden = false;
beforeEach(() => {
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
});
function fixture() {
  let stamp = 0,
    sequence = 0,
    reduced = false;
  const callbacks = new Map<number, FrameRequestCallback>(),
    listeners = new Set<() => void>();
  const clock: BrandClock = {
    now: () => stamp,
    request(callback) {
      callbacks.set(++sequence, callback);
      return sequence;
    },
    cancel(id) {
      callbacks.delete(id);
    },
  };
  const preference = {
    get matches() {
      return reduced;
    },
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  } as MediaQueryList;
  const surface = { paint: vi.fn() },
    playback = createBrandPlayback(surface, { clock, reduced: preference });
  const step = (elapsed = 34) => {
    stamp += elapsed;
    const entry = callbacks.entries().next().value;
    if (entry) {
      callbacks.delete(entry[0]);
      entry[1](stamp);
    }
  };
  return {
    playback,
    surface,
    callbacks,
    listeners,
    step,
    reduce(value: boolean) {
      reduced = value;
      for (const listener of listeners) listener();
    },
  };
}
test("idle owns no RAF; pending playback has one chain and samples the genuine engine", () => {
  const f = fixture();
  expect(f.callbacks.size).toBe(0);
  expect(f.surface.paint).toHaveBeenCalledOnce();
  f.playback.setState("loading");
  f.playback.setState("loading");
  expect(f.callbacks.size).toBe(1);
  f.step();
  const expected = createDahliaEngine();
  expected.setState("thinking", 0.75);
  expect(f.surface.paint).toHaveBeenLastCalledWith(expected.sample(0.784));
  expect(f.callbacks.size).toBe(1);
  f.playback.setState("idle");
  for (let i = 0; i < 8; i++) f.step(100);
  expect(f.callbacks.size).toBe(0);
  f.playback.dispose();
});
test("hidden and offscreen pending marks pause their clock and reduced motion has no RAF", () => {
  const f = fixture();
  f.playback.setState("loading");
  f.step();
  hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(f.callbacks.size).toBe(0);
  const painted = f.surface.paint.mock.calls.length;
  f.step(10000);
  expect(f.surface.paint).toHaveBeenCalledTimes(painted);
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  f.step();
  const expected = createDahliaEngine();
  expected.setState("thinking", 0.75);
  expect(f.surface.paint).toHaveBeenLastCalledWith(expected.sample(0.75 + 0.034 + 0.034));
  f.playback.setVisible(false);
  expect(f.callbacks.size).toBe(0);
  f.playback.setVisible(true);
  expect(f.callbacks.size).toBe(1);
  f.reduce(true);
  expect(f.callbacks.size).toBe(0);
  f.playback.setState("preparing");
  expect(f.callbacks.size).toBe(0);
  f.reduce(false);
  expect(f.callbacks.size).toBe(1);
  f.playback.dispose();
});
test("real operation completion stops immediately and disposed owners cannot resume", () => {
  const f = fixture();
  f.playback.setState("preparing");
  f.step();
  f.playback.setActive(false);
  expect(f.callbacks.size).toBe(0);
  expect(f.surface.paint).toHaveBeenLastCalledWith(createDahliaEngine().sample(0.75));
  f.playback.setState("loading");
  expect(f.callbacks.size).toBe(0);
  f.playback.setActive(true);
  expect(f.callbacks.size).toBe(1);
  const painted = f.surface.paint.mock.calls.length;
  f.playback.dispose();
  f.playback.dispose();
  expect(f.callbacks.size).toBe(0);
  expect(f.listeners.size).toBe(0);
  f.playback.setState("preparing");
  f.playback.setActive(false);
  f.playback.setVisible(true);
  document.dispatchEvent(new Event("visibilitychange"));
  f.reduce(true);
  f.step(100);
  expect(f.surface.paint).toHaveBeenCalledTimes(painted);
});
test("reduced motion presents the pending pose when an inactive or offscreen owner becomes visible", () => {
  const f = fixture();
  f.reduce(true);
  f.playback.setActive(false);
  f.playback.setState("loading");
  expect(f.surface.paint).toHaveBeenLastCalledWith(createDahliaEngine().sample(0.75));
  f.playback.setActive(true);
  const expected = createDahliaEngine();
  expected.setState("thinking", 0.75);
  expect(f.surface.paint).toHaveBeenLastCalledWith(expected.sample(1.35));
  f.playback.setVisible(false);
  f.playback.setState("preparing");
  expected.setState("orbit", 1.35);
  f.playback.setVisible(true);
  expect(f.surface.paint).toHaveBeenLastCalledWith(expected.sample(1.35 + 0.6));
  expect(f.callbacks.size).toBe(0);
  f.playback.dispose();
});
test("hover blinks and keeps one genuine idle animation chain, then returns to rest", () => {
  const f = fixture();
  f.playback.setHovered(true);
  f.playback.setHovered(true);
  expect(f.callbacks.size).toBe(1);
  f.step(17);
  const first = f.surface.paint.mock.calls.length;
  f.step(17);
  expect(f.surface.paint).toHaveBeenCalledTimes(first);
  f.step(17);
  expect(f.surface.paint).toHaveBeenCalledTimes(first + 1);
  for (let i = 0; i < 12; i++) f.step(100);
  expect(f.surface.paint.mock.calls.length).toBeGreaterThan(5);
  f.playback.setHovered(false);
  for (let i = 0; i < 4; i++) f.step(100);
  expect(f.callbacks.size).toBe(0);
  f.reduce(true);
  f.playback.setHovered(true);
  expect(f.callbacks.size).toBe(0);
  f.playback.dispose();
});
