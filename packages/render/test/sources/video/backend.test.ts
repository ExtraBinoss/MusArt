import { beforeEach, expect, test, vi } from "vitest";
import {
  createMediabunnyVideoBackend,
  videoMicroseconds,
} from "../../../src/sources/video/backend";
import { FakeFrame } from "./fixtures";

const state = vi.hoisted(() => ({
  track: null as unknown,
  sample: null as unknown,
  samples: [] as unknown[],
  disposed: 0,
  sinks: 0,
  sourceCacheBytes: 0,
}));

vi.mock("mediabunny", () => ({
  ALL_FORMATS: ["mock-format"],
  BlobSource: class {
    constructor(_blob: Blob, options: { maxCacheSize: number }) {
      state.sourceCacheBytes = options.maxCacheSize;
    }
  },
  Input: class {
    getPrimaryVideoTrack() {
      return Promise.resolve(state.track);
    }
    dispose() {
      state.disposed++;
    }
  },
  VideoSampleSink: class {
    constructor() {
      state.sinks++;
    }
    getSample() {
      return Promise.resolve(state.sample);
    }
    async *samplesAtTimestamps(times: readonly number[]) {
      for (const sample of state.samples.length ? state.samples : times.map(() => state.sample))
        yield sample;
    }
  },
}));

function track() {
  return {
    canDecode: async () => true,
    hasHighDynamicRange: async () => false,
    canBeTransparent: async () => false,
    getCodec: async () => "avc",
    getDisplayWidth: async () => 2,
    getDisplayHeight: async () => 2,
    getCodedWidth: async () => 2,
    getCodedHeight: async () => 2,
    getFirstTimestamp: async () => 0.5,
    computeDuration: async () => 2,
    getTimeResolution: async () => 1000,
  };
}

function sample(frames: FakeFrame[]) {
  return {
    timestamp: 0.5,
    duration: 0.25,
    displayWidth: 2,
    displayHeight: 2,
    rotation: 90,
    flip: true,
    pixelAspectRatio: { num: 2, den: 1 },
    close: vi.fn(),
    toVideoFrame: vi.fn(() => new FakeFrame(frames) as unknown as VideoFrame),
  };
}

beforeEach(() => {
  state.track = track();
  state.sample = null;
  state.samples = [];
  state.disposed = 0;
  state.sinks = 0;
});

test("uses bounded Blob reads and preserves native timing/orientation while closing sample wrappers", async () => {
  const frames: FakeFrame[] = [],
    native = sample(frames);
  state.sample = native;
  const backend = createMediabunnyVideoBackend(new Blob(["original"]), 128);
  expect(await backend.metadata()).toMatchObject({
    codec: "avc",
    firstTimestamp: { value: 1, rate: 2 },
    endTimestamp: { value: 2, rate: 1 },
  });
  expect(state.sourceCacheBytes).toBe(128);
  const result = await backend.read(0.6);
  expect(result).toMatchObject({
    timestamp: { value: 1, rate: 2 },
    duration: { value: 1, rate: 4 },
    rotation: 90,
    flip: true,
    pixelAspectRatio: { numerator: 2, denominator: 1 },
  });
  expect(native.close).toHaveBeenCalledOnce();
  expect(frames[0]!.closed).toBe(false);
  result!.frame.close();
  await backend.dispose();
  await backend.dispose();
  expect(state.disposed).toBe(1);
});

test("keeps null samples and bounded exact batches without pixel conversion", async () => {
  const backend = createMediabunnyVideoBackend(new Blob(), 128);
  expect(await backend.read(-1)).toBeNull();
  state.samples = [null, null];
  const output = [];
  for await (const frame of backend.batch([-1, -2])) output.push(frame);
  expect(output).toEqual([null, null]);
  await expect(backend.batch([0, 1, 2, 3, 4]).next()).rejects.toMatchObject({
    code: "budgetExceeded",
  });
  await backend.dispose();
});

