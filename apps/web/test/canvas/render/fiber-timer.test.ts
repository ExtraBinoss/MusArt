import { afterEach, expect, it, vi } from "vitest";
import { Timer } from "three";
import { FiberTimerClock } from "../../../src/canvas/render/fiber-timer";
afterEach(() => vi.restoreAllMocks());

it("bridges R3F demand timing through Three.Timer without constructing deprecated Clock", () => {
  let time = 100;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  const warn = vi.spyOn(console, "warn"),
    update = vi.spyOn(Timer.prototype, "update"),
    clock = new FiberTimerClock();
  expect(clock.getDelta()).toBe(0);
  expect(clock.running).toBe(true);
  expect(clock.startTime).toBe(100);
  time = 116;
  expect(clock.getDelta()).toBeCloseTo(0.016);
  expect(clock.oldTime).toBe(116);
  time = 126;
  expect(clock.getElapsedTime()).toBeCloseTo(0.026);
  expect(update).toHaveBeenCalledTimes(2);
  clock.stop();
  expect(clock.autoStart).toBe(false);
  time = 2000;
  expect(clock.getDelta()).toBe(0);
  expect(clock.getElapsedTime()).toBeCloseTo(0.026);
  clock.start();
  expect(clock.elapsedTime).toBe(0);
  time = 2016;
  expect(clock.getDelta()).toBeCloseTo(0.016);
  expect(warn).not.toHaveBeenCalled();
  clock.dispose();
  clock.dispose();
  expect(clock.getDelta()).toBe(0);
  expect(() => clock.start()).toThrow("disposed");
  expect(() => clock.retain(document)).toThrow("disposed");
});
it("preserves R3F never/external-clock fields and allocates no document listener for an abandoned root", () => {
  const add = vi.spyOn(document, "addEventListener"),
    clock = new FiberTimerClock(false);
  expect(clock.getDelta()).toBe(0);
  clock.elapsedTime = 4;
  clock.oldTime = 3;
  expect(clock.getElapsedTime()).toBe(4);
  expect(clock.oldTime).toBe(3);
  expect(clock.running).toBe(false);
  clock.dispose();
  expect(add.mock.calls.filter(([name]) => name === "visibilitychange")).toHaveLength(0);
});
it("pauses hidden-tab deltas, balances visibility listeners and survives StrictMode immediate retain", async () => {
  let time = 0,
    hidden = false;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const add = vi.spyOn(document, "addEventListener"),
    remove = vi.spyOn(document, "removeEventListener"),
    clock = new FiberTimerClock();
  const first = clock.retain(document);
  clock.start();
  time = 100;
  expect(clock.getDelta()).toBeCloseTo(0.1);
  hidden = true;
  time = 10100;
  expect(clock.getDelta()).toBe(0);
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  time = 10116;
  expect(clock.getDelta()).toBeCloseTo(0.016);
  expect(clock.elapsedTime).toBeCloseTo(0.116);
  expect(() => clock.retain(document.implementation.createHTMLDocument())).toThrow(
    "another document",
  );
  first();
  first();
  const second = clock.retain(document);
  await Promise.resolve();
  time = 10132;
  expect(clock.getDelta()).toBeCloseTo(0.016);
  second();
  second();
  await Promise.resolve();
  expect(clock.running).toBe(false);
  expect(add.mock.calls.filter(([name]) => name === "visibilitychange")).toHaveLength(1);
  expect(remove.mock.calls.filter(([name]) => name === "visibilitychange")).toHaveLength(1);
});
