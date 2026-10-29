import { expect, test, vi } from "vitest";
import { frameTime } from "@musart/core";
import { VideoPlaybackCursor } from "../../../src/sources/video/playback";
import { decoded, deferred, metadata, type FakeFrame } from "./fixtures";
import type {
  DecodedVideoFrame,
  VideoDecodeBackend,
  VideoDecodeBackendFactory,
} from "../../../src/sources/video/model";
function fixture() {
  const frames: FakeFrame[] = [],
    starts: number[] = [];
  let consumed = 0;
  const closed = vi.fn(async () => {});
  const factory: VideoDecodeBackendFactory = () => ({
    metadata: async () => metadata,
    read: async () => null,
    async *batch() {},
    async *stream(start) {
      starts.push(start);
      for (let index = Math.floor(start); index < 1000000; index++) {
        consumed++;
        yield decoded(frames, index);
      }
    },
    dispose: closed,
  });
  const cursor = new VideoPlaybackCursor({
    assetId: "video",
    contentRevision: "revision",
    original: new Blob(),
    backendFactory: factory,
  });
  return { cursor, frames, starts, closed, consumed: () => consumed };
}
test("keeps one presentation-order stream across forward frames with bounded hot-frame reuse", async () => {
  const d = fixture();
  for (const seconds of [0, 0.5, 1, 1.5, 3]) {
    const lease = await d.cursor.requestFrame({ value: seconds * 10, rate: 10 });
    expect(lease!.timestamp.value / lease!.timestamp.rate).toBe(Math.floor(seconds));
    lease!.release();
  }
  expect(d.starts).toEqual([0]);
  expect(d.consumed()).toBe(4);
  expect(d.cursor.stats().cacheHits).toBe(2);
  expect(d.cursor.stats().cachedFrames).toBeLessThanOrEqual(2);
  await d.cursor.dispose();
  expect(d.closed).toHaveBeenCalledOnce();
  expect(d.frames.every((frame) => frame.closed && frame.closes === 1)).toBe(true);
  expect(d.cursor.stats().accountedFrameBytes).toBe(0);
});
test("cancels a long stream without draining it and waits for the borrowed frame acknowledgement", async () => {
  const d = fixture(),
    lease = await d.cursor.requestFrame({ value: 0, rate: 1 });
  let closed = false;
  const disposal = d.cursor.dispose().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(d.consumed()).toBe(1);
  lease!.release();
  await disposal;
  expect(d.consumed()).toBe(1);
});
test("rejects reverse, concurrent and stale native results without leaking decoded frames", async () => {
  const d = fixture(),
    lease = await d.cursor.requestFrame({ value: 2, rate: 1 });
  lease!.release();
  await expect(d.cursor.requestFrame({ value: 1, rate: 1 })).rejects.toMatchObject({
    code: "unsupported",
  });
  await d.cursor.dispose();
  const frames: FakeFrame[] = [],
    gate = deferred<DecodedVideoFrame>(),
    abort = new AbortController();
  const backend: VideoDecodeBackend = {
    metadata: async () => metadata,
    read: async () => null,
    async *batch() {},
    async *stream() {
      yield await gate.promise;
    },
    dispose: vi.fn(async () => {}),
  };
  const cursor = new VideoPlaybackCursor({
    assetId: "v",
    contentRevision: "r",
    original: new Blob(),
    backendFactory: () => backend,
  });
  const pending = cursor.requestFrame({ value: 0, rate: 1 }, { signal: abort.signal });
  await expect(cursor.requestFrame({ value: 1, rate: 1 })).rejects.toMatchObject({ code: "busy" });
  abort.abort();
  gate.resolve(decoded(frames));
  await expect(pending).rejects.toThrow();
  await cursor.dispose();
  expect(frames.every((frame) => frame.closed)).toBe(true);
});
test("does not release native decoder accounting when close acknowledgement fails", async () => {
  const frames: FakeFrame[] = [],
    backend: VideoDecodeBackend = {
      metadata: async () => metadata,
      read: async () => null,
      async *batch() {},
      async *stream() {
        yield decoded(frames);
      },
      dispose: async () => {
        throw Error("native close rejected");
      },
    };
  const cursor = new VideoPlaybackCursor({
    assetId: "v",
    contentRevision: "r",
    original: new Blob(),
    backendFactory: () => backend,
  });
  const frame = await cursor.requestFrame({ value: 0, rate: 1 });
  frame!.release();
  await expect(cursor.dispose()).rejects.toThrow("native close rejected");
  expect(cursor.stats().decoderReservationBytes).toBeGreaterThan(0);
});

test("samples exact NTSC boundaries from one forward iterator without native-time rounding", async () => {
  const frames: FakeFrame[] = [],
    fps = { numerator: 30000, denominator: 1001 };
  const factory: VideoDecodeBackendFactory = () => ({
    metadata: async () => ({ ...metadata, timeResolution: 30000, endTimestamp: frameTime(4, fps) }),
    read: async () => null,
    async *batch() {},
    async *stream() {
      for (let index = 0; index < 4; index++)
        yield { ...decoded(frames), timestamp: frameTime(index, fps), duration: frameTime(1, fps) };
    },
    dispose() {},
  });
  const cursor = new VideoPlaybackCursor({
    assetId: "ntsc",
    contentRevision: "original",
    original: new Blob(),
    backendFactory: factory,
  });
  try {
    for (let index = 0; index < 4; index++) {
      const lease = await cursor.requestFrame(frameTime(index, fps));
      try {
        expect(lease?.timestamp).toEqual(frameTime(index, fps));
      } finally {
        lease?.release();
      }
    }
  } finally {
    await cursor.dispose();
  }
  expect(frames.every((frame) => frame.closes === 1)).toBe(true);
});
