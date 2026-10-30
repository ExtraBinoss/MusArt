import { expect, it, vi } from "vitest";
import { AudioAudition } from "../../../../src/services/motion/audio/audition";
import { sfxWav, synthesizeSfx } from "../../../../src/services/motion/audio/sfx";
import { audioFixture } from "../../../support/audio";
import type { BankAudioCache } from "../../../../src/services/motion/audio/bank/cache";
import type {
  BankOwner,
  BankPlayback,
  BankShapeData,
} from "../../../../src/services/motion/audio/bank/model";
import type { AudioPreparation } from "../../../../src/services/motion/audio/preparation";
const state = vi.hoisted(() => ({ mixer: vi.fn(), read: vi.fn(), dispose: vi.fn() }));
vi.mock("../../../../src/services/motion/audio/mixer-worker-client", () => ({
  createWorkerAudioMixer: state.mixer,
}));
function setup(bank?: BankAudioCache) {
  const d = audioFixture(),
    copy = vi.fn(),
    start = vi.fn(),
    stop = vi.fn(),
    disconnect = vi.fn();
  const gain = {
    gain: { value: 1, setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const context = {
    currentTime: 0,
    state: "running",
    decodeAudioData: vi.fn(),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    destination: {},
    createBuffer: vi.fn(() => ({ copyToChannel: copy })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start,
      stop,
      disconnect,
      onended: null,
    })),
  };
  state.read
    .mockReset()
    .mockImplementation(async (_start: number, count: number) =>
      new Float32Array(count * 2).fill(0.1),
    );
  state.dispose.mockReset().mockResolvedValue(undefined);
  state.mixer.mockReset().mockResolvedValue({
    sampleRate: 48000,
    channels: 2,
    blockFrames: 4096,
    samples: 96000,
    hasAudio: true,
    readBlock: state.read,
    dispose: state.dispose,
  });
  const errors = vi.fn(),
    preparation = {
      sfx: vi.fn(),
      pauseWaveforms: vi.fn(),
      resumeWaveforms: vi.fn(),
    } as unknown as AudioPreparation;
  const audition = new AudioAudition(
    d.engine,
    preparation,
    () => ({ resolveOriginal: async () => new Blob() }),
    errors,
    () => context as unknown as AudioContext,
    undefined,
    bank,
  );
  return { ...d, audition, context, gain, start, stop, disconnect, copy, errors, preparation };
}
it("auditions the real shared processing/gain through a worker without document edits", async () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  const processing = {
    fadeIn: { value: 1, rate: 4 },
    fadeOut: { value: 1, rate: 2 },
    reverb: { mix: 0.3, decay: 0.8 },
  };
  await d.audition.track(d.track().id, processing, 0.5, "fadeOut");
  expect(state.mixer.mock.calls[0]![0]).toMatchObject({
    layers: [],
    audio: [{ media: { processing, volume: 1, mute: false } }],
  });
  expect(d.context.createBuffer).toHaveBeenCalledWith(2, 96000, 48000);
  expect(d.copy).toHaveBeenCalled();
  expect(d.start).toHaveBeenCalledOnce();
  expect(d.gain.gain.value).toBe(0.5);
  d.audition.previewVolume(d.track().id, 0.25);
  expect(d.gain.gain.setTargetAtTime).toHaveBeenCalledWith(0.25, 0, 0.01);
  expect(state.dispose).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot()).toBe(before);
  await d.audition.dispose();
  expect(d.stop).toHaveBeenCalledOnce();
  expect(d.disconnect).toHaveBeenCalledOnce();
  expect(d.context.close).toHaveBeenCalledOnce();
});
it("rejects invalid processing or unavailable clips without a fake successful audition", async () => {
  const d = setup(),
    processing = {
      fadeIn: { value: 0, rate: 1 },
      fadeOut: { value: 0, rate: 1 },
      reverb: { mix: 0, decay: 0.8 },
    };
  await expect(d.audition.track("missing", processing, 1, "gain")).rejects.toThrow(
    "no longer available",
  );
  expect(() =>
    d.audition.track(d.track().id, { ...processing, fadeIn: { value: 10, rate: 1 } }, 1, "fadeIn"),
  ).toThrow("fades");
  expect(state.mixer).not.toHaveBeenCalled();
  await d.audition.dispose();
});

it("rebases committed solo volume/mute without stopping or rebuilding decoded audio", async () => {
  const d = setup(),
    processing = {
      fadeIn: { value: 0, rate: 1 },
      fadeOut: { value: 0, rate: 1 },
      reverb: { mix: 0, decay: 0.8 },
    };
  await d.audition.track(d.track().id, processing, 1, "gain");
  d.audition.previewVolume(d.track().id, 0.3);
  d.audition.commitMix(d.track().id, { volume: 0.3, mute: false });
  d.audition.previewVolume(d.track().id, null);
  expect(d.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.3, 0, 0.01);
  d.audition.commitMix(d.track().id, { volume: 0.3, mute: true });
  expect(d.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.01);
  expect(d.stop).not.toHaveBeenCalled();
  expect(state.mixer).toHaveBeenCalledOnce();
  await d.audition.dispose();
});

