import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { createLayer, createPage, createProject, EditorEngine, recordSession } from "@musart/core";
import { exportReplayVideo } from "../../../src/services/animation/export-video";

const probe = vi.hoisted(() => ({
  encode: vi.fn(),
  add: vi.fn(),
  start: vi.fn(),
  finalize: vi.fn(),
  cancel: vi.fn(),
  close: vi.fn(),
  dispose: vi.fn(),
  frames: [] as unknown[],
  contexts: 0,
  sourceCanvases: [] as HTMLCanvasElement[],
  failRender: false,
}));
vi.mock("@musart/render", () => ({
  createRenderSession: () => {
    probe.contexts++;
    const canvas = document.createElement("canvas");
    return {
      dispose: probe.dispose,
      withCanvasFrame: async (
        page: unknown,
        _assets: unknown,
        consume: (canvas: HTMLCanvasElement) => Promise<void>,
      ) => {
        probe.frames.push(page);
        if (probe.failRender) throw new Error("GPU failed");
        await consume(canvas);
      },
    };
  },
}));
vi.mock("mediabunny", () => ({
  canEncodeVideo: probe.encode,
  Quality: class {
    constructor(public level: string) {}
  },
  BufferTarget: class {
    buffer: ArrayBuffer | null = null;
  },
  Mp4OutputFormat: class {
    mimeType = "video/mp4";
  },
  WebMOutputFormat: class {
    mimeType = "video/webm";
  },
  CanvasSource: class {
    constructor(canvas: HTMLCanvasElement) {
      probe.sourceCanvases.push(canvas);
    }
    add = probe.add;
    close = probe.close;
  },
  Output: class {
    constructor(private options: { target: { buffer: ArrayBuffer | null } }) {}
    addVideoTrack() {}
    start = probe.start;
    cancel = probe.cancel;
    finalize = async () => {
      await probe.finalize();
      this.options.target.buffer = new Uint8Array([1, 2, 3]).buffer;
    };
  },
}));
function replay() {
  const shape = createLayer("rectangle", { id: "shape", x: 0, width: 8, height: 8 });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 32, height: 32, layers: [shape] })] }),
  );
  let time = 0;
  const recording = recordSession(engine, { now: () => time });
  time = 1000;
  engine.execute({ type: "updateLayers", ids: [shape.id], patch: { x: 16 } });
  return recording.stop();
}
const options = { duration: 1, fps: 2, scale: 1, container: "auto" as const };
beforeEach(() => {
  vi.clearAllMocks();
  probe.frames = [];
  probe.sourceCanvases = [];
  probe.contexts = 0;
  probe.failRender = false;
  probe.encode.mockResolvedValue(true);
  probe.add.mockResolvedValue(undefined);
  probe.finalize.mockResolvedValue(undefined);
});
describe("native canvas video export", () => {
  it("evaluates exact endpoint frames and encodes on one retained canvas with explicit timestamps", async () => {
    const progress = vi.fn();
    const blob = await exportReplayVideo(replay(), { ...options, onProgress: progress });
    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(3);
    expect(probe.frames).toHaveLength(2);
    expect(probe.frames).toMatchObject([{ layers: [{ x: 0 }] }, { layers: [{ x: 16 }] }]);
    expect(probe.contexts).toBe(1);
    expect(probe.sourceCanvases).toHaveLength(1);
    expect(probe.add.mock.calls.map((args) => args.slice(0, 2))).toEqual([
      [0, 0.5],
      [0.5, 0.5],
    ]);
    expect(progress.mock.calls.map(([fraction]) => fraction)).toEqual([0.5, 1]);
    expect(probe.start).toHaveBeenCalledOnce();
    expect(probe.finalize).toHaveBeenCalledOnce();
    expect(probe.close).toHaveBeenCalledOnce();
    expect(probe.dispose).toHaveBeenCalledOnce();
    expect(probe.cancel).not.toHaveBeenCalled();
  });
  it("awaits encoder backpressure before rendering the next frame", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    probe.add.mockImplementationOnce(() => pending);
    const result = exportReplayVideo(replay(), options);
    await waitFor(() => expect(probe.add).toHaveBeenCalledOnce());
    expect(probe.frames).toHaveLength(1);
    release();
    await result;
    expect(probe.frames).toHaveLength(2);
  });
  it("chooses WebM when AVC is unavailable and does not silently change an explicit MP4 request", async () => {
    probe.encode.mockImplementation((codec: string) => Promise.resolve(codec === "vp8"));
    expect((await exportReplayVideo(replay(), options)).type).toBe("video/webm");
    expect(probe.encode.mock.calls.map(([codec]) => codec)).toEqual(["avc", "vp9", "vp8"]);
    await expect(
      exportReplayVideo(replay(), { ...options, container: "mp4" }),
    ).rejects.toMatchObject({ code: "noCodec" });
    expect(probe.contexts).toBe(1);
  });
  it("rejects invalid options, missing pages and pre-cancelled work before creating a GPU context", async () => {
    for (const invalid of [
      { duration: NaN },
      { duration: 0.9 },
      { duration: 30.1 },
      { duration: 1, fps: 1 },
      { fps: 1.5 },
      { fps: 0 },
      { scale: 5 },
      { scale: 0 },
      { container: "gif" },
    ])
      await expect(
        exportReplayVideo(replay(), { ...options, ...invalid } as typeof options),
      ).rejects.toMatchObject({ code: "invalidOptions" });
    await expect(
      exportReplayVideo(replay(), { ...options, pageId: "missing" }),
    ).rejects.toMatchObject({ code: "missingPage" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportReplayVideo(replay(), { ...options, signal: controller.signal }),
    ).rejects.toThrow();
    expect(probe.contexts).toBe(0);
  });
  it("rejects empty history and preserves a fractional final duration without FPS snapping", async () => {
    await expect(exportReplayVideo({ ...replay(), events: [] }, options)).rejects.toMatchObject({
      code: "emptyHistory",
    });
    expect(probe.contexts).toBe(0);
    await exportReplayVideo(replay(), { ...options, duration: 1.01, fps: 2 });
    expect(probe.frames).toHaveLength(3);
    expect(probe.add.mock.calls[2]![0]).toBe(1);
    expect(probe.add.mock.calls[2]![1]).toBeCloseTo(0.01);
    expect(probe.frames[2]).toMatchObject({ layers: [{ x: 16 }] });
  });
  it("cancels and releases every resource on encoder failure, GPU failure or user cancellation", async () => {
    probe.add.mockRejectedValueOnce(new Error("encode failed"));
    await expect(exportReplayVideo(replay(), options)).rejects.toThrow("encode failed");
    expect(probe.cancel).toHaveBeenCalledOnce();
    expect(probe.dispose).toHaveBeenCalledOnce();
    probe.failRender = true;
    await expect(exportReplayVideo(replay(), options)).rejects.toThrow("GPU failed");
    expect(probe.dispose).toHaveBeenCalledTimes(2);
    probe.failRender = false;
    const controller = new AbortController();
    probe.add.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve();
    });
    await expect(
      exportReplayVideo(replay(), { ...options, signal: controller.signal, container: "webm" }),
    ).rejects.toThrow();
    expect(probe.finalize).not.toHaveBeenCalled();
    expect(probe.dispose).toHaveBeenCalledTimes(3);
  });
  it("releases the GPU session even when cancellation cleanup itself rejects", async () => {
    probe.add.mockRejectedValueOnce(new Error("encode"));
    probe.cancel.mockRejectedValueOnce(new Error("cancel failed"));
    await expect(exportReplayVideo(replay(), options)).rejects.toThrow("cancel failed");
    expect(probe.dispose).toHaveBeenCalledOnce();
  });
});
