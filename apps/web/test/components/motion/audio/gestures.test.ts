import { expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine, type AudioAsset } from "@musart/core";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createAudioTrackGestures } from "../../../../src/components/motion/audio/gestures";
import type { TimelineTransport } from "../../../../src/components/motion/model";
function setup() {
  const asset: AudioAsset = {
    id: "sound",
    kind: "audio",
    name: "Sound",
    mime: "audio/wav",
    originalId: "o",
    contentRevision: "r",
    byteLength: 1,
    duration: { value: 2, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 48000,
    sampleRate: 48000,
    channels: 1,
  };
  const engine = new EditorEngine(
    createProject({
      assets: { sound: asset },
      pages: [
        createPage({
          id: "page",
          layers: [],
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: 4, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [],
            audioTracks: [
              {
                id: "clip",
                assetId: "sound",
                name: "Sound",
                start: { value: 1, rate: 1 },
                end: { value: 3, rate: 1 },
                sourceIn: { value: 0, rate: 1 },
                mute: false,
                volume: 1,
              },
            ],
          },
        }),
      ],
    }),
  );
  const viewport = document.createElement("div"),
    wrap = document.createElement("div"),
    button = document.createElement("button");
  viewport.className = "motion-timeline-scroll";
  wrap.className = "motion-track-wrap";
  viewport.append(wrap);
  wrap.append(button);
  document.body.append(viewport);
  const capture = new Set<number>();
  button.setPointerCapture = (id) => {
    capture.add(id);
  };
  button.hasPointerCapture = (id) => capture.has(id);
  button.releasePointerCapture = (id) => {
    capture.delete(id);
  };
  const transport = { pause: vi.fn() } as unknown as TimelineTransport,
    errors = vi.fn();
  const gestures = createAudioTrackGestures(engine, transport, errors);
  const track = () => engine.getSnapshot().project.pages[0]!.motion!.audioTracks![0]!;
  const begin = (kind: "move" | "start" | "end" = "move") =>
    gestures.begin(
      {
        button: 0,
        pointerId: 1,
        currentTarget: button,
        clientX: 10,
        clientY: 5,
        altKey: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as ReactPointerEvent<HTMLElement>,
      track(),
      asset,
      kind,
      100,
    );
  const event = (type: string, x: number, id = 1) =>
    button.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        clientX: x,
        clientY: 5,
        altKey: true,
        bubbles: true,
      }),
    );
  const dispose = () => {
    gestures.cancel();
    viewport.remove();
  };
  return { engine, gestures, errors, track, begin, event, dispose, wrap };
}
it("commits the final release position once with undo and keeps source alignment while moving", () => {
  const d = setup(),
    events = vi.fn();
  d.engine.subscribeCommands(events);
  d.begin();
  d.event("pointermove", 30);
  expect(events).not.toHaveBeenCalled();
  d.event("pointerup", 60);
  expect(events).toHaveBeenCalledOnce();
  expect(d.track().start).toEqual({ value: 3, rate: 2 });
  expect(d.track().sourceIn.value).toBe(0);
  d.engine.undo();
  expect(d.track().start.value).toBe(1);
  d.dispose();
});
it("ignores foreign pointers and cancels on project publication or Escape without an undo record", () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.begin();
  d.event("pointerup", 90, 2);
  expect(d.engine.getSnapshot()).toBe(before);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  d.event("pointerup", 90);
  expect(d.engine.getSnapshot()).toBe(before);
  d.begin();
  d.engine.execute({ type: "renameProject", name: "Changed" });
  const changed = d.engine.getSnapshot();
  d.event("pointerup", 90);
  expect(d.engine.getSnapshot()).toBe(changed);
  expect(d.wrap.dataset.audioDragging).toBeUndefined();
  d.dispose();
});
it("trims source time and rejects stale track objects before capturing a pointer", () => {
  const d = setup();
  d.begin("start");
  d.event("pointerup", 60);
  expect(d.track().sourceIn).toEqual({ value: 1, rate: 2 });
  expect(d.track().start).toEqual({ value: 3, rate: 2 });
  d.begin("end");
  d.event("pointerup", -40);
  expect(d.track().end).toEqual({ value: 5, rate: 2 });
  expect(d.errors).not.toHaveBeenCalled();
  d.dispose();
});
