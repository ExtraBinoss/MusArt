import { expect, test, vi } from "vitest";
import { createBrandActivity } from "../../../src/ui/brand/activity";
test("publishes real pending changes once, releases subscribers and cannot resurrect after disposal", () => {
  const source = createBrandActivity(),
    subscriber = vi.fn(),
    stop = source.subscribe(subscriber);
  expect(source.read()).toBe(false);
  source.set(true);
  source.set(true);
  expect(source.read()).toBe(true);
  expect(subscriber).toHaveBeenCalledOnce();
  stop();
  source.set(false);
  expect(subscriber).toHaveBeenCalledOnce();
  source.subscribe(subscriber);
  source.set(true);
  source.dispose();
  expect(source.read()).toBe(false);
  expect(subscriber).toHaveBeenCalledTimes(3);
  source.set(true);
  source.subscribe(subscriber);
  source.dispose();
  expect(source.read()).toBe(false);
  expect(subscriber).toHaveBeenCalledTimes(3);
});
test("completion subscribers cannot revive a disposed operation", () => {
  const source = createBrandActivity(true);
  const subscriber = vi.fn(() => {
    source.set(true);
    source.subscribe(subscriber);
  });
  source.subscribe(subscriber);
  source.dispose();
  expect(source.read()).toBe(false);
  expect(subscriber).toHaveBeenCalledOnce();
  source.set(true);
  expect(subscriber).toHaveBeenCalledOnce();
});
