import { expect, it, vi } from "vitest";
import { createSliderValue } from "../../../src/components/ui/slider-value";

it("publishes immutable changed values and disposes listeners", () => {
  const input = [0];
  const source = createSliderValue(input);
  input[0] = 10;
  expect(source.read()).toEqual([0]);
  const initial = source.read();
  const listener = vi.fn();
  const stop = source.subscribe(listener);
  source.set([0]);
  expect(source.read()).toBe(initial);
  source.set([0.5]);
  expect(listener).toHaveBeenCalledOnce();
  expect(source.read()).toEqual([0.5]);
  expect(Object.isFrozen(source.read())).toBe(true);
  expect(() => source.set([NaN])).toThrow();
  stop();
  source.set([1]);
  expect(listener).toHaveBeenCalledOnce();
});
