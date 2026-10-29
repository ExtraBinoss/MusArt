import { expect, test } from "vitest";
import { frameTime } from "@musart/core";
import { createVideoFrameSource } from "../../../src/sources/video/source";
import type {
  DecodedVideoFrame,
  VideoDecodeBackendFactory,
} from "../../../src/sources/video/model";
import { backendFactory, decoded, deferred, FakeFrame, until } from "./fixtures";

function options(factory: ReturnType<typeof backendFactory>["factory"]) {
  return {
    assetId: "original",
    contentRevision: "sha-1",
    original: new Blob(["original bytes"]),
    backendFactory: factory,
  };
}

test("decodes original source time and reuses covered PTS without another decoder", async () => {
  const fake = backendFactory(),
    source = createVideoFrameSource(options(fake.factory));
  const first = await source.requestFrame({ value: 1, rate: 10 });
  expect(first!.timestamp).toEqual({ value: 0, rate: 1000 });
  first!.release();
  const again = await source.requestFrame({ value: 2, rate: 10 });
  expect(again!.requestedTime).toEqual({ value: 1, rate: 5 });
  again!.release();
  expect(fake.reads).toEqual([0.1]);
  expect(source.stats().cacheHits).toBe(1);
  await source.dispose();
  expect(fake.frames.every((frame) => frame.closes === 1)).toBe(true);
  expect(source.stats().accountedFrameBytes).toBe(0);
});

test("latest preview wins through rapid backwards/reversing requests and stale output closes", async () => {
  const gate = deferred<DecodedVideoFrame | null>(),
    staleFrames: FakeFrame[] = [];
  let reads = 0;
  const fake = backendFactory(async (time) =>
    ++reads === 1 ? gate.promise : decoded(staleFrames, Math.floor(time)),
  );
  const source = createVideoFrameSource(options(fake.factory));
  const first = source.requestFrame({ value: 5, rate: 1 });
  const firstResult = first.catch((error: Error) => error);
  await until(() => fake.reads.length === 1);
  const middle = source.requestFrame({ value: 2, rate: 1 });
  const middleResult = middle.catch((error: Error) => error);
  const latest = source.requestFrame({ value: 4, rate: 1 });
  expect(source.stats().pendingPreview).toBeLessThanOrEqual(2);
  expect(await firstResult).toMatchObject({ code: "superseded" });
  expect(await middleResult).toMatchObject({ code: "superseded" });
  gate.resolve(decoded(staleFrames, 5));
  const lease = await latest;
  expect(lease!.timestamp.value / lease!.timestamp.rate).toBe(4);
  lease!.release();
  expect(source.stats().staleDiscards).toBe(1);
  expect(fake.reads).toEqual([5, 4]);
  await source.dispose();
  expect(staleFrames.every((frame) => frame.closes === 1)).toBe(true);
});

test("isolates exact work from preview supersession and bounds exact admission", async () => {
  const pending = [deferred<DecodedVideoFrame | null>(), deferred<DecodedVideoFrame | null>()];
  const frames: FakeFrame[] = [];
  let index = 0;
  const fake = backendFactory(async () => pending[index++]!.promise);
  const source = createVideoFrameSource({
    ...options(fake.factory),
    budgets: { maxPendingExact: 1 },
  });
  const preview = source.requestFrame({ value: 0, rate: 1 });
  const exact = source.requestFrame({ value: 1, rate: 1 }, { mode: "exact" });
  await until(() => fake.reads.length === 2);
  expect(source.stats().openBackends).toBe(2);
  await expect(source.requestFrame({ value: 2, rate: 1 }, { mode: "exact" })).rejects.toMatchObject(
    { code: "busy" },
  );
  pending[0]!.resolve(decoded(frames, 0));
  pending[1]!.resolve(decoded(frames, 1));
  const [a, b] = await Promise.all([preview, exact]);
  a!.release();
  b!.release();
  await source.dispose();
  expect(source.stats().peakOpenBackends).toBeLessThanOrEqual(2);
});

