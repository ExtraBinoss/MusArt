import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  useTransformSnapping,
  type TransformGesture,
} from "../../../../src/canvas/interaction/snapping/use-transform-snapping";
import { captureGestureOrigin } from "../../../../src/canvas/interaction/gesture-origin";
import { SceneController } from "../../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../../src/state/session/preview-source";
import { snappingPreferences } from "../../../../src/state/snapping/preferences";
import type { LayerPatch } from "../../../../src/canvas/interaction/gestures";
afterEach(() => {
  cleanup();
  snappingPreferences.reset();
});
function fixture() {
  snappingPreferences.update({ enabled: true, threshold: 6 });
  const layer = createLayer("rectangle", { id: "moving", x: 10, y: 10, width: 20, height: 20 }),
    page = createPage({ width: 200, height: 160, layers: [layer] });
  const engine = new EditorEngine(createProject({ pages: [page] })),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE);
  const gesture: { current: TransformGesture | null } = {
    current: {
      origin: captureGestureOrigin(engine),
      mode: "move",
      from: { x: 20, y: 20 },
      current: { x: 87, y: 20 },
      layers: [layer],
    },
  };
  const patches: { current: LayerPatch[] } = { current: [] },
    view = { read: () => ({ x: 0, y: 0, zoom: 1 }), subscribe: () => () => {} };
  const hook = renderHook(() =>
    useTransformSnapping({ engine, controller, view, gesture, patches }),
  );
  return { engine, controller, gesture, patches, ...hook };
}
it("shares imperative pointer/preference/modifier updates and disposes both subscriptions", () => {
  const d = fixture(),
    origin = d.engine.getSnapshot().project;
  act(() => d.result.current.update(d.gesture.current!, { x: 87, y: 20 }, false, false));
  expect(d.patches.current[0]!.patch.x).toBe(80);
  expect(d.result.current.feedback.read().cues.length).toBeGreaterThan(0);
  act(() => {
    snappingPreferences.update({ enabled: false });
  });
  expect(d.patches.current[0]!.patch.x).toBe(77);
  act(() => {
    snappingPreferences.update({ enabled: true });
  });
  expect(d.patches.current[0]!.patch.x).toBe(80);
  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  expect(d.patches.current[0]!.patch.x).toBe(77);
  fireEvent.keyUp(window, { key: "Alt", altKey: false });
  expect(d.patches.current[0]!.patch.x).toBe(80);
  expect(d.engine.getSnapshot().project).toBe(origin);
  const patches = d.patches.current;
  d.unmount();
  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  snappingPreferences.update({ enabled: false });
  expect(d.patches.current).toBe(patches);
  expect(d.result.current.feedback.read().cues).toEqual([]);
});
it("ignores unrelated keys, inactive/stale gestures and preserves document state", () => {
  const d = fixture(),
    patches = d.patches.current;
  fireEvent.keyDown(window, { key: "x", altKey: true });
  expect(d.patches.current).toBe(patches);
  act(() => d.engine.execute({ type: "renameProject", name: "Changed" }));
  act(() => {
    snappingPreferences.update({ enabled: false });
  });
  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  expect(d.patches.current).toBe(patches);
  expect(d.result.current.feedback.read().cues).toEqual([]);
  d.gesture.current = null;
  fireEvent.keyUp(window, { key: "Alt" });
  act(() => {
    snappingPreferences.update({ enabled: true });
  });
  expect(d.patches.current).toBe(patches);
});
