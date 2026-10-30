import { expect, it, vi } from "vitest";
import { createTimelineCanvasWaveforms } from "../../../../src/components/motion/canvas/waveforms";
import type { TimelineCanvasModel } from "../../../../src/components/motion/canvas/model";
import type { AudioAsset } from "@musart/core";
import { audioFixture } from "../../../support/audio";

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function fixture() {
  const d = audioFixture(3),
    assets = Object.fromEntries(
      [0, 1, 2].map((index) => {
        const asset: AudioAsset = {
          ...d.asset,
          id: `sound-${index}`,
          originalId: `original-${index}`,
        };
        return [asset.id, asset];
      }),
    );
  let model: TimelineCanvasModel = {
    rows: [],
    audioTracks: d
      .page()
      .motion!.audioTracks!.map((track, index) => ({ ...track, assetId: `sound-${index}` })),
    assets,
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