test("returns null before first PTS, in gaps and at exclusive source ends", async () => {
  const frames: FakeFrame[] = [];
  const fake = backendFactory(async (time) => (time < 10 ? null : decoded(frames, 10, 0.25)));
  const source = createVideoFrameSource(options(fake.factory));
  expect(await source.requestFrame({ value: 0, rate: 1 })).toBeNull();
  const valid = await source.requestFrame({ value: 101, rate: 10 });
  expect(valid).not.toBeNull();
  valid!.release();
  expect(await source.requestFrame({ value: 41, rate: 4 })).toBeNull();
  expect(await source.requestFrame({ value: 11, rate: 1 })).toBeNull();
  await source.dispose();
  expect(frames.every((frame) => frame.closes === 1)).toBe(true);
});

test("streams exact source requests in bounded batches and returns the iterator on break", async () => {
  const fake = backendFactory(),
    source = createVideoFrameSource(options(fake.factory));
  const leases = [];
  for await (const lease of source.samples(
    Array.from({ length: 10 }, (_, index) => ({ value: index, rate: 10 })),
  )) {
    leases.push(lease!.requestedTime);
    lease!.release();
  }
  expect(leases).toHaveLength(10);
  expect(fake.batches.map((batch) => batch.length)).toEqual([4, 4, 2]);
  for await (const lease of source.samples([{ value: 0, rate: 1 }])) {
    lease!.release();
    break;
  }
  expect(source.stats().openBackends).toBe(0);
  expect(source.stats().pendingExact).toBe(0);
  await source.dispose();
  expect(fake.frames.every((frame) => frame.closes === 1)).toBe(true);
});

test("abort/dispose reject work and wait for borrowed-frame consumer acknowledgment", async () => {
  const fake = backendFactory(),
    source = createVideoFrameSource(options(fake.factory));
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    source.requestFrame({ value: 0, rate: 1 }, { signal: aborted.signal }),
  ).rejects.toMatchObject({ code: "aborted" });
  const lease = await source.requestFrame({ value: 0, rate: 1 });
  let done = false;
  const disposal = source.dispose().then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(done).toBe(false);
  expect((lease!.frame as unknown as FakeFrame).closed).toBe(false);
  lease!.release();
  await disposal;
  expect(done).toBe(true);
  expect(source.dispose()).toBe(source.dispose());
  expect(() => source.requestFrame({ value: 0, rate: 1 })).toThrow();
});

test("reports native failures and rejects invalid resource settings", async () => {
  expect(() =>
    createVideoFrameSource({
      ...options(backendFactory().factory),
      budgets: { maxCachedFrames: -1 },
    }),
  ).toThrow();
  expect(() =>
    createVideoFrameSource({ ...options(backendFactory().factory), assetId: "" }),
  ).toThrow();
  const fake = backendFactory(async () => {
    throw new Error("native decoder failed");
  });
  const source = createVideoFrameSource(options(fake.factory));
  await expect(source.requestFrame({ value: 0, rate: 1 })).rejects.toMatchObject({
    code: "decodeFailed",
    cause: { message: "native decoder failed" },
  });
  await source.dispose();
  expect(source.stats().openBackends).toBe(0);
});

test("hot backwards cache feedback does not wait for a superseded decode to settle", async () => {
  const frames: FakeFrame[] = [],
    gate = deferred<DecodedVideoFrame | null>();
  const fake = backendFactory(async (time) => (time >= 5 ? gate.promise : decoded(frames)));
  const source = createVideoFrameSource(options(fake.factory));
  (await source.requestFrame({ value: 0, rate: 1 }))!.release();
  const slow = source.requestFrame({ value: 5, rate: 1 }).catch((error: Error) => error);
  await until(() => fake.reads.length === 2);
  const hot = await source.requestFrame({ value: 1, rate: 2 });
  expect(hot!.timestamp.value).toBe(0);
  hot!.release();
  expect(await slow).toMatchObject({ code: "superseded" });
  expect(fake.reads).toEqual([0, 5]);
  gate.resolve(decoded(frames, 5));
  await source.dispose();
  expect(frames.every((frame) => frame.closes === 1)).toBe(true);
});

