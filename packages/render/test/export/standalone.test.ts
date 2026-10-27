import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage } from "@musart/core";
import { Texture } from "three/webgpu";
import {
  createRenderSession,
  disposeExportRenderers,
  snapshotComposition,
} from "../../src/export/standalone";
const gpu = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
  constructors: vi.fn(),
  render: vi.fn(),
  compositorDispose: vi.fn(),
  present: vi.fn(),
  presentationDispose: vi.fn(),
  compositorConstructors: vi.fn(),
}));
vi.mock("three/webgpu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three/webgpu")>();
  return {
    ...actual,
    WebGPURenderer: class {
      domElement = document.createElement("canvas");
      toneMapping = 0;
      outputColorSpace = "";
      constructor(options: unknown) {
        gpu.constructors(options);
      }
      init = gpu.init;
      dispose = gpu.dispose;
      setPixelRatio = vi.fn();
      setClearColor = vi.fn();
    },
  };
});
vi.mock("../../src/compositing/GpuCompositor", () => ({
  GpuCompositor: class {
    constructor(_renderer: unknown, options: unknown) {
      gpu.compositorConstructors(options);
    }
    render = gpu.render;
    dispose = gpu.compositorDispose;
    stats = () => ({ readbacks: 0, frames: 2 });
  },
}));
vi.mock("../../src/export/presentation", () => ({
  GpuPresentation: class {
    constructor(private readonly renderer: { domElement: HTMLCanvasElement }) {}
    render(frame: { width: number; height: number }) {
      this.renderer.domElement.width = frame.width;
      this.renderer.domElement.height = frame.height;
      gpu.present(frame);
    }
    dispose = gpu.presentationDispose;
  },
}));
let transfer: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await disposeExportRenderers();
  gpu.init.mockReset().mockResolvedValue(undefined);
  gpu.dispose.mockReset().mockResolvedValue(undefined);
  gpu.constructors.mockClear();
  gpu.compositorConstructors.mockClear();
  gpu.render
    .mockReset()
    .mockResolvedValue({ texture: new Texture(), width: 16, height: 12, premultiplied: true });
  gpu.compositorDispose.mockReset().mockResolvedValue(undefined);
  gpu.present.mockClear();
  gpu.presentationDispose.mockClear();
  transfer = vi.fn();
  close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
    transferFromImageBitmap: transfer,
  })) as unknown as HTMLCanvasElement["getContext"]);
});
afterEach(async () => {
  await disposeExportRenderers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("GPU-backed durable export snapshots", () => {
  it("copies GPU pixels through ImageBitmap and bitmaprenderer without CPU arrays", async () => {
    const canvas = await snapshotComposition(createPage(), {}, {});
    expect([canvas.width, canvas.height]).toEqual([16, 12]);
    expect(transfer).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(gpu.present).toHaveBeenCalledWith(expect.objectContaining({ width: 16 }));
    const again = await snapshotComposition(createPage(), {}, {});
    expect(again).not.toBe(canvas);
    expect(gpu.init).toHaveBeenCalledOnce();
    await snapshotComposition(createPage(), {}, { forceWebGL: true });
    expect(gpu.init).toHaveBeenCalledTimes(2);
  });
  it("retries renderer initialization on the same Three WebGL2 fallback and can recover after failures", async () => {
    gpu.init.mockRejectedValueOnce(new Error("no adapter"));
    await snapshotComposition(createPage(), {}, { forceWebGL: false });
    expect(gpu.constructors).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceWebGL: true }),
    );
    await disposeExportRenderers();
    gpu.init.mockRejectedValueOnce(new Error("webgpu")).mockRejectedValueOnce(new Error("webgl"));
    await expect(snapshotComposition(createPage(), {}, {})).rejects.toThrow("webgl");
    await expect(snapshotComposition(createPage(), {}, {})).resolves.toBeInstanceOf(
      HTMLCanvasElement,
    );
  });
  it("closes an unconsumed bitmap and rejects unavailable bitmap-transfer support", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(snapshotComposition(createPage(), {}, {})).rejects.toThrow("transfert GPU");
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes an unconsumed bitmap when browser transfer throws", async () => {
    transfer.mockImplementationOnce(() => {
      throw new Error("transfer failed");
    });
    await expect(snapshotComposition(createPage(), {}, {})).rejects.toThrow("transfer failed");
    expect(close).toHaveBeenCalledOnce();
  });
  it("finishes a pending snapshot before disposing its context", async () => {
    const snapshot = snapshotComposition(createPage(), {}, {});
    const disposal = disposeExportRenderers();
    await expect(snapshot).resolves.toBeInstanceOf(HTMLCanvasElement);
    await disposal;
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
});
it("isolates snapshot caches by resolver/backend and retains only two idle contexts", async () => {
  const first = vi.fn(async () => new ArrayBuffer(0)),
    second = vi.fn(async () => new ArrayBuffer(0)),
    page = createPage();
  await snapshotComposition(page, {}, { fontResolver: first });
  await snapshotComposition(page, {}, { fontResolver: first });
  expect(gpu.init).toHaveBeenCalledOnce();
  expect(gpu.compositorConstructors).toHaveBeenLastCalledWith(
    expect.objectContaining({ fontResolver: first }),
  );
  await snapshotComposition(page, {}, { fontResolver: first, forceWebGL: true });
  await snapshotComposition(page, {}, { fontResolver: second });
  expect(gpu.init).toHaveBeenCalledTimes(3);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  expect(gpu.compositorConstructors).toHaveBeenLastCalledWith(
    expect.objectContaining({ fontResolver: second }),
  );
  await snapshotComposition(page, {}, { fontResolver: first, forceWebGL: true });
  expect(gpu.init).toHaveBeenCalledTimes(3);
  await snapshotComposition(page, {}, { fontResolver: first });
  expect(gpu.init).toHaveBeenCalledTimes(4);
  expect(gpu.dispose).toHaveBeenCalledTimes(2);
});
it("does not evict active snapshot contexts under pressure from other resolvers", async () => {
  type Frame = { texture: Texture; width: number; height: number; premultiplied: boolean };
  let finish!: (frame: Frame) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = vi.fn(async () => new ArrayBuffer(0)),
    page = createPage(),
    pending = snapshotComposition(page, {}, { fontResolver: first });
  await vi.waitFor(() => expect(gpu.render).toHaveBeenCalledOnce());
  await snapshotComposition(page, {}, { fontResolver: async () => new ArrayBuffer(0) });
  await snapshotComposition(page, {}, { fontResolver: async () => new ArrayBuffer(0) });
  expect(gpu.dispose).not.toHaveBeenCalled();
  finish({ texture: new Texture(), width: 16, height: 12, premultiplied: true });
  await expect(pending).resolves.toBeInstanceOf(HTMLCanvasElement);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  await snapshotComposition(page, {}, { fontResolver: first });
  expect(gpu.init).toHaveBeenCalledTimes(3);
});
it("does not let completed old snapshots replace a fresh cache entry after clearing", async () => {
  type Frame = { texture: Texture; width: number; height: number; premultiplied: boolean };
  let finish!: (frame: Frame) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const resolver = vi.fn(async () => new ArrayBuffer(0)),
    page = createPage(),
    pending = snapshotComposition(page, {}, { fontResolver: resolver });
  await vi.waitFor(() => expect(gpu.render).toHaveBeenCalledOnce());
  const cleared = disposeExportRenderers();
  await snapshotComposition(page, {}, { fontResolver: resolver });
  finish({ texture: new Texture(), width: 16, height: 12, premultiplied: true });
  await Promise.all([pending, cleared]);
  await snapshotComposition(page, {}, { fontResolver: resolver });
  expect(gpu.init).toHaveBeenCalledTimes(2);
  expect(gpu.dispose).toHaveBeenCalledOnce();
});

