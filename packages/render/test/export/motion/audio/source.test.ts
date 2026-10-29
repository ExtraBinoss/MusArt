import { beforeEach, expect, it, vi } from "vitest";
import { openMotionAudioSource } from "../../../../src/export/motion/audio/source";
import { videoAsset } from "../fixtures";
const state = vi.hoisted(() => ({
  tracks: [] as unknown[],
  samples: [] as {
    timestamp: number;
    sampleRate: number;
    numberOfFrames: number;
    numberOfChannels: number;
    copyTo: (target: Float32Array, options: { planeIndex: number }) => void;
    close: () => void;
  }[],
  disposed: vi.fn(),
  windows: [] as [number, number][],
  gate: null as Promise<void> | null,
  cleanupFailure: null as Error | null,
}));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getAudioTracks = async () => state.tracks;
    dispose = state.disposed;
  },
  AudioSampleSink: class {
    async *samples(start: number, end: number) {
      state.windows.push([start, end]);
      if (state.gate) await state.gate;
      for (const sample of state.samples) yield sample;
      if (state.cleanupFailure) throw state.cleanupFailure;
    }
  },
}));
beforeEach(() => {
  state.tracks = [
    {
      getNumberOfChannels: async () => 1,
      getSampleRate: async () => 8000,
      canDecode: async () => true,
    },
  ];
  state.samples = [];
  state.disposed.mockClear();
  state.windows = [];
  state.gate = null;
  state.cleanupFailure = null;
});
const resolver = { resolveOriginal: async () => new Blob(["x"]) };
function sample() {
  return {
    timestamp: 0.5,
    sampleRate: 8000,
    numberOfFrames: 2,
    numberOfChannels: 1,
    copyTo: (target: Float32Array) => {
      target.set([0.25, 0.5]);
    },
    close: vi.fn(),
  };
}

it("decodes bounded original PTS windows to PCM and closes every native sample and source", async () => {
  const native = sample();
  state.samples = [native];
  const source = (await openMotionAudioSource(videoAsset(), resolver))!;
  const chunks = await source.readWindow(0.5, 0.6);
  expect(chunks[0]).toMatchObject({ timestamp: 0.5, sampleRate: 8000, frames: 2 });
  expect([...chunks[0]!.channels[0]!]).toEqual([0.25, 0.5]);
  expect(state.windows[0]).toEqual([0.5 - 1 / 8000, 0.6 + 1 / 8000]);
  expect(native.close).toHaveBeenCalledOnce();
  await source.dispose();
  await source.dispose();
  expect(state.disposed).toHaveBeenCalledOnce();
  await expect(source.readWindow(0, 0.1)).rejects.toMatchObject({ code: "closed" });
});
it("reports actual silence/unsupported layouts and rejects mismatched originals", async () => {
  state.tracks = [];
  expect(await openMotionAudioSource(videoAsset(), resolver)).toBeNull();
  expect(state.disposed).toHaveBeenCalledOnce();
  state.tracks = [{}, {}];
  await expect(openMotionAudioSource(videoAsset(), resolver)).rejects.toMatchObject({
    code: "unsupportedAudio",
  });
  await expect(
    openMotionAudioSource(videoAsset({ byteLength: 2 }), resolver),
  ).rejects.toMatchObject({ code: "missingOriginal" });
});
it("rejects concurrent windows, retires aborted sources and releases rejected PCM samples", async () => {
  const controller = new AbortController();
  const source = (await openMotionAudioSource(videoAsset(), resolver, {
    signal: controller.signal,
  }))!;
  let resolve!: () => void;
  state.gate = new Promise<void>((done) => {
    resolve = done;
  });
  const first = source.readWindow(0, 0.1);
  await expect(source.readWindow(0.1, 0.2)).rejects.toMatchObject({ code: "busy" });
  controller.abort();
  resolve();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  await source.dispose();
  expect(state.disposed).toHaveBeenCalledOnce();
  const clean = (await openMotionAudioSource(videoAsset(), resolver))!;
  const bad = { ...sample(), numberOfFrames: 65537 };
  state.samples = [bad];
  state.gate = null;
  await expect(clean.readWindow(0, 0.1)).rejects.toMatchObject({ code: "unsupportedAudio" });
  expect(bad.close).toHaveBeenCalledOnce();
  await clean.dispose();
});

it("retains both a PCM failure and a failing iterator cleanup", async () => {
  const failure = new Error("PCM copy failed"),
    cleanup = new Error("decoder cleanup failed"),
    native = {
      ...sample(),
      copyTo: () => {
        throw failure;
      },
    };
  state.samples = [native];
  state.cleanupFailure = cleanup;
  const source = (await openMotionAudioSource(videoAsset(), resolver))!;
  await expect(source.readWindow(0, 0.1)).rejects.toMatchObject({ errors: [failure, cleanup] });
  expect(native.close).toHaveBeenCalledOnce();
  await source.dispose();
  expect(state.disposed).toHaveBeenCalledOnce();
});
