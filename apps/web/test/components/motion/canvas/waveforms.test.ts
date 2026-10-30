import { expect, it, vi } from "vitest";
import { createTimelineCanvasWaveforms } from "../../../../src/components/motion/canvas/waveforms";
import type { TimelineCanvasModel } from "../../../../src/components/motion/canvas/model";
import { createLayer, type AudioAsset } from "@musart/core";
import { audioFixture } from "../../../support/audio";

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function fixture(count = 3) {
  const d = audioFixture(count),
    assets = Object.fromEntries(
      Array.from({ length: count }, (_, index) => {
        const asset: AudioAsset = {
          ...d.asset,
          id: `sound-${index}`,
          originalId: `original-${index}`,
        };
        return [asset.id, asset];
      }),
    );
  const original = d.engine.getSnapshot().project;
  d.engine.load({
    ...original,
    assets,
    pages: original.pages.map((page) => ({
      ...page,
      motion: page.motion
        ? {
            ...page.motion,
            audioTracks: page.motion.audioTracks!.map((track, index) => ({
              ...track,
              assetId: `sound-${index}`,
            })),
          }
        : undefined,
    })),
  });
  let model: TimelineCanvasModel = {
    rows: [],
    audioTracks: d
      .page()
      .motion!.audioTracks!.map((track, index) => ({ ...track, assetId: `sound-${index}` })),
    assets: d.engine.getSnapshot().project.assets,
    selectedLayerIds: new Set(),
    selectedKeyIds: new Set(),
    scale: 120,
    duration: 3,
    rowHeight: 24,
    gutter: 244,
  };
  const pending: { resolve(peaks: Float32Array): void; reject(error: unknown): void }[] = [],
    prepare = vi.fn(
      (_asset: AudioAsset) =>
        new Promise<Float32Array>((resolve, reject) => pending.push({ resolve, reject })),
    ),
    publish = vi.fn(),
    onError = vi.fn(),
    controller = createTimelineCanvasWaveforms({
      engine: d.engine,
      prepare,
      publish,
      onError,
      readModel: () => model,
    });
  return {
    ...d,
    controller,
    prepare,
    publish,
    onError,
    pending,
    read: () => model,
    set: (next: TimelineCanvasModel) => {
      model = next;
    },
  };
}
it("prepares only intersecting visible tracks serially and discards work retired by a rapid vertical jump", async () => {
  const d = fixture();
  d.controller.update(0, 24, 0, 240);
  expect(d.prepare).toHaveBeenCalledOnce();
  expect(d.prepare.mock.calls[0]![0].id).toBe("sound-0");
  d.controller.update(48, 24, 0, 240);
  expect(d.prepare).toHaveBeenCalledOnce();
  d.pending[0]!.resolve(new Float32Array([0, 0.5, 0]));
  await settle();
  expect(d.publish).not.toHaveBeenCalled();
  expect(d.prepare).toHaveBeenCalledTimes(2);
  expect(d.prepare.mock.calls[1]![0].id).toBe("sound-2");
  d.pending[1]!.resolve(new Float32Array([0, 0.8, 0]));
  await settle();
  expect(d.publish).toHaveBeenLastCalledWith(new Map([["audio-2", [0, expect.closeTo(0.8), 0]]]));
  d.controller.update(48, 24, 400, 200);
  expect(d.publish).toHaveBeenLastCalledWith(new Map());
  expect(d.prepare).toHaveBeenCalledTimes(2);
  d.controller.dispose();
});
it("deduplicates one immutable original across visible clips and does not publish identical maps on fractional scrolling", async () => {
  const d = fixture(),
    base = d.read();
  d.set({
    ...base,
    audioTracks: base.audioTracks.map((track) => ({ ...track, assetId: "sound-0" })),
  });
  d.controller.update(0, 72, 0, 240);
  d.pending[0]!.resolve(new Float32Array([0, 0.5, 0]));
  await settle();
  expect(d.prepare).toHaveBeenCalledOnce();
  const map = d.publish.mock.calls.at(-1)![0] as ReadonlyMap<string, readonly number[]>;
  expect(map.size).toBe(3);
  expect(map.get("audio-0")).toBe(map.get("audio-1"));
  const count = d.publish.mock.calls.length;
  d.controller.update(0.5, 71, 0.5, 239);
  expect(d.publish).toHaveBeenCalledTimes(count);
  d.controller.dispose();
});
it("rejects stale project results and errors, then respects disposal without global cancellation", async () => {
  const d = fixture();
  d.controller.update(0, 24, 0, 240);
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  d.pending[0]!.reject(Error("Old project unavailable"));
  await settle();
  expect(d.onError).not.toHaveBeenCalled();
  expect(d.prepare).toHaveBeenCalledTimes(2);
  d.controller.dispose();
  d.pending[1]!.resolve(new Float32Array([1]));
  await settle();
  d.controller.update(0, 24, 0, 240);
  expect(d.publish).not.toHaveBeenCalled();
  expect(d.prepare).toHaveBeenCalledTimes(2);
});
it("reports a real current failure once, retries only after retirement, and ignores cancellation", async () => {
  const d = fixture();
  d.controller.update(0, 24, 0, 240);
  d.pending[0]!.reject(Error("Real original read failed"));
  await settle();
  expect(d.onError).toHaveBeenCalledOnce();
  d.controller.update(0, 24, 0, 240);
  expect(d.prepare).toHaveBeenCalledOnce();
  d.controller.update(0, 0, 0, 240);
  d.controller.update(0, 24, 0, 240);
  d.pending[1]!.reject(new DOMException("Retired", "AbortError"));
  await settle();
  expect(d.onError).toHaveBeenCalledOnce();
  expect(d.prepare).toHaveBeenCalledTimes(2);
  d.controller.dispose();
});
it("defers aborted Play work until Pause, retaining prepared peaks and never spinning on repeated aborts", async () => {
  const d = fixture();
  d.controller.update(0, 24, 0, 240);
  d.controller.setPaused(true);
  d.pending[0]!.reject(new DOMException("Play interrupted preparation", "AbortError"));
  await settle();
  d.controller.update(0, 24, 0, 240);
  d.controller.setPaused(true);
  expect(d.prepare).toHaveBeenCalledOnce();
  d.controller.setPaused(false);
  expect(d.prepare).toHaveBeenCalledTimes(2);
  d.pending[1]!.resolve(new Float32Array([0, 0.5, 0]));
  await settle();
  const last = d.publish.mock.calls.at(-1)![0];
  d.controller.setPaused(true);
  d.controller.update(0, 48, 0, 240);
  expect(d.prepare).toHaveBeenCalledTimes(2);
  expect(d.publish).toHaveBeenLastCalledWith(last);
  d.controller.setPaused(false);
  expect(d.prepare).toHaveBeenCalledTimes(3);
  d.pending[2]!.reject(new DOMException("Temporarily canceled", "AbortError"));
  await settle();
  d.controller.update(0, 48, 0, 240);
  expect(d.prepare).toHaveBeenCalledTimes(3);
  expect(d.onError).not.toHaveBeenCalled();
  d.controller.dispose();
});
it("allows one fresh retry if the old cancellation arrives after Pause has already resumed", async () => {
  const d = fixture();
  d.controller.update(0, 24, 0, 240);
  d.controller.setPaused(true);
  d.controller.setPaused(false);
  d.pending[0]!.reject(new DOMException("Late old cancellation", "AbortError"));
  await settle();
  expect(d.prepare).toHaveBeenCalledTimes(2);
  d.pending[1]!.reject(new DOMException("Still unavailable", "AbortError"));
  await settle();
  expect(d.prepare).toHaveBeenCalledTimes(2);
  expect(d.onError).not.toHaveBeenCalled();
  d.controller.dispose();
});
it("retains immutable ready peaks across viewport exits and backscroll without another conversion or request", async () => {
  const d = fixture();
  d.controller.update(0, 24, 0, 240);
  d.pending[0]!.resolve(new Float32Array([0, 0.5, 0]));
  await settle();
  const first = d.publish.mock.calls.at(-1)![0].get("audio-0");
  d.controller.update(48, 24, 0, 240);
  d.pending[1]!.resolve(new Float32Array([0, 0.8, 0]));
  await settle();
  d.controller.update(0, 24, 0, 240);
  expect(d.prepare).toHaveBeenCalledTimes(2);
  expect(d.publish.mock.calls.at(-1)![0].get("audio-0")).toBe(first);
  expect(Object.isFrozen(first)).toBe(true);
  d.controller.setPaused(true);
  d.controller.update(0, 24, 0, 240);
  expect(d.publish.mock.calls.at(-1)![0].get("audio-0")).toBe(first);
  expect(d.prepare).toHaveBeenCalledTimes(2);
  d.controller.dispose();
});
it("enforces the ready-envelope memory budget and never publishes data for a departed original", async () => {
  const d = fixture();
  d.controller.update(0, 24, 0, 240);
  d.pending[0]!.resolve(new Float32Array(131073));
  await settle();
  expect(d.onError).toHaveBeenCalledOnce();
  expect(d.publish).not.toHaveBeenCalled();
  const project = d.engine.getSnapshot().project;
  const old = project.assets["sound-0"];
  if (old?.kind !== "audio") throw Error("Missing audio fixture original");
  d.engine.load({
    ...project,
    assets: { ...project.assets, "sound-0": { ...old, contentRevision: "replaced" } },
  });
  d.controller.update(0, 24, 0, 240);
  expect(d.prepare).toHaveBeenCalledOnce();
  d.controller.dispose();
});
it("bounds retained identities to 64 and reuses recent backscroll references before evicting the oldest", async () => {
  const d = fixture(65);
  let recent: readonly number[] | undefined;
  for (let index = 0; index < 65; index++) {
    d.controller.update(index * 24, 24, 0, 240);
    d.pending[index]!.resolve(new Float32Array([0, 0.5, 0]));
    await settle();
    if (index === 1) recent = d.publish.mock.calls.at(-1)![0].get("audio-1");
  }
  expect(d.prepare).toHaveBeenCalledTimes(65);
  d.controller.update(24, 24, 0, 240);
  expect(d.prepare).toHaveBeenCalledTimes(65);
  expect(d.publish.mock.calls.at(-1)![0].get("audio-1")).toBe(recent);
  d.controller.update(0, 24, 0, 240);
  expect(d.prepare).toHaveBeenCalledTimes(66);
  d.controller.dispose();
  d.pending[65]!.resolve(new Float32Array([0]));
  await settle();
});