test("disposal rejects every queued exact request and closes late output before completing", async () => {
  const frames: FakeFrame[] = [],
    gate = deferred<DecodedVideoFrame | null>();
  const fake = backendFactory(async () => gate.promise);
  const source = createVideoFrameSource({
    ...options(fake.factory),
    budgets: { maxPendingExact: 3 },
  });
  const requests = [0, 1, 2].map((value) =>
    source.requestFrame({ value, rate: 1 }, { mode: "exact" }).catch((error: Error) => error),
  );
  await until(() => fake.reads.length === 1);
  let done = false;
  const closing = source.dispose().then(() => {
    done = true;
  });
  expect(await Promise.all(requests)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "closed" }),
      expect.objectContaining({ code: "closed" }),
      expect.objectContaining({ code: "closed" }),
    ]),
  );
  expect(done).toBe(false);
  gate.resolve(decoded(frames));
  await closing;
  expect(frames[0]!.closes).toBe(1);
  expect(source.stats().pendingExact).toBe(0);
});

test("aborted active requests and exact iterators clean their original decoder ownership", async () => {
  const frames: FakeFrame[] = [],
    gate = deferred<DecodedVideoFrame | null>();
  const fake = backendFactory(async () => gate.promise),
    source = createVideoFrameSource(options(fake.factory));
  const signal = new AbortController();
  const request = source
    .requestFrame({ value: 0, rate: 1 }, { signal: signal.signal })
    .catch((error: Error) => error);
  await until(() => fake.reads.length === 1);
  signal.abort();
  expect(await request).toMatchObject({ code: "aborted" });
  gate.resolve(decoded(frames));
  await source.dispose();
  expect(frames[0]!.closes).toBe(1);
  const next = backendFactory(),
    streaming = createVideoFrameSource(options(next.factory)),
    abort = new AbortController();
  const sequence = streaming.samples(
    [
      { value: 0, rate: 1 },
      { value: 1, rate: 1 },
    ],
    { signal: abort.signal },
  );
  const first = await sequence.next();
  abort.abort();
  first.value!.release();
  await expect(sequence.next()).rejects.toMatchObject({ code: "aborted" });
  expect(streaming.stats().openBackends).toBe(0);
  await streaming.dispose();
});

test("captures immutable original/revision options and freezes returned metadata", async () => {
  const fake = backendFactory(),
    blobs: Blob[] = [],
    original = new Blob(["original"]);
  const mutable = {
    ...options((blob, bytes) => {
      blobs.push(blob);
      return fake.factory(blob, bytes);
    }),
    original,
  };
  const source = createVideoFrameSource(mutable);
  mutable.original = new Blob(["replacement"]);
  mutable.contentRevision = "wrong-revision";
  const metadata = await source.metadata();
  expect(Object.isFrozen(metadata.firstTimestamp)).toBe(true);
  const lease = await source.requestFrame({ value: 0, rate: 1 });
  expect(lease!.contentRevision).toBe("sha-1");
  lease!.release();
  expect(blobs.every((blob) => blob === original)).toBe(true);
  await source.dispose();
});

test("decoder admission is explicit when exact and preview cannot share the configured envelope", async () => {
  const frames: FakeFrame[] = [],
    gate = deferred<DecodedVideoFrame | null>();
  const fake = backendFactory(async () => gate.promise);
  const source = createVideoFrameSource({
    ...options(fake.factory),
    budgets: { maxOpenBackends: 1 },
  });
  const preview = source.requestFrame({ value: 0, rate: 1 });
  await until(() => fake.reads.length === 1);
  await expect(source.requestFrame({ value: 1, rate: 1 }, { mode: "exact" })).rejects.toMatchObject(
    { code: "busy" },
  );
  gate.resolve(decoded(frames));
  (await preview)!.release();
  await source.dispose();
});

