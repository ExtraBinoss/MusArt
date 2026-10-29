import { beforeEach, expect, it, vi } from "vitest";
import { compileMotion, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createMotionAudioMixer } from "../../../../src/export/motion/audio/mixer";
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
