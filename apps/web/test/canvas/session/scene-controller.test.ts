import { describe, expect, test, vi } from "vitest";
import { createStore } from "jotai";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { video } from "../../../../../packages/core/test/assets/fixtures";
function fixture() {
  const layer = createLayer("rectangle", { width: 80, height: 60, fill: "#3366ff" });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [layer] }), createPage()] }),
  );
  const store = createStore();
  const controller = new SceneController(engine, createPreviewSource(store));
  return { layer, engine, store, controller };
}
describe("stable imperative scene controller", () => {
  test.each(["base", "held key"])(
    "clock-only Motion ticks retain the %s pose without republishing the GPU scene",
    (kind) => {
      const d = fixture();
      d.engine.execute({ type: "setCompositionMode", mode: "motion" });
      if (kind === "held key")
        d.engine.execute({
          type: "upsertMotionKeyframe",
          target: { kind: "layer", layerId: d.layer.id, property: "x" },
          time: { value: 0, rate: 1 },
          value: 99,
        });
      const motion = createMotionTransport(d.engine),
        changed = vi.fn(),
        stop = d.controller.subscribe(changed),
        frame = d.controller.read(),
        snapshot = d.engine.getSnapshot();
      for (let value = 1; value <= 60; value++) motion.seek({ value, rate: 60 });
      expect(d.controller.read()).toBe(frame);
      expect(changed).not.toHaveBeenCalled();
      motion.play();
      expect(d.controller.read().playback).toBe(true);
      motion.pause();
      expect(d.controller.read().presentation?.canonical).toBe(true);
      expect(changed).toHaveBeenCalledTimes(2);
      expect(d.engine.getSnapshot()).toBe(snapshot);
      stop();
      motion.dispose();
    },
  );

  test("coalesces unchanged hidden poses but publishes equal-length presence changes", () => {
    const d = fixture(),
      other = createLayer("ellipse");
    d.engine.execute({ type: "addLayers", layers: [other] });
    d.engine.execute({ type: "setCompositionMode", mode: "motion" });
    const tracks = d.engine.getSnapshot().project.pages[0]!.motion!.tracks;
    d.engine.transaction(
      tracks.map((track) => ({
        type: "setMotionTrackRange",
        trackId: track.id,
        start: { value: track.layerId === d.layer.id ? 0 : 1, rate: 1 },
        end: { value: track.layerId === d.layer.id ? 1 : 2, rate: 1 },
      })),
    );
    const motion = createMotionTransport(d.engine),
      changed = vi.fn(),
      stop = d.controller.subscribe(changed);
    motion.seek({ value: 1, rate: 2 });
    expect(changed).not.toHaveBeenCalled();
    motion.seek({ value: 1, rate: 1 });
    expect(d.controller.read().page.layers.map((layer) => layer.visible)).toEqual([false, true]);
    motion.seek({ value: 3, rate: 2 });
    expect(changed).toHaveBeenCalledOnce();
    stop();
    motion.dispose();
  });

  test("media clocks and both media-presence boundaries still publish when the page is unchanged", () => {
    const asset = video(),
      layer = createLayer("video", { assetId: asset.id, visible: false });
    const engine = new EditorEngine(
      createProject({
        assets: { [asset.id]: asset },
        pages: [createPage({ layers: [layer] })],
      }),
    );
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const track = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
    engine.execute({
      type: "setMotionTrackRange",
      trackId: track.id,
      start: { value: 1, rate: 1 },
      end: { value: 3, rate: 2 },
    });
    const controller = new SceneController(engine, createPreviewSource(createStore())),
      motion = createMotionTransport(engine),
      changed = vi.fn(),
      stop = controller.subscribe(changed),
      original = controller.read().page;
    motion.seek({ value: 1, rate: 2 });
    expect(changed).not.toHaveBeenCalled();
    motion.seek({ value: 1, rate: 1 });
    expect(controller.read().motionFrame?.mediaRequests).toHaveLength(1);
    motion.seek({ value: 5, rate: 4 });
    expect(controller.read().motionFrame?.time).toEqual({ value: 5, rate: 4 });
    motion.seek({ value: 3, rate: 2 });
    expect(controller.read().motionFrame?.mediaRequests).toHaveLength(0);
    motion.seek({ value: 7, rate: 4 });
    expect(controller.read().page).toBe(original);
    expect(changed).toHaveBeenCalledTimes(3);
    stop();
    motion.dispose();
  });

  test("presents Motion imperatively, acknowledges a paused revision and preserves property previews", () => {
    const d = fixture();
    d.engine.execute({ type: "setCompositionMode", mode: "motion" });
    d.engine.transaction([
      {
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: d.layer.id, property: "x" },
        time: { value: 0, rate: 1 },
        value: 0,
      },
      {
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: d.layer.id, property: "x" },
        time: { value: 2, rate: 1 },
        value: 200,
      },
    ]);
    const motion = createMotionTransport(d.engine);
    const changed = vi.fn();
    const stop = d.controller.subscribe(changed);
    const before = d.engine.getSnapshot();
    motion.seek({ value: 1, rate: 1 });
    expect(d.controller.read().page.layers[0]!.x).toBe(100);
    expect(d.controller.read().presentation).toEqual({
      origin: { projectId: before.project.id, revision: before.revision },
      canonical: true,
    });
    d.store.set(previewAtom, { target: "layer", layerId: d.layer.id, patch: { x: 120 } });
    expect(d.controller.read().page.layers[0]!.x).toBe(120);
    expect(d.controller.read().presentation?.canonical).toBe(false);
    d.store.set(previewAtom, null);
    expect(d.controller.read().page.layers[0]!.x).toBe(100);
    expect(d.engine.getSnapshot()).toBe(before);
    expect(changed).toHaveBeenCalled();
    stop();
    motion.dispose();
  });
  test("caches coherent page/assets and ignores session-only selection events", () => {
    const d = fixture();
    const listener = vi.fn();
    const first = d.controller.read();
    expect(d.controller.read()).toBe(first);
    expect(first.assets).toBe(d.engine.getSnapshot().project.assets);
    expect(first.presentation).toEqual({
      origin: { projectId: d.engine.getSnapshot().project.id, revision: 0 },
      canonical: true,
    });
    const stop = d.controller.subscribe(listener);
    d.engine.select([d.layer.id]);
    expect(listener).not.toHaveBeenCalled();
    expect(d.controller.read()).toBe(first);
    d.engine.execute({ type: "updateLayers", ids: [d.layer.id], patch: { fill: "#ff0000" } });
    expect(listener).toHaveBeenCalledOnce();
    expect(d.controller.read().page.layers[0]!.fill).toBe("#ff0000");
    stop();
  });
  test("applies color, background and geometry previews without committing document state", () => {
    const d = fixture();
    const baseline = d.engine.getSnapshot();
    const changed = vi.fn();
    const stop = d.controller.subscribe(changed);
    d.store.set(previewAtom, {
      target: "layer",
      layerId: d.layer.id,
      patch: { fill: "#00ff00", width: 120 },
    });
    expect(d.controller.read().page.layers[0]).toMatchObject({ fill: "#00ff00", width: 120 });
    expect(d.controller.read().presentation?.canonical).toBe(false);
    expect(d.engine.getSnapshot()).toBe(baseline);
    d.store.set(previewAtom, { target: "page", patch: { background: "#123456" } });
    expect(d.controller.read().page.background).toBe("#123456");
    d.store.set(previewAtom, null);
    expect(d.controller.read().page).toBe(baseline.project.pages[0]);
    expect(d.controller.read().presentation?.canonical).toBe(true);
    expect(changed).toHaveBeenCalledTimes(3);
    stop();
    d.store.set(previewAtom, { target: "layer", layerId: d.layer.id, patch: { opacity: 0.5 } });
    expect(changed).toHaveBeenCalledTimes(3);
    const second = d.controller.subscribe(changed);
    expect(d.controller.read().page.layers[0]!.opacity).toBe(0.5);
    second();
  });
  test("supports gesture overlays, draft insertion, document/page switching and shared subscribers", () => {
    const d = fixture();
    const one = vi.fn(),
      two = vi.fn();
    const stopOne = d.controller.subscribe(one),
      stopTwo = d.controller.subscribe(two);
    d.controller.setGesture([]);
    expect(one).not.toHaveBeenCalled();
    d.controller.setGesture([{ layerId: d.layer.id, patch: { x: 50 } }]);
    expect(d.controller.read().page.layers[0]!.x).toBe(50);
    const draft = createLayer("ellipse");
    d.controller.setGesture([], draft);
    expect(d.controller.read().page.layers).toHaveLength(2);
    d.controller.setGesture([]);
    expect(d.controller.read().page.layers).toHaveLength(1);
    stopOne();
    d.engine.setPage(d.engine.getSnapshot().project.pages[1]!.id);
    expect(d.controller.read().page.layers).toEqual([]);
    expect(one).toHaveBeenCalledTimes(3);
    expect(two).toHaveBeenCalledTimes(4);
    stopTwo();
  });
});

test("applies one shared preview patch to multiple layers without mutating the document", () => {
  const d = fixture();
  const added = createLayer("ellipse");
  d.engine.execute({ type: "addLayers", layers: [added] });
  const baseline = d.engine.getSnapshot();
  d.store.set(previewAtom, {
    target: "layers",
    layerIds: [d.layer.id, added.id],
    patch: { opacity: 0.3 },
  });
  expect(d.controller.read().page.layers.map((layer) => layer.opacity)).toEqual([0.3, 0.3]);
  expect(d.engine.getSnapshot()).toBe(baseline);
});
test("labels stable playback frames as transient rather than useful canonical presentation", () => {
  const d = fixture(),
    playback = createPlaybackSource(d.engine),
    snapshot = d.engine.getSnapshot();
  playback.set({ page: snapshot.project.pages[0]!, assets: snapshot.project.assets });
  const frame = d.controller.read();
  expect(d.controller.read()).toBe(frame);
  expect(frame.playback).toBe(true);
  expect(frame.presentation?.canonical).toBe(false);
  playback.set(null);
  expect(d.controller.read().presentation?.canonical).toBe(true);
});
