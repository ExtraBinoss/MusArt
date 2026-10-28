import { expect, it, vi } from "vitest";
import { createPage, EditorEngine } from "@musart/core";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
it("shares an imperative playback port per engine and never changes document/history", () => {
  const engine = new EditorEngine(),
    other = new EditorEngine(),
    source = createPlaybackSource(engine);
  expect(createPlaybackSource(engine)).toBe(source);
  expect(createPlaybackSource(other)).not.toBe(source);
  const baseline = engine.getSnapshot(),
    listener = vi.fn(),
    commands = vi.fn();
  engine.subscribeCommands(commands);
  const stop = source.subscribe(listener);
  expect(source.read()).toBeNull();
  source.set(null);
  expect(listener).not.toHaveBeenCalled();
  const page = createPage({ width: 320, height: 200 });
  source.set({ page, assets: {} });
  expect(source.read()).toMatchObject({ page, playback: true });
  expect(source.read()!.page).toBe(page);
  expect(engine.getSnapshot()).toBe(baseline);
  expect(commands).not.toHaveBeenCalled();
  source.set(null);
  expect(source.read()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  source.set({ page, assets: {} });
  expect(listener).toHaveBeenCalledTimes(2);
});
