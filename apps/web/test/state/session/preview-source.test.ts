import { expect, test, vi } from "vitest";
import { createStore } from "jotai";
import {
  createPreviewSource,
  EMPTY_PREVIEW_SOURCE,
} from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";
test("forwards atom changes through an imperative port and releases subscriptions", () => {
  const store = createStore();
  const source = createPreviewSource(store);
  const listener = vi.fn();
  const stop = source.subscribe(listener);
  expect(source.read()).toBeNull();
  const value = { target: "layer" as const, layerId: "layer", patch: { fill: "#00ff00" } };
  store.set(previewAtom, value);
  expect(source.read()).toBe(value);
  expect(listener).toHaveBeenCalledOnce();
  stop();
  store.set(previewAtom, null);
  expect(listener).toHaveBeenCalledOnce();
  expect(EMPTY_PREVIEW_SOURCE.read()).toBeNull();
  EMPTY_PREVIEW_SOURCE.subscribe(listener)();
});
