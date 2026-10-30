import { expect, it, vi } from "vitest";
import { createAudioMixerWorkerHost } from "../../../../src/services/motion/audio/mixer-worker-host";
import type { AudioMixerReply } from "../../../../src/services/motion/audio/mixer-worker-model";
const state = vi.hoisted(() => ({ mixer: vi.fn(), read: vi.fn(), dispose: vi.fn() }));
vi.mock("@musart/render/audio", () => ({ createMotionAudioMixer: state.mixer }));
it("resolves originals through the lazy platform port, transfers PCM and explicitly disposes the mixer", async () => {
  const sends: AudioMixerReply[] = [],
    send = vi.fn((reply: AudioMixerReply) => {
      sends.push(reply);
    });
  const host = createAudioMixerWorkerHost(send),
    pcm = new Float32Array(8);
  state.read.mockResolvedValue(pcm);
  state.dispose.mockResolvedValue(undefined);
  state.mixer.mockImplementationOnce(async (_plan, _assets, resolver) => {
    await resolver.resolveOriginal({ id: "sound" }, {});
    return {
      sampleRate: 48000,
      channels: 2,
      blockFrames: 4096,
      samples: 96000,
      hasAudio: true,
      readBlock: state.read,
      dispose: state.dispose,
    };
  });
  const init = host.receive({
    type: "init",
    id: 1,
    plan: { mode: "motion", duration: { value: 2, rate: 1 }, layers: [], audio: [] },
    assets: {},
    options: {},
  });
  await Promise.resolve();
  const request = sends.find((reply) => reply.type === "original")!;
  expect(request).toMatchObject({ type: "original", assetId: "sound" });
  await host.receive({ type: "original", id: request.id, blob: new Blob(["x"]) });
  await init;
  expect(sends).toContainEqual(expect.objectContaining({ type: "ready", id: 1 }));
  await host.receive({ type: "read", id: 2, start: 0, count: 4 });
  expect(send).toHaveBeenCalledWith({ type: "pcm", id: 2, pcm }, [pcm.buffer]);
  await host.receive({ type: "close", id: 3 });
  expect(state.dispose).toHaveBeenCalledOnce();
  expect(sends.at(-1)).toEqual({ type: "closed", id: 3 });
});
it("reports real initialization failures and rejects reads before initialization", async () => {
  const send = vi.fn(),
    host = createAudioMixerWorkerHost(send);
  await host.receive({ type: "read", id: 1, start: 0, count: 1 });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "error", id: 1 }));
  state.mixer.mockRejectedValueOnce(
    Object.assign(Error("codec unavailable"), { code: "unsupportedAudio" }),
  );
  await host.receive({
    type: "init",
    id: 2,
    plan: { mode: "motion", duration: { value: 2, rate: 1 }, layers: [], audio: [] },
    assets: {},
    options: {},
  });
  expect(send).toHaveBeenCalledWith({
    type: "error",
    id: 2,
    message: "codec unavailable",
    code: "unsupportedAudio",
  });
});

it("acknowledges a committed mix state without reconstructing the worker mixer", async () => {
  const send = vi.fn(),
    mixState = vi.fn(),
    host = createAudioMixerWorkerHost(send);
  state.mixer.mockResolvedValueOnce({
    sampleRate: 48000,
    channels: 2,
    blockFrames: 1024,
    samples: 96000,
    hasAudio: true,
    setMixState: mixState,
    dispose: vi.fn(),
  });
  await host.receive({
    type: "init",
    id: 1,
    plan: { mode: "motion", duration: { value: 2, rate: 1 }, layers: [], audio: [] },
    assets: {},
    options: {},
  });
  await host.receive({ type: "mixState", id: 2, trackId: "sound", volume: 0.4, mute: false });
  expect(mixState).toHaveBeenCalledWith("sound", { volume: 0.4, mute: false });
  expect(send).toHaveBeenLastCalledWith({ type: "updated", id: 2, hasAudio: true });
  await host.receive({ type: "close", id: 3 });
});