test("keeps decoder admission/reservations until asynchronous native teardown completes", async () => {
  const close = deferred<void>(),
    frames: FakeFrame[] = [],
    reads: number[] = [];
  let opened = 0;
  const source = createVideoFrameSource(
    options(() => {
      const id = ++opened;
      return {
        metadata: async () => ({
          codec: "avc",
          width: 2,
          height: 2,
          codedWidth: 2,
          codedHeight: 2,
          firstTimestamp: { value: 0, rate: 1 },
          endTimestamp: { value: 10, rate: 1 },
          timeResolution: 1000,
        }),
        read: async (seconds) => {
          reads.push(seconds);
          return decoded(frames, seconds);
        },
        async *batch() {
          yield null;
        },
        dispose: () => (id === 2 ? close.promise : undefined),
      };
    }),
  );
  (await source.requestFrame({ value: 0, rate: 1 }))!.release();
  expect(source.stats().openBackends).toBe(1);
  expect(source.stats().decoderReservationBytes).toBe(64);
  const next = source.requestFrame({ value: 2, rate: 1 });
  await Promise.resolve();
  expect(reads).toEqual([0]);
  close.resolve();
  (await next)!.release();
  await source.dispose();
  expect(reads).toEqual([0, 2]);
  expect(source.stats().openBackends).toBe(0);
});
test("keeps unacknowledged decoder ownership visible when native cleanup fails", async () => {
  const d = backendFactory(),
    source = createVideoFrameSource({
      assetId: "video",
      contentRevision: "revision",
      original: new Blob(),
      backendFactory: (...args) => {
        const backend = d.factory(...args);
        return {
          ...backend,
          dispose: async () => {
            throw Error("native close rejected");
          },
        };
      },
    });
  const frame = await source.requestFrame({ value: 0, rate: 1 });
  frame!.release();
  await expect(source.dispose()).rejects.toThrow("cleanup failed");
  expect(source.stats().openBackends).toBeGreaterThan(0);
  expect(source.stats().decoderReservationBytes).toBeGreaterThan(0);
});

test("preserves rational NTSC boundaries instead of seeking before frame two", async () => {
  const frames: FakeFrame[] = [];
  const fps = { numerator: 30000, denominator: 1001 };
  const reads: number[] = [];
  const factory: VideoDecodeBackendFactory = () => ({
    metadata: async () => ({
      codec: "avc",
      width: 2,
      height: 2,
      codedWidth: 2,
      codedHeight: 2,
      timeResolution: 30000,
      firstTimestamp: frameTime(0, fps),
      endTimestamp: frameTime(4, fps),
    }),
    read: async (seconds) => {
      reads.push(seconds);
      const index = [3, 2, 1, 0].find((index) => (index * 1001) / 30000 <= seconds)!;
      return { ...decoded(frames), timestamp: frameTime(index, fps), duration: frameTime(1, fps) };
    },
    async *batch() {},
    dispose() {},
  });
  const source = createVideoFrameSource({
    assetId: "ntsc",
    contentRevision: "original",
    original: new Blob(),
    backendFactory: factory,
  });
  try {
    for (const index of [2, 1, 3, 0]) {
      const lease = await source.requestFrame(frameTime(index, fps), { mode: "exact" });
      try {
        expect(lease?.timestamp).toEqual(frameTime(index, fps));
      } finally {
        lease?.release();
      }
    }
    expect(reads[0]).toBe(2002 / 30000);
  } finally {
    await source.dispose();
  }
  expect(frames.every((frame) => frame.closes === 1)).toBe(true);
});