it("auditions a bank WAV through the worker mixer with no main-thread decodeAudioData", async () => {
  const d = setup(),
    blob = sfxWav(synthesizeSfx("soft-plop"));
  vi.mocked(d.preparation.sfx).mockResolvedValue(blob);
  await d.audition.enable();
  await d.audition.preset("soft-plop", false);
  expect(state.mixer.mock.calls[0]![0].audio[0].media.assetId).toBe("preview-soft-plop");
  expect(await state.mixer.mock.calls[0]![2].resolveOriginal()).toBe(blob);
  expect(d.context.decodeAudioData).not.toHaveBeenCalled();
  expect(d.start).toHaveBeenCalledOnce();
  await d.audition.dispose();
});
it("retires a pending browser resume immediately and avoids surprise hover playback when sound is blocked", async () => {
  const d = setup();
  d.context.state = "suspended";
  await expect(d.audition.preset("soft-plop", false)).rejects.toMatchObject({
    name: "NotAllowedError",
  });
  expect(state.mixer).not.toHaveBeenCalled();
  d.context.resume.mockImplementationOnce(() => new Promise(() => {}));
  const job = d.audition.preset("soft-plop");
  d.audition.stop();
  await expect(job).rejects.toMatchObject({ name: "AbortError" });
  await d.audition.dispose();
  expect(d.context.close).toHaveBeenCalledOnce();
});

it("keeps another cue's native audition alive and retires only its owner", async () => {
  const d = setup(),
    processing = {
      fadeIn: { value: 0, rate: 1 },
      fadeOut: { value: 0, rate: 1 },
      reverb: { mix: 0, decay: 0.8 },
    };
  await d.audition.track(d.track().id, processing, 1, "gain");
  const signal = state.mixer.mock.calls[0]![3].signal as AbortSignal;
  d.audition.stopTrack("another-cue");
  expect(d.stop).not.toHaveBeenCalled();
  expect(d.gain.disconnect).not.toHaveBeenCalled();
  expect(signal.aborted).toBe(false);
  d.audition.stopTrack(d.track().id);
  expect(d.stop).toHaveBeenCalledOnce();
  expect(d.gain.disconnect).toHaveBeenCalledOnce();
  expect(signal.aborted).toBe(true);
  d.audition.stopTrack(d.track().id);
  await d.audition.dispose();
  expect(d.stop).toHaveBeenCalledOnce();
  expect(d.context.close).toHaveBeenCalledOnce();
});

function cachedBank() {
  const bank = {
    ready: vi.fn(() => true),
    open: vi.fn(async () => []),
    owns: vi.fn(() => true),
    close: vi.fn(() => true),
    closeCurrent: vi.fn(),
    original: vi.fn(),
    buffer: vi.fn(async () => ({ buffer: {} as AudioBuffer, duration: 1 })),
    dispose: vi.fn(),
    client: { atlas: vi.fn() },
  };
  return bank;
}
it("starts cached bank PCM without a decoder worker and exposes the actual native clock with owner/playback tokens", async () => {
  const bank = cachedBank(),
    d = setup(bank as unknown as BankAudioCache),
    a: BankOwner = { kind: "sound-bank", token: Symbol() },
    b: BankOwner = { kind: "sound-bank", token: Symbol() },
    one: BankPlayback = { kind: "bank-playback", token: Symbol() },
    two: BankPlayback = { kind: "bank-playback", token: Symbol() };
  d.context.currentTime = 42;
  d.audition.openBank(a, {} as BankShapeData);
  await d.audition.previewBank(a, one, "soft-plop", true);
  expect(d.start).toHaveBeenLastCalledWith(42);
  expect(state.mixer).not.toHaveBeenCalled();
  expect(d.context.decodeAudioData).not.toHaveBeenCalled();
  d.context.currentTime = 42.4;
  expect(d.audition.readBankClock(a, one)).toMatchObject({
    preset: "soft-plop",
    elapsed: expect.closeTo(0.4),
    duration: 1,
    playing: true,
  });
  d.audition.stopBank(b, one);
  d.audition.stopBank(a, two);
  expect(d.stop).not.toHaveBeenCalled();
  await d.audition.previewBank(b, two, "glass-chime", true);
  expect(d.stop).toHaveBeenCalledOnce();
  bank.owns.mockImplementation((owner?: BankOwner) => owner === b);
  await expect(d.audition.previewBank(a, one, "soft-plop", true)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(d.stop).toHaveBeenCalledOnce();
  d.audition.stopBank(a, one);
  d.audition.stopTrack("soft-plop");
  expect(d.stop).toHaveBeenCalledOnce();
  expect(d.audition.readBankClock(a, one)).toBeNull();
  expect(d.audition.readBankClock(b, two)?.playing).toBe(true);
  const node = d.context.createBufferSource.mock.results.at(-1)!.value;
  node.onended!();
  expect(d.audition.readBankClock(b, two)).toMatchObject({ elapsed: 1, playing: false });
  await d.audition.dispose();
  expect(bank.dispose).toHaveBeenCalledOnce();
});
it("drops a retired bank preparation without stopping the new owner's source", async () => {
  const bank = cachedBank(),
    d = setup(bank as unknown as BankAudioCache),
    a: BankOwner = { kind: "sound-bank", token: Symbol() },
    b: BankOwner = { kind: "sound-bank", token: Symbol() },
    one: BankPlayback = { kind: "bank-playback", token: Symbol() },
    two: BankPlayback = { kind: "bank-playback", token: Symbol() };
  let resolve!: (value: { buffer: AudioBuffer; duration: number }) => void;
  bank.buffer.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const old = d.audition.previewBank(a, one, "soft-plop", true).catch((error) => error);
  await d.audition.previewBank(b, two, "glass-chime", true);
  resolve({ buffer: {} as AudioBuffer, duration: 1 });
  await expect(old).resolves.toMatchObject({ name: "AbortError" });
  expect(d.start).toHaveBeenCalledOnce();
  expect(d.audition.readBankClock(b, two)?.playing).toBe(true);
  await d.audition.dispose();
});
