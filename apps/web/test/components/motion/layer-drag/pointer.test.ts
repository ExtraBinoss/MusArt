import { afterEach, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { createElement, type PointerEvent } from "react";
import { setup } from "../../../support/ui";
import { makeTransport, pointer as sendPointer } from "../support";
import { createTimelineLayerPointer } from "../../../../src/components/motion/layer-drag/pointer";
import { layerDragController } from "../../../../src/components/layers/drag/controller";

const releases: (() => void)[] = [];
afterEach(() => { for (const release of releases.splice(0).reverse()) release(); });
function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.select([d.text.id]);
  const page = d.engine.getSnapshot().project.pages[0]!, track = page.motion!.tracks.find((item) => item.layerId === d.rectangle.id)!;
  const runtime = makeTransport(page), onError = vi.fn();
  const gestures = { cancel: vi.fn(), beginTrackInput: vi.fn(() => true), updatePointer: vi.fn() };
  const adapter = createTimelineLayerPointer({ engine: d.engine, transport: runtime.transport, compositionId: page.id, gestures, run: d.run, onError });
  const view = d.mount(createElement("div", { "data-layer-drag-viewport": "", "data-layer-drag-top-inset": "0" },
    createElement("div", { "data-layer-drop-id": d.rectangle.id, "data-layer-drop-page-id": page.id, "data-layer-drop-kind": "layer" }, createElement("button", { onPointerDown: (event: PointerEvent<HTMLButtonElement>) => adapter.begin(event, track) }, "Source")),
    createElement("div", { "data-layer-drop-id": d.text.id, "data-layer-drop-page-id": page.id, "data-layer-drop-kind": "layer" }, "Target"),
  ));
  const viewport = view.container.firstElementChild as HTMLElement, source = viewport.querySelector("button")!, target = viewport.lastElementChild as HTMLElement;
  Object.defineProperties(viewport, { clientWidth: { value: 500 }, clientHeight: { value: 300 }, scrollWidth: { value: 500 }, scrollHeight: { value: 900 } });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 80, 500, 24));
  const oldHit = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
  const request = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++sequence, callback); return sequence; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  releases.push(() => { adapter.dispose(); view.unmount(); globalThis.requestAnimationFrame = request; globalThis.cancelAnimationFrame = cancel; if (oldHit) Object.defineProperty(document, "elementFromPoint", oldHit); else delete (document as Partial<Document>).elementFromPoint; });
  const send = (type: string, x: number, y = 40) => act(() => sendPointer(source, type, x, y));
  const tick = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(0); });
  return { ...d, page, track, runtime, onError, gestures, adapter, source, target, send, tick, frames, controller: layerDragController(d.engine) };
}

it("locks a dominant horizontal gesture once and hands neutral original coordinates/selection to timing", () => {
  const d = fixture();
  d.send("pointerdown", 100);
  const afterDown = d.engine.getSnapshot();
  expect(afterDown.selection).toEqual([d.rectangle.id]);
  d.send("pointermove", 103, 42);
  expect(d.gestures.beginTrackInput).not.toHaveBeenCalled();
  d.send("pointermove", 140, 43);
  expect(d.gestures.beginTrackInput).toHaveBeenCalledExactlyOnceWith({ node: d.source, pointerId: 7, clientX: 100, clientY: 40, button: 0, shiftKey: false, originalLayers: [d.text.id] }, d.track, "move");
  expect(d.gestures.updatePointer).toHaveBeenCalledExactlyOnceWith({ pointerId: 7, clientX: 140, clientY: 43, shiftKey: false });
  expect(d.controller.read()).toBeNull();
  expect(d.engine.getSnapshot()).toBe(afterDown);
  d.send("pointermove", 142, 120);
  expect(d.gestures.beginTrackInput).toHaveBeenCalledOnce();
});

it("uses the shared vertical controller, never retimes tracks, and commits a single undoable reorder", () => {
  const d = fixture(), before = d.engine.getSnapshot();
  d.send("pointerdown", 100);
  d.send("pointermove", 101, 85); d.tick();
  const projected = d.controller.read();
  expect(projected?.target?.id).toBe(d.text.id);
  expect(d.gestures.beginTrackInput).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(document.querySelector(".layer-drag-preview")).not.toBeNull();
  for (let x = 102; x < 130; x++) d.send("pointermove", x, 85);
  expect(d.frames.size).toBe(1);
  d.tick();
  expect(d.controller.read()).toBe(projected);
  d.send("pointerup", 129, 85);
  const after = d.engine.getSnapshot();
  expect(after.revision).toBe(before.revision + 1);
  expect(after.project.pages[0]!.layers.map((layer) => layer.id)).toEqual([d.text.id, d.rectangle.id, d.image.id]);
  expect(after.project.pages[0]!.motion).toEqual(before.project.pages[0]!.motion);
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  expect(d.frames.size).toBe(0);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
});

it("restores selection/ghost/history on cancellation and leaves later authoritative selection intact", () => {
  const d = fixture(), before = d.engine.getSnapshot();
  d.send("pointerdown", 100); d.send("pointermove", 101, 85); d.tick();
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(d.engine.getSnapshot().selection).toEqual([d.text.id]);
  expect(d.controller.read()).toBeNull();
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
  d.send("pointerdown", 100);
  d.engine.select([d.image.id]);
  d.adapter.cancel();
  expect(d.engine.getSnapshot().selection).toEqual([d.image.id]);
});

it("rejects old tracks after same-ID load or a range edit before React catches up", () => {
  const d = fixture();
  d.engine.load(d.engine.getSnapshot().project);
  const loaded = d.engine.getSnapshot();
  d.send("pointerdown", 100);
  expect(d.onError).toHaveBeenCalledWith("changed");
  expect(d.engine.getSnapshot()).toBe(loaded);
  expect(d.runtime.transport.pause).not.toHaveBeenCalled();
  expect(d.controller.read()).toBeNull();
  const e = fixture();
  e.engine.execute({ type: "setMotionTrackRange", trackId: e.track.id, start: { value: 0, rate: 1 }, end: { value: 1, rate: 1 } });
  const ranged = e.engine.getSnapshot();
  e.send("pointerdown", 100);
  expect(e.onError).toHaveBeenCalledWith("changed");
  expect(e.engine.getSnapshot()).toBe(ranged);
});

it("cancels active ownership after document edits, and rejected timing handoffs restore the original selection", () => {
  const d = fixture();
  d.send("pointerdown", 100); d.send("pointermove", 101, 85); d.tick();
  d.engine.execute({ type: "renameProject", name: "Concurrent edit" });
  const edited = d.engine.getSnapshot();
  d.send("pointerup", 101, 85);
  expect(d.controller.read()).toBeNull();
  expect(d.engine.getSnapshot()).toBe(edited);
  const e = fixture();
  e.gestures.beginTrackInput.mockReturnValue(false);
  e.send("pointerdown", 100); e.send("pointermove", 140);
  expect(e.engine.getSnapshot().selection).toEqual([e.text.id]);
  expect(e.gestures.updatePointer).not.toHaveBeenCalled();
});
