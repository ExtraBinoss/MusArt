import { expect, it, vi } from "vitest";
import {
  DeferredDragSession,
  setDragCueAnchor,
} from "../../../../src/components/shared/dnd/session";
it("grants exclusive ownership across domains and commits once after clearing feedback", () => {
  const layers = new DeferredDragSession<string>();
  const dock = new DeferredDragSession<string>();
  const cancelLayers = vi.fn(() => layers.cancel());
  layers.begin(cancelLayers);
  layers.publish("layer-a");
  const first = document.createElement("div");
  const second = document.createElement("div");
  setDragCueAnchor(first);
  dock.begin(() => dock.cancel());
  dock.publish("command-a");
  expect(cancelLayers).toHaveBeenCalledOnce();
  expect(layers.read()).toBeNull();
  expect(first.hasAttribute("data-layer-drop-cue-target")).toBe(false);
  setDragCueAnchor(second);
  layers.cancel(); // Retired owners cannot remove the replacement's cue.
  expect(second.hasAttribute("data-layer-drop-cue-target")).toBe(true);
  const commit = vi.fn(() => {
    expect(dock.read()).toBeNull();
    expect(second.hasAttribute("data-layer-drop-cue-target")).toBe(false);
  });
  expect(dock.finish(true, commit)).toBe(true);
  expect(dock.finish(true, commit)).toBe(false);
  expect(commit).toHaveBeenCalledOnce();
});
it("rejected completion and explicit cancellation never commit", () => {
  const session = new DeferredDragSession<string>();
  const commit = vi.fn();
  session.begin(() => session.cancel());
  session.publish("source");
  expect(session.finish(false, commit)).toBe(false);
  expect(session.read()).toBeNull();
  expect(commit).not.toHaveBeenCalled();
});
