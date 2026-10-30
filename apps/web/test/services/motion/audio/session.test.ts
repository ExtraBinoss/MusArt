import { expect, it, vi } from "vitest";
import { AudioAudition } from "../../../../src/services/motion/audio/audition";
import { createPage, createProject, EditorEngine } from "@musart/core";
import {
  getMotionAudioSession,
  MotionAudioSession,
} from "../../../../src/services/motion/audio/session";
const state = vi.hoisted(() => ({
  sfx: vi.fn(),
  reset: vi.fn(),
  prepareDispose: vi.fn(),
  playbackDispose: vi.fn(),
}));
vi.mock("../../../../src/services/motion/audio/preparation", () => ({
  AudioPreparation: class {
    sfx = state.sfx;
    reset = state.reset;
    dispose = state.prepareDispose;
    pauseWaveforms() {}
    resumeWaveforms() {}
  },
}));
vi.mock("../../../../src/services/motion/audio/playback", () => ({
  MotionAudioPlayback: class {
    dispose = state.playbackDispose;
  },
}));
it("imports a generated real WAV through the normal atomic file service and unregisters on cleanup", async () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "page", layers: [] })] }),
  );
  const services = {
    importFiles: vi.fn(async (_files: File[]) => {}),
    mediaResolverFor: () => ({ resolveOriginal: async () => new Blob() }),
  };
  const session = new MotionAudioSession(engine, services, vi.fn());
  state.sfx.mockResolvedValueOnce(new Blob(["wav"], { type: "audio/wav" }));
  expect(getMotionAudioSession(engine)).toBe(session);
  await session.importPreset("soft-plop");
  const file = services.importFiles.mock.calls[0]![0] as unknown as File[];
  expect(file[0]!.name).toBe("Soft plop.wav");
  expect(file[0]!.type).toBe("audio/wav");
  expect(file[0]!.size).toBe(3);
  await session.dispose();
  await session.dispose();
  expect(getMotionAudioSession(engine)).toBeUndefined();
  expect(state.prepareDispose).toHaveBeenCalledOnce();
  expect(state.playbackDispose).toHaveBeenCalledOnce();
});
it("rejects a sound generated for an editing origin that changed before import", async () => {
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [] })] }));
  const services = {
    importFiles: vi.fn(async (_files: File[]) => {}),
    mediaResolverFor: () => ({ resolveOriginal: async () => new Blob() }),
  };
  const session = new MotionAudioSession(engine, services, vi.fn());
  let resolve!: (value: Blob) => void;
  state.sfx.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const result = session.importPreset("soft-plop");
  engine.execute({ type: "renameProject", name: "New revision" });
  resolve(new Blob(["wav"]));
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(services.importFiles).not.toHaveBeenCalled();
  await expect(session.importPreset("missing")).rejects.toThrow("Unknown");
  await session.dispose();
});

it("routes row cleanup to its cue owner while keeping explicit global stop available", async () => {
  const engine = new EditorEngine(createProject()),
    owned = vi.spyOn(AudioAudition.prototype, "stopTrack"),
    stopAll = vi.spyOn(AudioAudition.prototype, "stop"),
    session = new MotionAudioSession(
      engine,
      {
        importFiles: vi.fn(async () => {}),
        mediaResolverFor: () => ({ resolveOriginal: async () => new Blob() }),
      },
      vi.fn(),
    );
  const before = stopAll.mock.calls.length;
  session.stopPreview("cue-B");
  expect(owned).toHaveBeenCalledWith("cue-B");
  expect(stopAll).toHaveBeenCalledTimes(before);
  session.stopPreview();
  expect(stopAll).toHaveBeenCalledTimes(before + 1);
  await session.dispose();
  owned.mockRestore();
  stopAll.mockRestore();
});
