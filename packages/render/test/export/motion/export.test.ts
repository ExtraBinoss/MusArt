import { beforeEach, expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type Composition,
} from "@musart/core";
import { exportMotionVideo } from "../../../src/export/motion/export";

const state = vi.hoisted(() => ({
  frames: [] as { time: { value: number; rate: number }; x: number }[],
  hasAudio: false,
  outputStream: false,
  videoAdd: vi.fn(),
  videoClose: vi.fn(),
  audioAdd: vi.fn(),
  audioClose: vi.fn(),
  sampleClose: vi.fn(),
  start: vi.fn(),
  finalize: vi.fn(),
  cancel: vi.fn(),
  sessionDispose: vi.fn(),
  mixerDispose: vi.fn(),
  targetDispose: vi.fn(),
  targetAbort: vi.fn(),
  targetOptions: vi.fn(),
  render: vi.fn(),
  mixerCreate: vi.fn(),
  outputCreate: vi.fn(),
  canvasCreate: vi.fn(),
}));
vi.mock("mediabunny", () => ({
  Output: class {
    constructor() {
      state.outputCreate();
    }
    addVideoTrack() {}
    addAudioTrack() {}
    start = state.start;
    finalize = state.finalize;
    cancel = state.cancel;
  },
  CanvasSource: class {
    constructor() {
      state.canvasCreate();
    }
    add = state.videoAdd;
    close = state.videoClose;
  },
  AudioSampleSource: class {
    add = state.audioAdd;
    close = state.audioClose;
  },
  AudioSample: class {
    constructor(readonly options: unknown) {}
    close = state.sampleClose;
  },
}));
vi.mock("../../../src/export/standalone", () => ({
  createRenderSession: () => ({ withCanvasFrame: state.render, dispose: state.sessionDispose }),
}));
vi.mock("../../../src/export/motion/audio/mixer", () => ({
  createMotionAudioMixer: async () => {
    state.mixerCreate();
    return {
      hasAudio: state.hasAudio,
      sampleRate: 8000,
      channels: 1,
      samples: 808,
      blockFrames: 404,
      readBlock: async (_cursor: number, count: number) => new Float32Array(count),
      dispose: state.mixerDispose,
    };
  },
}));
vi.mock("../../../src/export/motion/encoding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/export/motion/encoding")>()),
  chooseMotionEncoding: async () => ({
    format: {},
    videoCodec: "avc",
    audioCodec: "aac",
    mimeType: "video/mp4",
    quality: 1,
  }),
}));
vi.mock("../../../src/export/motion/target", () => ({
  createMotionOutputTarget: (options: { output?: WritableStream }) => {
    state.targetOptions(options);
    return {
      target: {},
      bytes: () => 7,
      blob: (type: string) => (options.output ? null : new Blob(["encoded"], { type })),
      abort: state.targetAbort,
      dispose: state.targetDispose,
    };
  },
}));
beforeEach(() => {
  for (const value of Object.values(state)) if (vi.isMockFunction(value)) value.mockReset();
  state.frames.length = 0;
  state.hasAudio = false;
  state.videoAdd.mockResolvedValue(undefined);
  state.audioAdd.mockResolvedValue(undefined);
  state.render.mockImplementation(
    async (
      page: Composition,
      _assets: unknown,
      consume: (canvas: HTMLCanvasElement) => Promise<void>,
      options: { motionFrame: { time: { value: number; rate: number } } },
    ) => {
      state.frames.push({ time: options.motionFrame.time, x: page.layers[0]!.x });
      await consume({ width: 32, height: 16 } as HTMLCanvasElement);
    },
  );
});
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "comp",
          width: 32,
          height: 16,
          layers: [createLayer("rectangle", { id: "shape", x: 0 })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 101, rate: 1000 } });
  const target = { kind: "layer", layerId: "shape", property: "x" } as const;
  engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: 0 },
    { type: "upsertMotionKeyframe", target, time: { value: 101, rate: 1000 }, value: 101 },
  ]);
  return structuredClone(engine.getSnapshot().project);
}

it("rejects transparent output before touching audio, encoding, targets or rendering", async () => {
  await expect(
    exportMotionVideo(fixture(), { compositionId: "comp", alpha: "keep" }),
  ).rejects.toMatchObject({ name: "MotionExportError", code: "alphaUnsupported" });
  for (const untouched of [
    state.mixerCreate,
    state.outputCreate,
    state.canvasCreate,
    state.targetOptions,
    state.render,
  ])
    expect(untouched).not.toHaveBeenCalled();
});

