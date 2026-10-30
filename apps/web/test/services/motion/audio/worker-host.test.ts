import { expect, it, vi } from "vitest";
import { handleAudioWorkerJob } from "../../../../src/services/motion/audio/worker-host";
const state = vi.hoisted(() => ({
  peaks: vi.fn(),
  synth: vi.fn(),
  wav: vi.fn(),
  sfxPeaks: vi.fn(),
}));
vi.mock("../../../../src/services/motion/audio/peaks", () => ({
  prepareAudioPeaks: state.peaks,
  prepareSfxPeaks: state.sfxPeaks,
}));
vi.mock("../../../../src/services/motion/audio/sfx", () => ({
  synthesizeSfx: state.synth,
  sfxWav: state.wav,
}));
it("routes original waveform and deterministic SFX jobs without conflating errors with results", async () => {
  const peaks = new Float32Array([0, 1]),
    blob = new Blob(["wav"]);
  state.peaks.mockResolvedValue(peaks);
  state.synth.mockReturnValue(new Float32Array(10));
  state.wav.mockReturnValue(blob);
  state.sfxPeaks.mockReturnValue(peaks);
  const original = new Blob();
  const waveform = { id: 1, type: "waveform" as const, asset: {} as never, original };
  expect(await handleAudioWorkerJob(waveform)).toEqual({ id: 1, peaks });
  expect(await handleAudioWorkerJob({ id: 2, type: "sfx", preset: "soft-plop" })).toEqual({
    id: 2,
    blob,
    peaks,
  });
  state.peaks.mockRejectedValueOnce(Error("bad source"));
  expect(await handleAudioWorkerJob(waveform)).toEqual({ id: 1, error: "bad source" });
});
