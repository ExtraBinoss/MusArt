import { expect, test, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { getMotionAuthoring } from "../../../src/state/session/motion-authoring";

test("shares explicit capture state only within one engine and cleans subscriptions", () => {
  const engine = new EditorEngine();
  const state = getMotionAuthoring(engine);
  const changed = vi.fn();
  const stop = state.subscribe(changed);
  expect(state.read()).toBe(false);
  expect(getMotionAuthoring(engine)).toBe(state);
  state.set(true);
  state.set(true);
  expect(state.read()).toBe(true);
  expect(changed).toHaveBeenCalledOnce();
  expect(getMotionAuthoring(new EditorEngine()).read()).toBe(false);
  stop();
  state.set(false);
  expect(changed).toHaveBeenCalledOnce();
});