it("exports half-open rational frames and a shortened final sample from one frozen snapshot", async () => {
  const project = fixture(),
    progress: number[] = [];
  const result = await exportMotionVideo(project, {
    compositionId: "comp",
    scale: 2,
    onProgress: (value) => {
      progress.push(value.fraction);
      project.pages[0]!.layers[0]!.x = 999;
    },
  });
  expect(state.frames.map((frame) => frame.time)).toEqual([
    { value: 0, rate: 1 },
    { value: 1, rate: 30 },
    { value: 1, rate: 15 },
    { value: 1, rate: 10 },
  ]);
  expect(state.frames.map((frame) => frame.x)).toEqual([0, 100 / 3, 200 / 3, 100]);
  expect(state.videoAdd.mock.calls.at(-1)!.slice(0, 2)).toEqual([0.1, 0.001]);
  expect(result).toMatchObject({
    frameCount: 4,
    duration: { value: 101, rate: 1000 },
    width: 64,
    height: 32,
    bytes: 7,
    audio: null,
  });
  expect(result.blob?.type).toBe("video/mp4");
  expect(progress.at(-1)).toBe(1);
  expect(progress.every((value, index) => index === 0 || value >= progress[index - 1]!)).toBe(true);
  expect(state.videoClose).toHaveBeenCalledOnce();
  expect(state.finalize).toHaveBeenCalledOnce();
  expect(state.cancel).not.toHaveBeenCalled();
  expect(state.sessionDispose).toHaveBeenCalledOnce();
  expect(state.mixerDispose).toHaveBeenCalledOnce();
  expect(state.targetDispose).toHaveBeenCalledOnce();
});

it("mixes finite audio blocks and forwards a streaming target without reporting an in-memory file", async () => {
  state.hasAudio = true;
  const output = new WritableStream();
  const result = await exportMotionVideo(fixture(), {
    compositionId: "comp",
    output,
    maxOutputBytes: 1024,
  });
  expect(state.targetOptions).toHaveBeenCalledWith(
    expect.objectContaining({ output, maxBytes: 1024 }),
  );
  expect(result.blob).toBeNull();
  expect(result.audio).toEqual({ sampleRate: 8000, channels: 1, samples: 808 });
  expect(state.audioAdd).toHaveBeenCalledTimes(2);
  expect(state.sampleClose).toHaveBeenCalledTimes(2);
  expect(state.audioClose).toHaveBeenCalledOnce();
});

it("cancels output and disposes every owner on failure or interruption without final success", async () => {
  const progress = vi.fn(),
    failure = new Error("encoder failed");
  state.videoAdd.mockRejectedValueOnce(failure);
  await expect(
    exportMotionVideo(fixture(), { compositionId: "comp", onProgress: progress }),
  ).rejects.toBe(failure);
  expect(progress).not.toHaveBeenCalled();
  expect(state.targetAbort).toHaveBeenCalledOnce();
  expect(state.cancel).toHaveBeenCalledOnce();
  expect(state.sessionDispose).toHaveBeenCalledOnce();
  expect(state.mixerDispose).toHaveBeenCalledOnce();
  expect(state.targetDispose).toHaveBeenCalledWith(failure);
});

it("retains the original failure alongside cleanup errors", async () => {
  const failure = new Error("render failed"),
    cleanup = new Error("GPU close failed");
  state.render.mockRejectedValueOnce(failure);
  state.sessionDispose.mockRejectedValueOnce(cleanup);
  await expect(exportMotionVideo(fixture(), { compositionId: "comp" })).rejects.toMatchObject({
    errors: [failure, cleanup],
  });
  expect(state.mixerDispose).toHaveBeenCalledOnce();
  expect(state.targetDispose).toHaveBeenCalledOnce();
});

it("still cancels the encoder when aborting a broken output writer fails", async () => {
  const failure = new Error("encoder failed"),
    writerFailure = new Error("writer abort failed");
  state.videoAdd.mockRejectedValueOnce(failure);
  state.targetAbort.mockRejectedValueOnce(writerFailure);
  const result = exportMotionVideo(fixture(), { compositionId: "comp" });
  await expect(result).rejects.toMatchObject({
    errors: [failure, { errors: [writerFailure] }],
  });
  expect(state.cancel).toHaveBeenCalledOnce();
  expect(state.sessionDispose).toHaveBeenCalledOnce();
  expect(state.mixerDispose).toHaveBeenCalledOnce();
  expect(state.targetDispose).toHaveBeenCalledOnce();
});

it("honors cancellation during encoding once and never reports final success", async () => {
  const controller = new AbortController(),
    reason = new DOMException("Canceled", "AbortError"),
    progress = vi.fn();
  state.videoAdd.mockImplementationOnce(async () => controller.abort(reason));
  await expect(
    exportMotionVideo(fixture(), {
      compositionId: "comp",
      signal: controller.signal,
      onProgress: progress,
    }),
  ).rejects.toBe(reason);
  expect(state.frames).toHaveLength(1);
  expect(state.targetAbort).toHaveBeenCalledTimes(1);
  expect(state.cancel).toHaveBeenCalledTimes(1);
  expect(state.sessionDispose).toHaveBeenCalledOnce();
  expect(state.mixerDispose).toHaveBeenCalledOnce();
  expect(progress.mock.calls.some(([value]) => value.fraction === 1)).toBe(false);
});
