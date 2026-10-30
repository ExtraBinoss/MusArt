import { expect, it, vi } from "vitest";
import { compileMotion, createLayer } from "@musart/core";
import {
  audioWorkerPlan,
  createWorkerAudioMixer,
} from "../../../../src/services/motion/audio/mixer-worker-client";
import { audioFixture } from "../../../support/audio";
import type {
  AudioMixerJob,
  AudioMixerReply,
} from "../../../../src/services/motion/audio/mixer-worker-model";
function worker() {
  const messages: AudioMixerJob[] = [];
  const port = {
    onmessage: null as ((event: MessageEvent<AudioMixerReply>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    terminate: vi.fn(),
    postMessage: vi.fn((job: AudioMixerJob) => {
      messages.push(job);
      if (job.type === "init")
        queueMicrotask(() =>
          port.onmessage?.({
            data: {
              type: "ready",
              id: job.id,
              metadata: {
                sampleRate: 48000,
                channels: 2,
                samples: 96000,
                blockFrames: 4096,
                hasAudio: true,
              },
            },
          } as MessageEvent<AudioMixerReply>),
        );
      if (job.type === "mixState" || job.type === "volume")
        queueMicrotask(() =>
          port.onmessage?.({
            data: {
              type: "updated",
              id: job.id,
              hasAudio:
                job.type === "mixState" ? !job.mute && job.volume > 0 : (job.volume ?? 1) > 0,
            },
          } as MessageEvent<AudioMixerReply>),
        );
      if (job.type === "read")
        queueMicrotask(() =>
          port.onmessage?.({
            data: { type: "pcm", id: job.id, pcm: new Float32Array(job.count * 2).fill(0.2) },
          } as MessageEvent<AudioMixerReply>),
        );
      if (job.type === "close")
        queueMicrotask(() =>
          port.onmessage?.({
            data: { type: "closed", id: job.id },
          } as MessageEvent<AudioMixerReply>),
        );
    }),
  };
  return { port, messages, create: () => port as unknown as Worker };
}
it("sends only a compact audio plan/original descriptions and exchanges bounded PCM with cleanup", async () => {
  const d = audioFixture();
  d.engine.execute({
    type: "addLayers",
    layers: [createLayer("image", { id: "photo", assetId: "image" })],
    assets: [
      {
        id: "image",
        name: "Photo",
        mime: "image/png",
        width: 1,
        height: 1,
        dataUrl: "data:image/png;base64,AAAA",
      },
    ],
  });
  const program = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" }),
    f = worker();
  const plan = audioWorkerPlan(program);
  expect(plan.layers).toEqual([]);
  expect("composition" in plan).toBe(false);
  const mixer = await createWorkerAudioMixer(
    program,
    d.engine.getSnapshot().project.assets,
    { resolveOriginal: async () => new Blob(["x"]) },
    {},
    f.create,
  );
  const init = f.messages[0]!;
  expect(init.type).toBe("init");
  expect(JSON.stringify(init)).not.toContain("data:image");
  expect(JSON.stringify(init)).not.toContain("keyframes");
  const pending = mixer.readBlock(0, 4);
  await expect(mixer.readBlock(0, 4)).rejects.toThrow("serially");
  expect([...(await pending)]).toEqual(Array(8).fill(expect.closeTo(0.2)));
  await mixer.dispose();
  await mixer.dispose();
  expect(f.port.terminate).toHaveBeenCalledOnce();
  expect(f.port.onmessage).toBeNull();
});
it("resolves actual immutable originals lazily and drops a canceled late read", async () => {
  const d = audioFixture(),
    program = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" }),
    f = worker();
  let finish!: (blob: Blob) => void;
  const resolve = vi.fn(
    () =>
      new Promise<Blob>((r) => {
        finish = r;
      }),
  );
  const mixer = await createWorkerAudioMixer(
    program,
    d.engine.getSnapshot().project.assets,
    { resolveOriginal: resolve },
    {},
    f.create,
  );
  f.port.onmessage!({
    data: { type: "original", id: 9, assetId: "sound" },
  } as MessageEvent<AudioMixerReply>);
  expect(resolve).toHaveBeenCalledWith(
    d.engine.getSnapshot().project.assets.sound,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  await mixer.dispose();
  finish(new Blob(["x"]));
  await Promise.resolve();
  await Promise.resolve();
  expect(f.messages.filter((job) => job.type === "original")).toEqual([]);
});

it("relays an authored scalar base change without rebuilding the plan or worker", async () => {
  const d = audioFixture(),
    f = worker(),
    mixer = await createWorkerAudioMixer(
      compileMotion(d.engine.getSnapshot().project, { compositionId: "page" }),
      d.engine.getSnapshot().project.assets,
      undefined,
      {},
      f.create,
    );
  await mixer.setMixState(d.track().id, { volume: 0.25, mute: false });
  expect(f.messages.at(-1)).toMatchObject({
    type: "mixState",
    trackId: d.track().id,
    volume: 0.25,
    mute: false,
  });
  expect(mixer.hasAudio).toBe(true);
  await mixer.setMixState(d.track().id, { volume: 0.25, mute: true });
  expect(mixer.hasAudio).toBe(false);
  await expect(mixer.setMixState("foreign", { volume: 1, mute: false })).rejects.toThrow(
    "Invalid authored",
  );
  await mixer.dispose();
});
it("reports a real close failure while always terminating and removing listeners", async () => {
  const d = audioFixture(),
    f = worker(),
    mixer = await createWorkerAudioMixer(
      compileMotion(d.engine.getSnapshot().project, { compositionId: "page" }),
      d.engine.getSnapshot().project.assets,
      undefined,
      {},
      f.create,
    );
  f.port.postMessage.mockImplementation((job) => {
    if (job.type === "close")
      queueMicrotask(() =>
        f.port.onmessage?.({
          data: { type: "error", id: job.id, message: "Original decoder disposal failed." },
        } as MessageEvent<AudioMixerReply>),
      );
  });
  await expect(mixer.dispose()).rejects.toThrow("Original decoder disposal failed.");
  expect(f.port.terminate).toHaveBeenCalledOnce();
  expect(f.port.onmessage).toBeNull();
  expect(f.port.onerror).toBeNull();
  await expect(mixer.dispose()).rejects.toThrow("Original decoder disposal failed.");
});
