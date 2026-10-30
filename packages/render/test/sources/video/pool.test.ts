import { expect, test } from "vitest";
import { VideoFramePool } from "../../../src/sources/video/pool";
import { VideoDecodedBudget } from "../../../src/sources/video/budgets";
import type { VideoSourceBudgets } from "../../../src/sources/video/model";
import { decoded, FakeFrame } from "./fixtures";

const limits: VideoSourceBudgets = {
  maxCachedFrames: 1,
  maxDecodedBytes: 256,
  maxFrameBytes: 64,
  maxSourceCacheBytes: 64,
  maxOpenBackends: 2,
  maxPendingExact: 2,
};
const identity = { assetId: "original", contentRevision: "sha-1" };

test("shares one compositor budget across decoder reservations and leases until native consumers release them", async () => {
  const budget = new VideoDecodedBudget(96),
    frames: FakeFrame[] = [];
  const a = new VideoFramePool(identity, limits, budget),
    b = new VideoFramePool(identity, limits, budget);
  const release = a.reserveDecoder(16);
  const first = b.adopt(decoded(frames), { value: 0, rate: 1 }, true);
  expect(budget.stats().bytes).toBe(96);
  expect(() => a.adopt(decoded(frames), { value: 0, rate: 1 }, false)).toThrow("budget");
  expect(frames.at(-1)!.closed).toBe(true);
  await a.close();
  let drained = false;
  const close = b.close().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  expect(budget.stats().bytes).toBe(80);
  first.release();
  await close;
  release();
  expect(budget.stats()).toMatchObject({ bytes: 0, pools: 0, peakBytes: 96, maxBytes: 96 });
});

test("bounds the LRU and keeps borrowed frames alive after cache eviction/close", async () => {
  const frames: FakeFrame[] = [];
  const pool = new VideoFramePool(identity, limits);
  const first = pool.adopt(decoded(frames), { value: 0, rate: 1 }, true);
  const second = pool.adopt(decoded(frames, 1), { value: 1, rate: 1 }, true);
  expect(frames[0]!.closes).toBe(1);
  expect((first.frame as unknown as FakeFrame).closed).toBe(false);
  expect(pool.stats().cachedFrames).toBe(1);
  let drained = false;
  const close = pool.close().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  first.release();
  first.release();
  second.release();
  await close;
  expect(frames.every((frame) => frame.closes === 1)).toBe(true);
  expect(pool.stats().accountedFrameBytes).toBe(0);
});

test("cache hits respect half-open source coverage and clone independent leases", async () => {
  const frames: FakeFrame[] = [],
    pool = new VideoFramePool(identity, limits);
  const first = pool.adopt(decoded(frames), { value: 0, rate: 1 }, true);
  first.release();
  expect(pool.borrow({ value: 1, rate: 1 }, { value: 1, rate: 1 })).toBeNull();
  const hit = pool.borrow({ value: 1, rate: 2 }, { value: 1, rate: 2 })!;
  expect(hit.assetId).toBe("original");
  expect(hit.contentRevision).toBe("sha-1");
  expect(hit.frame).not.toBe(first.frame);
  hit.release();
  await pool.close();
});

test("counts decoder reservations, rejects active pressure and closes rejected frames", async () => {
  const frames: FakeFrame[] = [],
    pool = new VideoFramePool(identity, { ...limits, maxDecodedBytes: 80 });
  const release = pool.reserveDecoder(16);
  const first = pool.adopt(decoded(frames), { value: 0, rate: 1 }, false);
  expect(() => pool.adopt(decoded(frames), { value: 0, rate: 1 }, false)).toThrow();
  expect(frames[1]!.closed).toBe(true);
  first.release();
  release();
  release();
  expect(pool.stats().decoderReservationBytes).toBe(0);
  expect(pool.stats().peakAccountedBytes).toBeLessThanOrEqual(80);
  await pool.close();
});

test("rejects oversized/closed frames and preserves cache if a new borrow cannot fit", async () => {
  const frames: FakeFrame[] = [];
  const tiny = new VideoFramePool(identity, { ...limits, maxFrameBytes: 8 });
  expect(() => tiny.adopt(decoded(frames), { value: 0, rate: 1 }, false)).toThrow();
  const pool = new VideoFramePool(identity, { ...limits, maxDecodedBytes: 32 });
  const first = pool.adopt(decoded(frames), { value: 0, rate: 1 }, true);
  expect(() => pool.borrow({ value: 0, rate: 1 }, { value: 0, rate: 1 })).toThrow();
  expect(pool.stats().cachedFrames).toBe(1);
  first.release();
  await pool.close();
  expect(() => pool.adopt(decoded(frames), { value: 0, rate: 1 }, false)).toThrow();
});
