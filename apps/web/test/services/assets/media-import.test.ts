import { expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type MotionInitializationPlan,
  type Project,
} from "@musart/core";
import { importMediaFiles } from "../../../src/services/assets/media-import";
const metadata = {
  width: 960,
  height: 540,
  duration: { value: 1001, rate: 200 },
  firstTimestamp: { value: 0, rate: 1 },
  timeResolution: 30000,
  orientation: {
    rotation: 0 as const,
    flip: false,
    pixelAspectRatio: { numerator: 1, denominator: 1 },
  },
  audio: { codec: "aac", sampleRate: 48000, channels: 2 },
};
function fixture(count = 0) {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: Array.from({ length: count }, (_, i) =>
            createLayer("rectangle", { id: `still-${i}` }),
          ),
        }),
      ],
    }),
  );
  const events = vi.fn();
  engine.subscribeCommands(events);
  const store = {
    prepareSaveCurrent: vi.fn(async (project: Project, _options?: unknown) => ({ project })),
    persistPrepared: vi.fn(async () => {}),
  };
  const probe = vi.fn(async () => metadata);
  const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
  return { engine, store, probe, file, events };
}
it("publishes the probed binary clip, Motion conversion and duration as one durable undo transaction", async () => {
  const d = fixture(2),
    before = d.engine.getSnapshot();
  d.store.persistPrepared.mockImplementation(async () => {
    expect(d.engine.getSnapshot()).toBe(before);
    expect(() => d.engine.undo()).toThrow("busy");
  });
  await importMediaFiles(d.engine, [d.file], d);
  const snapshot = d.engine.getSnapshot(),
    page = snapshot.project.pages[0]!;
  expect(page.motion!.duration).toEqual(metadata.duration);
  expect(page.motion!.tracks).toHaveLength(3);
  expect(page.layers[2]!.kind).toBe("video");
  const asset = snapshot.project.assets[page.layers[2]!.assetId!]!;
  expect(asset).toMatchObject({
    kind: "video",
    byteLength: 5,
    duration: metadata.duration,
    orientation: metadata.orientation,
  });
  expect(Object.hasOwn(asset, "dataUrl")).toBe(false);
  expect(d.store.prepareSaveCurrent.mock.calls[0]![1]).toMatchObject({
    mediaOriginals: [{ blob: d.file }],
  });
  expect(d.events).toHaveBeenCalledTimes(1);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
  d.engine.redo();
  expect(d.engine.getSnapshot().project).toBe(snapshot.project);
});
it("counts the staged clip for confirmation and cancellation publishes nothing", async () => {
  const d = fixture(3),
    before = d.engine.getSnapshot(),
    confirm = vi.fn(async (_plan: MotionInitializationPlan) => false);
  await importMediaFiles(d.engine, [d.file], { ...d, confirm });
  expect(confirm.mock.calls[0]![0].layerIds).toHaveLength(4);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.store.persistPrepared).not.toHaveBeenCalled();
  await expect(importMediaFiles(d.engine, [d.file], d)).rejects.toThrow("confirmation");
});
it("rejects stale preparation and real persistence failures without publishing or leaking the lock", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  d.store.persistPrepared.mockRejectedValueOnce(Error("native quota"));
  await expect(importMediaFiles(d.engine, [d.file], d)).rejects.toThrow("quota");
  expect(d.engine.getSnapshot()).toBe(before);
  d.probe.mockImplementationOnce(async () => {
    d.engine.execute({ type: "renameProject", name: "Concurrent" });
    return metadata;
  });
  await expect(importMediaFiles(d.engine, [d.file], d)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(d.engine.getSnapshot().project.name).toBe("Concurrent");
});

it("imports audio at the playhead as a nonvisual timed lane with atomic original persistence", async () => {
  const d = fixture(2),
    before = d.engine.getSnapshot();
  const file = new File(["sound"], "pop.wav", { type: "audio/wav" });
  const probeAudio = vi.fn(async () => ({
    duration: { value: 1, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 48000,
    sampleRate: 48000,
    channels: 1 as const,
  }));
  await importMediaFiles(d.engine, [file], { ...d, probeAudio }, { at: { value: 2, rate: 1 } });
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.layers).toHaveLength(2);
  expect(page.motion!.tracks).toHaveLength(2);
  expect(page.motion!.audioTracks![0]).toMatchObject({
    start: { value: 2, rate: 1 },
    end: { value: 3, rate: 1 },
    mute: false,
    volume: 1,
  });
  expect(page.motion!.duration).toEqual({ value: 3, rate: 1 });
  expect(d.store.prepareSaveCurrent.mock.calls[0]![1]).toMatchObject({
    mediaOriginals: [{ blob: file }],
  });
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
});