it("publishes cached originals during a scroll pause without starting another worker", () => {
  const d = fixture();
  d.controller.dispose();
  const publish = vi.fn(),
    prepare = vi.fn();
  const peaks = new Float32Array([0.2, 0.8]);
  const manager = createTimelineCanvasWaveforms({
    engine: d.engine,
    prepare,
    cached: () => peaks,
    readModel: d.read,
    publish,
    onError: vi.fn(),
  });
  manager.setPaused(true);
  manager.update(0, 24, 0, 300);
  expect(prepare).not.toHaveBeenCalled();
  expect(publish).toHaveBeenCalledOnce();
  expect([...publish.mock.calls[0]![0].values()][0]).toEqual([
    expect.closeTo(0.2),
    expect.closeTo(0.8),
  ]);
  manager.dispose();
});

it("prepares a bounded lookahead before adjacent audio rows enter the viewport", () => {
  const d = fixture();
  d.controller.dispose();
  d.set({
    ...d.read(),
    rows: [
      {
        kind: "layer",
        key: "visual",
        layer: createLayer("rectangle"),
        depth: 0,
        expandable: false,
        expanded: false,
      },
    ],
  });
  const prepare = vi.fn(() => new Promise<Float32Array>(() => {}));
  const manager = createTimelineCanvasWaveforms({
    engine: d.engine,
    prepare,
    overscan: 2,
    readModel: d.read,
    publish: vi.fn(),
    onError: vi.fn(),
  });
  manager.update(0, 24, 0, 300);
  expect(prepare).toHaveBeenCalledOnce();
  manager.dispose();
});
