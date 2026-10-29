import { expect, it, vi } from "vitest";
import { probeVideoOriginal } from "../../../src/sources/video/probe";
const native = vi.hoisted(() => ({ dispose: vi.fn(), audio: true, supported: true, alpha: false }));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose = native.dispose;
    async getPrimaryVideoTrack() {
      return {
        canDecode: async () => native.supported,
        hasHighDynamicRange: async () => false,
        canBeTransparent: async () => native.alpha,
        getDisplayWidth: async () => 960,
        getDisplayHeight: async () => 540,
        getFirstTimestamp: async () => 0.5,
        computeDuration: async () => 5.505,
        getTimeResolution: async () => 30000,
        getRotation: async () => 90,
        getFlip: async () => true,
        getPixelAspectRatio: async () => ({ num: 1, den: 1 }),
      };
    }
    async getPrimaryAudioTrack() {
      return native.audio
        ? {
            canDecode: async () => true,
            getCodec: async () => "aac",
            getSampleRate: async () => 48000,
            getNumberOfChannels: async () => 2,
          }
        : null;
    }
  },
}));
it("probes the exact video presentation interval separately from embedded audio/container duration", async () => {
  native.supported = true;
  native.audio = true;
  const metadata = await probeVideoOriginal(new Blob(["video"]));
  expect(metadata.duration).toEqual({ value: 1001, rate: 200 });
  expect(metadata.firstTimestamp).toEqual({ value: 1, rate: 2 });
  expect(metadata.orientation).toEqual({
    rotation: 90,
    flip: true,
    pixelAspectRatio: { numerator: 1, denominator: 1 },
  });
  expect(metadata.audio).toEqual({ codec: "aac", sampleRate: 48000, channels: 2 });
  expect(native.dispose).toHaveBeenCalled();
  native.audio = false;
  expect((await probeVideoOriginal(new Blob())).audio).toBeNull();
});
it("rejects cancellation/unsupported decoders and closes native inputs", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(probeVideoOriginal(new Blob(), { signal: abort.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  native.supported = false;
  await expect(probeVideoOriginal(new Blob())).rejects.toThrow("decoder");
  expect(native.dispose).toHaveBeenCalled();
  native.supported = true;
});

it("rejects transparent sources during probing without dropping alpha or publishing an original", async () => {
  native.alpha = true;
  try {
    await expect(probeVideoOriginal(new Blob())).rejects.toMatchObject({
      name: "VideoSourceError",
      code: "alphaUnsupported",
    });
  } finally {
    native.alpha = false;
  }
  expect(native.dispose).toHaveBeenCalled();
});