test("rejects unsupported video and non-representable timing without leaking converted frames", async () => {
  state.track = null;
  const missing = createMediabunnyVideoBackend(new Blob(), 128);
  await expect(missing.metadata()).rejects.toMatchObject({ code: "unsupported" });
  await missing.dispose();
  state.track = { ...track(), hasHighDynamicRange: async () => true };
  const hdr = createMediabunnyVideoBackend(new Blob(), 128);
  await expect(hdr.metadata()).rejects.toMatchObject({ code: "unsupported" });
  await hdr.dispose();
  state.track = track();
  const frames: FakeFrame[] = [],
    bad = { ...sample(frames), timestamp: Infinity };
  state.sample = bad;
  const timing = createMediabunnyVideoBackend(new Blob(), 128);
  await expect(timing.read(0)).rejects.toMatchObject({ code: "unsupported" });
  expect(bad.close).toHaveBeenCalledOnce();
  expect(bad.toVideoFrame).not.toHaveBeenCalled();
  state.sample = { ...bad, timestamp: 0, duration: 0 };
  await expect(timing.read(0)).rejects.toMatchObject({ code: "unsupported" });
  await timing.dispose();
  expect(videoMicroseconds(1 / 3)).toEqual({ value: 333333, rate: 1000000 });
});

test("disposing a paused batch drains bounded native samples without closing borrowed output", async () => {
  const frames: FakeFrame[] = [],
    samples = [sample(frames), sample(frames), sample(frames)];
  state.samples = samples;
  const backend = createMediabunnyVideoBackend(new Blob(), 128);
  const iterator = backend.batch([0.5, 0.6, 0.7]);
  const first = await iterator.next();
  await backend.dispose();
  expect(samples.every((value) => value.close.mock.calls.length === 1)).toBe(true);
  expect(frames).toHaveLength(1);
  expect(frames[0]!.closed).toBe(false);
  first.value!.frame.close();
  await iterator.return(undefined);
  expect(state.disposed).toBe(1);
});

test("preserves track ticks in decoded samples and metadata at NTSC boundaries", async () => {
  const frames: FakeFrame[] = [];
  state.track = {
    ...track(),
    getTimeResolution: async () => 30000,
    getFirstTimestamp: async () => -1001 / 30000,
    computeDuration: async () => 4004 / 30000,
  };
  state.sample = { ...sample(frames), timestamp: 2002 / 30000, duration: 1001 / 30000 };
  const backend = createMediabunnyVideoBackend(new Blob(), 128);
  expect(await backend.metadata()).toMatchObject({
    firstTimestamp: { value: -1001, rate: 30000 },
    endTimestamp: { value: 1001, rate: 7500 },
    timeResolution: 30000,
  });
  const frame = await backend.read(2002 / 30000);
  expect(frame?.timestamp).toEqual({ value: 1001, rate: 15000 });
  expect(frame?.duration).toEqual({ value: 1001, rate: 30000 });
  frame?.frame.close();
  await backend.dispose();
  expect(frames[0]!.closes).toBe(1);
});

test("rejects alpha video before constructing any sink or merger worker", async () => {
  state.track = { ...track(), canBeTransparent: async () => true };
  const backend = createMediabunnyVideoBackend(new Blob(), 128);
  await expect(backend.metadata()).rejects.toMatchObject({
    name: "VideoSourceError",
    code: "alphaUnsupported",
  });
  expect(state.sinks).toBe(0);
  await backend.dispose();
  expect(state.disposed).toBe(1);
});

test("keeps opaque VP9 available without selecting the transparent-frame SDK path", async () => {
  state.track = { ...track(), getCodec: async () => "vp9" };
  const backend = createMediabunnyVideoBackend(new Blob(), 128);
  expect(await backend.metadata()).toMatchObject({ codec: "vp9" });
  expect(state.sinks).toBe(1);
  await backend.dispose();
  expect(state.disposed).toBe(1);
});
