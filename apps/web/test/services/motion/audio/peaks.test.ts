import { expect, it, vi } from "vitest";
import {
  accumulatePeaks,
  prepareAudioPeaks,
  prepareSfxPeaks,
  WAVEFORM_BINS,
} from "../../../../src/services/motion/audio/peaks";
import type { AudioAsset } from "@musart/core";
const source = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), dispose: vi.fn() }));
vi.mock("@musart/render/audio", () => ({ openMotionAudioSource: source.open }));
const asset: AudioAsset = {
  id: "sound",
  kind: "audio",
  name: "Sound",
  mime: "audio/wav",
  originalId: "o",
  contentRevision: "r",
  byteLength: 1,
  duration: { value: 1, rate: 1 },
  firstTimestamp: { value: 1, rate: 2 },
  timeResolution: 48000,
  sampleRate: 48000,
  channels: 1,
};
it("reduces both channels into bounded absolute peaks using original PTS", () => {
  const peaks = new Float32Array(4);
  accumulatePeaks(
    peaks,
    [
      {
        timestamp: 0.25,
        sampleRate: 4,
        frames: 6,
        channels: [
          new Float32Array([1, -0.4, 0.7, -0.2, 0.9, 1]),
          new Float32Array([1, 0.5, 0.1, 0.6, 0.2, 1]),
        ],
      },
    ],
    0.5,
    1,
  );
  expect([...peaks]).toEqual([0.5, expect.closeTo(0.7), expect.closeTo(0.6), expect.closeTo(0.9)]);
});
it("prepares <=half-second decode windows and releases the source on success and error", async () => {
  source.read.mockReset().mockResolvedValue([]);
  source.dispose.mockReset().mockResolvedValue(undefined);
  source.open.mockResolvedValue({ readWindow: source.read, dispose: source.dispose });
  expect((await prepareAudioPeaks(asset, new Blob())).length).toBe(WAVEFORM_BINS);
  expect(source.read.mock.calls.map((call) => call.slice(0, 2))).toEqual([
    [0.5, 1],
    [1, 1.5],
  ]);
  expect(source.dispose).toHaveBeenCalledOnce();
  source.read.mockRejectedValueOnce(Error("decoder failure"));
  await expect(prepareAudioPeaks(asset, new Blob())).rejects.toThrow("decoder failure");
  expect(source.dispose).toHaveBeenCalledTimes(2);
});

it("prepares a bounded genuine procedural envelope beside its original WAV", () => {
  const samples = new Float32Array(48000);
  samples[0] = -0.5;
  samples[47999] = 0.9;
  const peaks = prepareSfxPeaks(samples);
  expect(peaks).toHaveLength(512);
  expect(peaks[0]).toBe(0.5);
  expect(peaks.at(-1)).toBeCloseTo(0.9);
  expect(prepareSfxPeaks(new Float32Array())).toHaveLength(0);
});
