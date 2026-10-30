import { beforeEach, expect, it, vi } from "vitest";
import { probeAudioOriginal } from "../../../src/sources/audio/probe";
const state = vi.hoisted(() => ({
  dispose: vi.fn(),
  count: 1,
  supported: true,
  channels: 2,
  sampleRate: 48000,
  end: 4.5,
}));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose = state.dispose;
    async getAudioTracks() {
      return Array.from({ length: state.count }, () => ({
        canDecode: async () => state.supported,
        getFirstTimestamp: async () => 0.5,
        computeDuration: async () => state.end,
        getTimeResolution: async () => 48000,
        getSampleRate: async () => state.sampleRate,
        getNumberOfChannels: async () => state.channels,
      }));
    }
  },
}));
beforeEach(() => {
  state.dispose.mockClear();
  Object.assign(state, { count: 1, supported: true, channels: 2, sampleRate: 48000, end: 4.5 });
});
it("reads rational playable audio duration without decoding PCM", async () => {
  expect(await probeAudioOriginal(new Blob(["audio"]))).toEqual({
    firstTimestamp: { value: 1, rate: 2 },
    duration: { value: 4, rate: 1 },
    timeResolution: 48000,
    channels: 2,
    sampleRate: 48000,
  });
  expect(state.dispose).toHaveBeenCalledOnce();
});
it("rejects absent/alternate tracks, invalid channels and unsupported decoders and always closes", async () => {
  for (const patch of [
    { count: 0 },
    { count: 2 },
    { supported: false },
    { channels: 6 },
    { sampleRate: 7999 },
    { end: 0.5 },
  ]) {
    Object.assign(
      state,
      { count: 1, supported: true, channels: 2, sampleRate: 48000, end: 4.5 },
      patch,
    );
    await expect(probeAudioOriginal(new Blob())).rejects.toThrow();
  }
  expect(state.dispose).toHaveBeenCalledTimes(6);
  const controller = new AbortController();
  controller.abort();
  await expect(probeAudioOriginal(new Blob(), { signal: controller.signal })).rejects.toMatchObject(
    { name: "AbortError" },
  );
});
