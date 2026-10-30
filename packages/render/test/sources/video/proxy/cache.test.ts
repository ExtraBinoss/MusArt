import { expect, it, vi } from "vitest";
import type { VideoAsset } from "@musart/core";
import { VideoProxyCache } from "../../../../src/sources/video/proxy/cache";
import type { VideoProxyReply } from "../../../../src/sources/video/proxy/model";
const asset: VideoAsset = {
  id: "movie",
  kind: "video",
  name: "Movie",
  mime: "video/mp4",
  originalId: "original",
  contentRevision: "v1",
  byteLength: 1,
  width: 1920,
  height: 1080,
  duration: { value: 3, rate: 1 },
  firstTimestamp: { value: 0, rate: 1 },
  timeResolution: 30,
  orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
};
function fixture() {
  let allowed = false;
  const listeners = new Set<() => void>();
  const ready = vi.fn();
  const workers: {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: ((event: MessageEvent<VideoProxyReply>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
  }[] = [];
  const cache = new VideoProxyCache(() => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    workers.push(worker);
    return worker as unknown as Worker;
  });
  const activity = {
    read: () => allowed,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    ready,
  };
  cache.configure(true, activity);
  const set = (value: boolean) => {
    allowed = value;
    for (const fn of listeners) fn();
  };
  return { cache, workers, ready, listeners, set, activity };
}
it("pauses and resumes the same conversion at idle, without dropping its encoded progress", () => {
  const d = fixture(),
    original = new Blob(["v"]);
  d.cache.read(asset, original);
  expect(d.workers).toHaveLength(0);
  d.set(true);
  const worker = d.workers[0]!,
    job = worker.postMessage.mock.calls[0]![0];
  d.set(false);
  d.set(false);
  expect(worker.postMessage.mock.calls).toHaveLength(2);
  expect(worker.postMessage.mock.calls[1]![0]).toEqual({ type: "pause", id: job.id });
  worker.onmessage!({ data: { id: job.id, state: "paused" } } as MessageEvent<VideoProxyReply>);
  expect(d.cache.stats()).toMatchObject({ paused: true, preparing: false });
  d.set(true);
  expect(worker.postMessage.mock.calls[2]![0]).toEqual({ type: "resume", id: job.id });
  const proxy = { asset: { ...asset, width: 960, height: 540 }, original: new Blob(["proxy"]) };
  worker.onmessage!({ data: { id: job.id, proxy } } as MessageEvent<VideoProxyReply>);
  expect(d.ready).toHaveBeenCalledOnce();
  d.set(false);
  expect(d.cache.read(asset, original)).toBe(proxy);
  expect(d.workers).toHaveLength(1);
  expect(worker.terminate).not.toHaveBeenCalled();
  d.cache.dispose();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(d.listeners.size).toBe(0);
  expect(d.cache.stats()).toMatchObject({ ready: 0, bytes: 0, preparing: false });
});
it("invalidates old profile results and forwards the configurable native conversion policy", () => {
  const d = fixture(),
    original = new Blob(["v"]);
  d.set(true);
  d.cache.read(asset, original);
  const worker = d.workers[0]!,
    old = worker.onmessage!,
    id = worker.postMessage.mock.calls[0]![0].id;
  d.cache.configure(true, { ...d.activity, profile: { maxEdge: 640, bitrate: 800000 } });
  expect(worker.terminate).toHaveBeenCalledOnce();
  old({ data: { id, error: "stale" } } as MessageEvent<VideoProxyReply>);
  expect(d.cache.stats().failures).toEqual([]);
  d.cache.read(asset, original);
  expect(d.workers[1]!.postMessage.mock.calls[0]![0].profile).toMatchObject({
    maxEdge: 640,
    bitrate: 800000,
  });
  expect(() => d.cache.configure(true, { ...d.activity, profile: { maxEntries: 9 } })).toThrow(
    RangeError,
  );
  d.cache.dispose();
});
it("retires removed originals, ignores late results and records real conversion errors without a retry loop", () => {
  const d = fixture();
  d.set(true);
  d.cache.read(asset, new Blob(["v"]));
  const worker = d.workers[0]!,
    old = worker.onmessage!,
    job = worker.postMessage.mock.calls[0]![0];
  d.cache.retain(new Set());
  old({ data: { id: job.id, error: "old project" } } as MessageEvent<VideoProxyReply>);
  expect(d.cache.stats().failures).toEqual([]);
  d.cache.read(asset, new Blob(["v"]));
  const next = d.workers[1]!,
    id = next.postMessage.mock.calls[0]![0].id;
  next.onmessage!({
    data: { id, error: "native codec unavailable" },
  } as MessageEvent<VideoProxyReply>);
  expect(d.cache.stats().failures).toEqual(["native codec unavailable"]);
  d.cache.read(asset, new Blob(["v"]));
  expect(d.workers).toHaveLength(2);
  d.cache.dispose();
});
it("bounds admission and ready bytes, and does not requeue evicted results forever", () => {
  const d = fixture();
  for (let index = 0; index < 10; index++)
    d.cache.read({ ...asset, originalId: `original-${index}` }, new Blob(["v"]));
  expect(d.cache.stats().queued).toBe(8);
  d.set(true);
  for (let index = 0; index < 8; index++) {
    const worker = d.workers.at(-1)!,
      id = worker.postMessage.mock.calls.at(-1)![0].id;
    worker.onmessage!({
      data: { id, proxy: { asset, original: new Blob([new Uint8Array(16 * 1024 * 1024)]) } },
    } as MessageEvent<VideoProxyReply>);
  }
  expect(d.cache.stats()).toMatchObject({
    ready: 4,
    bytes: 64 * 1024 * 1024,
    queued: 0,
    preparing: false,
  });
  d.cache.read({ ...asset, originalId: "original-0" }, new Blob(["v"]));
  expect(d.workers).toHaveLength(1);
  d.cache.dispose();
});
