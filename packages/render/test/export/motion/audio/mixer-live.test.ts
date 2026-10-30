import { beforeEach, expect, it, vi } from "vitest";
import type { AudioAsset, VideoAsset } from "@musart/core";
import type { MotionAudioPlan } from "../../../../src/export/motion/audio/model";
import { createMotionAudioMixer } from "../../../../src/export/motion/audio/mixer";

const state = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), dispose: vi.fn() }));
vi.mock("../../../../src/export/motion/audio/source", () => ({
  openMotionAudioSource: state.open,
}));
beforeEach(() => {
  state.dispose.mockReset().mockResolvedValue(undefined);
  state.read.mockReset().mockImplementation(async (start: number, end: number) => {
    const frames = Math.ceil((end - start) * 48000) + 1;
    return [
      {
        timestamp: start,
        sampleRate: 48000,
        frames,
        channels: [new Float32Array(frames).fill(0.25)],
      },
    ];
  });
  state.open.mockReset().mockImplementation(async () => ({
    sampleRate: 48000,
    channels: 1,
    readWindow: state.read,
    dispose: state.dispose,
  }));
});
function fixture() {
  const assets: Record<string, AudioAsset> = {};
  const plan: MotionAudioPlan = {
    mode: "motion",
    duration: { value: 40, rate: 1 },
    layers: [],
    audio: Array.from({ length: 40 }, (_, id) => {
      const asset: AudioAsset = {
        id: `sound-${id}`,
        kind: "audio",
        name: "Sound",
        mime: "audio/wav",
        originalId: `original-${id}`,
        contentRevision: "1",
        byteLength: 1,
        duration: { value: 1, rate: 1 },
        firstTimestamp: { value: 0, rate: 1 },
        timeResolution: 48000,
        sampleRate: 48000,
        channels: 1,
      };
      assets[asset.id] = asset;
      return {
        id: `clip-${id}`,
        start: { value: id, rate: 1 },
        end: { value: id + 1, rate: 1 },
        media: {
          assetId: asset.id,
          sourceStart: { value: 0, rate: 1 },
          timelineStart: { value: id, rate: 1 },
          volume: 1,
          mute: false,
        },
      };
    }),
  };
  return { assets, plan };
}
const resolver = { resolveOriginal: async () => new Blob(["x"]) };
it("opens only intersecting originals for live playback and reuses decoded PCM across small blocks", async () => {
  const d = fixture(),
    mixer = await createMotionAudioMixer(d.plan, d.assets, resolver, {
      lazySources: true,
      sourceReadAhead: 0.08,
      blockFrames: 1024,
    });
  expect(state.open).not.toHaveBeenCalled();
  expect(mixer.hasAudio).toBe(true);
  for (let at = 0; at < 8; at++) expect((await mixer.readBlock(at * 1024, 1024))[0]).toBe(0.25);
  expect(state.open).toHaveBeenCalledOnce();
  expect(state.open.mock.calls[0]![0].id).toBe("sound-0");
  expect(state.read).toHaveBeenCalledTimes(3);
  await mixer.readBlock(48000, 1024);
  expect(state.open).toHaveBeenCalledTimes(2);
  expect(state.open.mock.calls[1]![0].id).toBe("sound-1");
  await mixer.dispose();
  expect(state.dispose).toHaveBeenCalledTimes(2);
});
it("discovers a silent video lazily without fabricating audio or repeatedly reopening it", async () => {
  const d = fixture(),
    base = d.assets["sound-0"]!;
  const video: VideoAsset = {
    ...base,
    kind: "video",
    width: 16,
    height: 16,
    orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
  };
  state.open.mockResolvedValue(null);
  const mixer = await createMotionAudioMixer(
    { ...d.plan, audio: d.plan.audio.slice(0, 1) },
    { [video.id]: video },
    resolver,
    { lazySources: true, blockFrames: 1024 },
  );
  expect(mixer.hasAudio).toBe(true);
  expect((await mixer.readBlock(0, 1024)).every((value) => value === 0)).toBe(true);
  expect(mixer.hasAudio).toBe(false);
  await mixer.readBlock(1024, 1024);
  expect(state.open).toHaveBeenCalledOnce();
  await mixer.dispose();
});
it("reports original/decode failures at their first required block and keeps export eager", async () => {
  const d = fixture();
  state.open.mockRejectedValue(Error("missing real original"));
  const mixer = await createMotionAudioMixer(d.plan, d.assets, resolver, {
    lazySources: true,
    blockFrames: 1024,
  });
  await expect(mixer.readBlock(0, 1024)).rejects.toThrow("missing real original");
  await mixer.dispose();
  await expect(createMotionAudioMixer(d.plan, d.assets, resolver)).rejects.toThrow(
    "missing real original",
  );
});