it("holds a retained native GPU canvas inside the atomic consumer queue without bitmap copies", async () => {
  const fontResolver = vi.fn(async () => new ArrayBuffer(0));
  const session = createRenderSession({ forceWebGL: true, maxBytes: 1024, fontResolver });
  expect(session.stats()).toBeNull();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const first = session.withCanvasFrame(createPage(), {}, async (canvas) => {
    entered();
    await hold;
    return canvas;
  });
  await ready;
  const second = session.render(createPage(), {});
  await Promise.resolve();
  expect(gpu.render).toHaveBeenCalledOnce();
  release();
  const canvas = await first;
  expect(await second).toBe(canvas);
  expect(gpu.render).toHaveBeenCalledTimes(2);
  expect(gpu.init).toHaveBeenCalledOnce();
  expect(gpu.compositorConstructors).toHaveBeenCalledWith(
    expect.objectContaining({ fontResolver }),
  );
  expect(createImageBitmap).not.toHaveBeenCalled();
  expect(session.stats()).toMatchObject({ readbacks: 0 });
  await session.dispose();
  await expect(session.render(createPage(), {})).rejects.toThrow("fermé");
});
it("shares disposal completion and releases a retained context only once", async () => {
  const session = createRenderSession();
  await session.render(createPage(), {});
  const first = session.dispose(),
    second = session.dispose();
  expect(second).toBe(first);
  await Promise.all([first, second]);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  expect(gpu.presentationDispose).toHaveBeenCalledOnce();
  expect(session.stats()).toBeNull();
});
it("does not create a background context when the activity gate has become busy", async () => {
  const session = createRenderSession({ sourceMaxEdge: 640 });
  await expect(
    session.withCanvasFrame(createPage(), {}, () => {}, { canRender: () => false }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(gpu.init).not.toHaveBeenCalled();
  await session.dispose();
});
