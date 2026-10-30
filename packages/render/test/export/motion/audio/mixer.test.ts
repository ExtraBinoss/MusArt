import { beforeEach, expect, it, vi } from "vitest";
import {
  compileMotion,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type AudioAsset,
  type MotionAudioProcessing,
} from "@musart/core";
import { createMotionAudioMixer } from "../../../../src/export/motion/audio/mixer";
import type { MotionAudioPlan } from "../../../../src/export/motion/audio/model";
import { videoAsset } from "../fixtures";
const state = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), dispose: vi.fn() }));
vi.mock("../../../../src/export/motion/audio/source", () => ({
  openMotionAudioSource: state.open,
}));
beforeEach(() => {
  state.open.mockReset().mockResolvedValue({
    sampleRate: 8000,
    channels: 1,
    readWindow: state.read,
    dispose: state.dispose,
  });
  state.read.mockReset().mockResolvedValue([
    {
      timestamp: 0,
      sampleRate: 8000,
      frames: 48000,
      channels: [new Float32Array(48000).fill(0.6)],
    },
  ]);
  state.dispose.mockReset().mockResolvedValue(undefined);
});
function fixture() {
  const asset = videoAsset();
  const engine = new EditorEngine(
    createProject({
      assets: { [asset.id]: asset },
      pages: [
        createPage({
          id: "comp",
          layers: [
            createLayer("group", { id: "group" }),
            createLayer("video", { id: "a", assetId: asset.id, parentId: "group" }),
            createLayer("video", { id: "b", assetId: asset.id, parentId: "group" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const tracks = engine.getSnapshot().project.pages[0]!.motion!.tracks;
  const group = tracks.find((track) => track.layerId === "group")!;
  engine.execute({
    type: "setMotionTrackRange",
    trackId: group.id,
    start: { value: 1, rate: 2 },
    end: { value: 1, rate: 1 },
  });
  for (const track of tracks.filter((item) => item.layerId !== "group"))
    engine.transaction([
      // The source in-point consumes half a second of the four-second original.
      // Keep each stored clip valid independently of its parent's shorter visible interval.
      {
        type: "setMotionTrackRange",
        trackId: track.id,
        start: track.start,
        end: { value: 7, rate: 2 },
      },
      { type: "setMotionMedia", trackId: track.id, patch: { sourceIn: { value: 1, rate: 2 } } },
    ]);
  const project = engine.getSnapshot().project;
  return { engine, project, program: compileMotion(project, { compositionId: "comp" }), tracks };
}
const resolver = { resolveOriginal: async () => new Blob(["x"]) };

function audioFixture(volume = 0.5, processing?: MotionAudioProcessing, voices = 1) {
  const asset: AudioAsset = {
    id: "sound",
    kind: "audio",
    name: "Sound",
    mime: "audio/wav",
    originalId: "sound-original",
    contentRevision: "1",
    byteLength: 1,
    duration: { value: 2, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 8000,
    sampleRate: 8000,
    channels: 1,
  };
  const plan: MotionAudioPlan = {
    mode: "motion",
    duration: { value: 2, rate: 1 },
    layers: [],
    audio: Array.from({ length: voices }, (_, index) => ({
      id: `clip-${index}`,
      start: { value: 0, rate: 1 },
      end: { value: 2, rate: 1 },
      media: {
        assetId: asset.id,
        sourceStart: { value: 0, rate: 1 },
        timelineStart: { value: 0, rate: 1 },
        mute: false,
        volume,
        ...(processing ? { processing } : {}),
      },
    })),
  };
  return { plan, assets: { [asset.id]: asset } };
}

it("mixes repeated originals once, respects ancestor half-open ranges and clips overlap peaks", async () => {
  const d = fixture();
  const mixer = await createMotionAudioMixer(d.program, d.project.assets, resolver, {
    sampleRate: 8000,
    channels: 2,
    blockFrames: 4,
  });
  expect(state.open).toHaveBeenCalledOnce();
  expect(mixer.samples).toBe(16000);
  const first = await mixer.readBlock(3999, 4);
  expect([...first]).toEqual([0, 1, 1, 1, 0, 1, 1, 1]);
  expect(state.read).toHaveBeenCalledWith(1.5, 1 + 4003 / 8000, expect.anything());
  const last = await mixer.readBlock(7999, 4);
  expect([...last]).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
  await mixer.dispose();
  await mixer.dispose();
  expect(state.dispose).toHaveBeenCalledOnce();
  await expect(mixer.readBlock(0, 4)).rejects.toMatchObject({ code: "closed" });
});
it("applies per-track mute/volume without treating visual opacity as an audio fader", async () => {
  const d = fixture();
  for (const track of d.tracks.filter((item) => item.layerId !== "group"))
    d.engine.execute({
      type: "setMotionMedia",
      trackId: track.id,
      patch: track.layerId === "a" ? { volume: 0.5 } : { mute: true },
    });
  d.engine.execute({ type: "updateLayers", ids: ["a"], patch: { opacity: 0 } });
  const project = d.engine.getSnapshot().project;
  const mixer = await createMotionAudioMixer(
    compileMotion(project, { compositionId: "comp" }),
    project.assets,
    resolver,
    { sampleRate: 8000, channels: 1, blockFrames: 4 },
  );
  expect((await mixer.readBlock(4000, 4))[0]).toBeCloseTo(0.3);
  expect(state.read).toHaveBeenCalledOnce();
  await mixer.dispose();
});
it("rejects unavailable originals, invalid blocks and decoding failures without silent fallback", async () => {
  const d = fixture();
  await expect(
    createMotionAudioMixer(d.program, d.project.assets, undefined),
  ).rejects.toMatchObject({ code: "missingOriginal" });
  const mixer = await createMotionAudioMixer(d.program, d.project.assets, resolver, {
    sampleRate: 8000,
    blockFrames: 4,
  });
  await expect(mixer.readBlock(-1, 4)).rejects.toMatchObject({ code: "invalidOptions" });
  state.read.mockRejectedValueOnce(new Error("decoder failed"));
  await expect(mixer.readBlock(4000, 4)).rejects.toThrow("decoder failed");
  await mixer.dispose();
});

it("releases admitted originals and retains initialization plus cleanup failures", async () => {
  const d = fixture(),
    project = structuredClone(d.project),
    asset = videoAsset({ id: "second", originalId: "second-original" }),
    failure = new Error("second decoder failed"),
    cleanup = new Error("first decoder cleanup failed");
  project.assets[asset.id] = asset;
  project.pages[0]!.layers.find((layer) => layer.id === "b")!.assetId = asset.id;
  // First source is admitted; opening a different original then fails.
  state.open
    .mockReset()
    .mockResolvedValueOnce({
      sampleRate: 8000,
      channels: 1,
      readWindow: state.read,
      dispose: state.dispose,
    })
    .mockRejectedValueOnce(failure);
  state.dispose.mockRejectedValueOnce(cleanup);
  await expect(
    createMotionAudioMixer(
      compileMotion(project, { compositionId: "comp" }),
      project.assets,
      resolver,
    ),
  ).rejects.toMatchObject({ errors: [failure, { errors: [cleanup] }] });
  expect(state.dispose).toHaveBeenCalledOnce();
});

it("mixes standalone lanes and accepts more than four sequential originals with a bounded decoder LRU", async () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "audio-page", layers: [] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (let i = 0; i < 6; i++)
    engine.execute({
      type: "addMotionAudioTrack",
      asset: {
        id: `sound-${i}`,
        kind: "audio",
        name: "Sound",
        mime: "audio/wav",
        originalId: `original-${i}`,
        contentRevision: "r1",
        byteLength: 1,
        duration: { value: 1, rate: 1 },
        firstTimestamp: { value: 0, rate: 1 },
        timeResolution: 8000,
        sampleRate: 8000,
        channels: 1,
      },
      track: {
        id: `clip-${i}`,
        name: "Sound",
        assetId: `sound-${i}`,
        start: { value: i, rate: 1 },
        end: { value: i + 1, rate: 1 },
        sourceIn: { value: 0, rate: 1 },
        mute: false,
        volume: 0.5,
      },
    });
  let active = 0,
    peak = 0;
  state.open.mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    let closed = false;
    return {
      sampleRate: 8000,
      channels: 1,
      readWindow: async (start: number) => [
        {
          timestamp: start,
          sampleRate: 8000,
          frames: 4,
          channels: [new Float32Array(4).fill(0.5)],
        },
      ],
      dispose: async () => {
        if (!closed) active--;
        closed = true;
      },
    };
  });
  const project = engine.getSnapshot().project;
  const mixer = await createMotionAudioMixer(
    compileMotion(project, { compositionId: "audio-page" }),
    project.assets,
    resolver,
    { sampleRate: 8000, channels: 1, blockFrames: 4 },
  );
  expect(mixer.hasAudio).toBe(true);
  for (let i = 0; i < 6; i++)
    expect([...(await mixer.readBlock(i * 8000, 4))]).toEqual([0.25, 0.25, 0.25, 0.25]);
  expect(peak).toBeLessThanOrEqual(4);
  await mixer.dispose();
  expect(active).toBe(0);
});

it("publishes gain previews at block boundaries, restores authored zero and keeps originals lazy", async () => {
  const d = audioFixture(0),
    immutable = JSON.stringify(d.plan);
  const mixer = await createMotionAudioMixer(d.plan, d.assets, resolver, {
    sampleRate: 8000,
    channels: 1,
    blockFrames: 4,
  });
  expect(mixer.hasAudio).toBe(false);
  expect(state.open).not.toHaveBeenCalled();
  mixer.setVolumePreview("clip-0", 0.5);
  expect(mixer.hasAudio).toBe(true);
  expect((await mixer.readBlock(0, 4))[0]).toBeCloseTo(0.3);
  expect(state.open).toHaveBeenCalledOnce();
  mixer.setVolumePreview("unknown", 0.8);
  mixer.setVolumePreview("clip-0", null);
  expect(mixer.hasAudio).toBe(false);
  expect([...(await mixer.readBlock(4, 4))]).toEqual([0, 0, 0, 0]);
  expect(JSON.stringify(d.plan)).toBe(immutable);
  expect(() => mixer.setVolumePreview("clip-0", NaN)).toThrow("volume");
  await mixer.dispose();
  expect(() => mixer.setVolumePreview("clip-0", 1)).toThrow("closed");
});

it("applies fade/gain to five concurrent voices and leaves unclipped audition PCM before native gain", async () => {
  const d = audioFixture(
    1,
    {
      fadeIn: { value: 1, rate: 100 },
      fadeOut: { value: 1, rate: 100 },
      reverb: { mix: 0, decay: 0.8 },
    },
    5,
  );
  const mixer = await createMotionAudioMixer(d.plan, d.assets, resolver, {
    sampleRate: 8000,
    channels: 1,
    blockFrames: 4,
    clampOutput: false,
  });
  expect((await mixer.readBlock(0, 4))[0]).toBe(0);
  expect((await mixer.readBlock(40, 4))[0]).toBeCloseTo(1.5);
  expect((await mixer.readBlock(15960, 4))[0]).toBeCloseTo(1.5);
  expect(state.open).toHaveBeenCalledOnce();
  await mixer.dispose();
  const clamped = await createMotionAudioMixer(d.plan, d.assets, resolver, {
    sampleRate: 8000,
    channels: 1,
    blockFrames: 4,
  });
  expect((await clamped.readBlock(80, 4))[0]).toBe(1);
  await clamped.dispose();
});

it("keeps diffuse reverb identical across block partitions and random seeks, with clip-bounded tails", async () => {
  const d = audioFixture(0.5, {
    fadeIn: { value: 1, rate: 100 },
    fadeOut: { value: 1, rate: 100 },
    reverb: { mix: 0.8, decay: 0.1 },
  });
  const values = Float32Array.from({ length: 16000 }, (_, index) =>
    index === 0 ? 0.9 : Math.sin(index * 0.17) * 0.4,
  );
  state.read.mockResolvedValue([
    { timestamp: 0, sampleRate: 8000, frames: values.length, channels: [values] },
  ]);
  const mix = () =>
    createMotionAudioMixer(d.plan, d.assets, resolver, {
      sampleRate: 8000,
      channels: 1,
      blockFrames: 512,
    });
  const whole = await mix(),
    partitioned = await mix();
  const first = await whole.readBlock(0, 512),
    second = await whole.readBlock(512, 512);
  const pieces: number[] = [];
  for (let start = 0; start < 1024; start += 64)
    pieces.push(...(await partitioned.readBlock(start, 64)));
  expect(pieces).toEqual([...first, ...second]);
  const sought = await mix();
  expect(await sought.readBlock(900, 100)).toEqual(second.slice(388, 488));
  expect(await sought.readBlock(0, 100)).toEqual(first.slice(0, 100));
  // A following silent gap has no hidden reverb tail, even after a backwards seek.
  const short: MotionAudioPlan = {
    ...d.plan,
    audio: d.plan.audio.map((lane) => ({ ...lane, end: { value: 1, rate: 1 } })),
  };
  const clipped = await createMotionAudioMixer(short, d.assets, resolver, {
    sampleRate: 8000,
    channels: 1,
    blockFrames: 4,
  });
  await clipped.readBlock(7996, 4);
  expect([...(await clipped.readBlock(8000, 4))]).toEqual([0, 0, 0, 0]);
  await Promise.all([whole.dispose(), partitioned.dispose(), sought.dispose(), clipped.dispose()]);
});

it("admits eight long stereo reverbs and reports a real state-budget overflow instead of dropping voices", async () => {
  const processing: MotionAudioProcessing = {
    fadeIn: { value: 0, rate: 1 },
    fadeOut: { value: 0, rate: 1 },
    reverb: { mix: 1, decay: 3 },
  };
  const d = audioFixture(0.5, processing, 8);
  const mixer = await createMotionAudioMixer(d.plan, d.assets, resolver, {
    sampleRate: 48000,
    channels: 2,
    blockFrames: 4,
  });
  expect((await mixer.readBlock(0, 4)).length).toBe(8);
  await mixer.dispose();
  const excessive = audioFixture(0.5, processing, 15);
  const limited = await createMotionAudioMixer(excessive.plan, excessive.assets, resolver, {
    sampleRate: 48000,
    channels: 2,
    blockFrames: 4,
  });
  await expect(limited.readBlock(0, 4)).rejects.toThrow("state budget exceeded for clip clip-14");
  for (let index = 0; index < 15; index++) limited.setVolumePreview(`clip-${index}`, 0);
  expect([...(await limited.readBlock(4, 4))]).toEqual(Array.from({ length: 8 }, () => 0));
  for (let index = 0; index < 8; index++) limited.setVolumePreview(`clip-${index}`, 0.5);
  expect((await limited.readBlock(8, 4)).length).toBe(8);
  await limited.dispose();
});

it("cleans a freshly opened original when abort happens before cache admission", async () => {
  const d = audioFixture(1),
    controller = new AbortController(),
    failure = new Error("cancel after open");
  state.open.mockImplementationOnce(async () => {
    controller.abort(failure);
    return { sampleRate: 8000, channels: 1, readWindow: state.read, dispose: state.dispose };
  });
  await expect(
    createMotionAudioMixer(d.plan, d.assets, resolver, { signal: controller.signal }),
  ).rejects.toBe(failure);
  expect(state.dispose).toHaveBeenCalledOnce();
});

it("anchors fades to the authored clip when the composition cuts its audible window short", async () => {
  const d = audioFixture(1, {
    fadeIn: { value: 0, rate: 1 },
    fadeOut: { value: 1, rate: 2 },
    reverb: { mix: 0, decay: 0.8 },
  });
  const plan: MotionAudioPlan = {
    ...d.plan,
    duration: { value: 1, rate: 1 },
    audio: d.plan.audio.map((lane) => ({
      ...lane,
      end: { value: 1, rate: 1 },
      media: { ...lane.media, timelineEnd: { value: 2, rate: 1 } },
    })),
  };
  const mixer = await createMotionAudioMixer(plan, d.assets, resolver, {
    sampleRate: 8000,
    channels: 1,
    blockFrames: 4,
  });
  expect((await mixer.readBlock(7200, 4))[0]).toBeCloseTo(0.6);
  await mixer.dispose();
});

it("retains one block's gain when an override arrives during its decoder await", async () => {
  const d = audioFixture(1);
  const mixer = await createMotionAudioMixer(d.plan, d.assets, resolver, {
    sampleRate: 8000,
    channels: 1,
    blockFrames: 4,
  });
  const chunks = await state.read();
  state.read.mockImplementationOnce(async () => {
    mixer.setVolumePreview("clip-0", 0.5);
    return chunks;
  });
  expect((await mixer.readBlock(0, 4))[0]).toBeCloseTo(0.6);
  expect((await mixer.readBlock(4, 4))[0]).toBeCloseTo(0.3);
  await mixer.dispose();
});

it("rebases live volume/mute commits lazily and restores the latest base after a later draft", async () => {
  const d = audioFixture(0.5);
  const plan: MotionAudioPlan = {
    ...d.plan,
    audio: d.plan.audio.map((lane) => ({ ...lane, media: { ...lane.media, mute: true } })),
  };
  const original = JSON.stringify(plan);
  const mixer = await createMotionAudioMixer(plan, d.assets, resolver, {
    sampleRate: 8000,
    channels: 1,
    blockFrames: 4,
  });
  expect(state.open).not.toHaveBeenCalled();
  mixer.setVolumePreview("clip-0", 0.8);
  expect(mixer.hasAudio).toBe(false);
  mixer.setMixState("clip-0", { volume: 0.3, mute: false });
  expect(mixer.hasAudio).toBe(true);
  expect((await mixer.readBlock(0, 4))[0]).toBeCloseTo(0.18);
  mixer.setVolumePreview("clip-0", 0.8);
  expect((await mixer.readBlock(4, 4))[0]).toBeCloseTo(0.48);
  mixer.setMixState("clip-0", { volume: 0.25, mute: false });
  mixer.setVolumePreview("clip-0", null);
  expect((await mixer.readBlock(8, 4))[0]).toBeCloseTo(0.15);
  mixer.setMixState("clip-0", { volume: 0.25, mute: true });
  expect(mixer.hasAudio).toBe(false);
  expect([...(await mixer.readBlock(12, 4))]).toEqual([0, 0, 0, 0]);
  expect(state.open).toHaveBeenCalledOnce();
  expect(JSON.stringify(plan)).toBe(original);
  expect(() => mixer.setMixState("clip-0", { volume: NaN, mute: false })).toThrow("mix state");
  await mixer.dispose();
});
