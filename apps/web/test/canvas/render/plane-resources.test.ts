import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, type Composition } from "@musart/core";
import { OrthographicCamera, Scene, Texture, type WebGPURenderer } from "three/webgpu";
import { PlaneResources } from "../../../src/canvas/render/plane-resources";
const gpu = vi.hoisted(() => ({
  render: vi.fn(),
  dispose: vi.fn(),
  constructors: vi.fn(),
  stats: vi.fn(),
}));
vi.mock("@musart/render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@musart/render")>()),
  GpuCompositor: class {
    constructor(renderer: unknown) {
      gpu.constructors(renderer);
    }
    render = gpu.render;
    dispose = gpu.dispose;
    stats = gpu.stats;
  },
}));
function result(width = 600, height = 500) {
  return { texture: new Texture(), width, height };
}
function fixture(backend = {}) {
  const renderer = {
    domElement: document.createElement("canvas"),
    backend,
    compileAsync: vi.fn().mockResolvedValue(undefined),
  } as unknown as WebGPURenderer;
  const resources = new PlaneResources(renderer);
  const camera = new OrthographicCamera();
  const scene = new Scene();
  const invalidate = vi.fn();
  const error = vi.fn();
  return { renderer, resources, camera, scene, invalidate, error };
}
async function ticks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
async function frame() {
  await vi.runOnlyPendingTimersAsync();
  await ticks();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  gpu.render
    .mockReset()
    .mockImplementation(async (page: Composition) => result(page.width, page.height));
  gpu.dispose.mockReset().mockResolvedValue(undefined);
  gpu.constructors.mockClear();
  gpu.stats
    .mockReset()
    .mockReturnValue({ passes: 1, readbacks: 0, uploads: 1, targets: 2, cacheBytes: 100 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("direct GPU preview ownership and scheduling", () => {
  it("retains the last valid presentation throughout property and same-artboard size updates", async () => {
    const d = fixture(),
      release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error),
      page = createPage({ width: 600, height: 500 });
    d.resources.submit(page, {});
    await frame();
    d.resources.present();
    const lastTexture = d.resources.sample.value;
    let complete!: (value: ReturnType<typeof result>) => void;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    d.resources.submit({ ...page, width: 800, background: "#ff00ff" }, {});
    expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
    expect(d.renderer.domElement.dataset.presentationReady).toBe("true");
    expect(d.renderer.domElement.dataset.compositionPrepared).toBe("true");
    expect(d.resources.mesh.visible).toBe(true);
    expect(d.resources.sample.value).toBe(lastTexture);
    expect(d.resources.mesh.scale.x).toBe(600);
    await frame();
    complete(result(800, 500));
    await ticks();
    d.resources.present();
    expect(d.resources.mesh.visible).toBe(true);
    expect(d.resources.mesh.scale.x).toBe(800);
    expect(d.renderer.domElement.dataset.rendererReady).toBe("true");
    expect(d.renderer.domElement.dataset.presentationReady).toBe("true");
    release();
    await d.resources.dispose();
  });
  it("changes zoom density only across quality buckets and publishes the actual scale", async () => {
    const d = fixture(),
      density = vi.fn();
    const release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error, density);
    const page = createPage({ width: 192, height: 140 });
    d.resources.setDensity(NaN);
    d.resources.submit(page, {});
    await frame();
    expect(density).toHaveBeenLastCalledWith(1);
    d.resources.setDensity(0.5);
    await frame();
    expect(gpu.render).toHaveBeenCalledTimes(1);
    d.resources.setDensity(4);
    await frame();
    expect(gpu.render).toHaveBeenLastCalledWith(page, {}, { scale: 4 });
    expect(density).toHaveBeenLastCalledWith(4);
    d.resources.setDensity(4);
    d.resources.setDensity(-1);
    await frame();
    expect(gpu.render).toHaveBeenCalledTimes(2);
    release();
    await d.resources.dispose();
    d.resources.setDensity(2);
    expect(gpu.render).toHaveBeenCalledTimes(2);
  });
  it("shares the R3F renderer, presents texture directly, updates frustum and compiles display material only once", async () => {
    const d = fixture();
    const material = vi.spyOn(d.resources.material, "dispose");
    const geometry = vi.spyOn(d.resources.geometry, "dispose");
    const placeholder = vi.spyOn(d.resources.placeholder, "dispose");
    const release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error);
    const page = createPage({ width: 600, height: 500 });
    d.resources.submit(page, {});
    await frame();
    d.resources.present();
    expect(gpu.constructors).toHaveBeenCalledWith(d.renderer);
    expect(gpu.render).toHaveBeenCalledWith(page, {}, { scale: 1 });
    expect(d.renderer.domElement.dataset.rendererReady).toBe("true");
    expect(d.renderer.domElement.dataset.backend).toBe("webgpu");
    expect(d.resources.mesh.scale.toArray()).toEqual([600, 500, 1]);
    expect([d.camera.left, d.camera.right, d.camera.top, d.camera.bottom]).toEqual([
      -300, 300, 250, -250,
    ]);
    expect(d.resources.mesh.visible).toBe(true);
    d.resources.submit({ ...page, width: 300, height: 200 }, {});
    await frame();
    d.resources.present();
    expect([d.camera.left, d.camera.right, d.camera.top, d.camera.bottom]).toEqual([
      -150, 150, 100, -100,
    ]);
    expect(d.renderer.compileAsync).toHaveBeenCalledOnce();
    expect(JSON.parse(d.renderer.domElement.dataset.gpuStats!)).toMatchObject({
      readbacks: 0,
      submitted: 2,
      completed: 2,
      displayFrames: 2,
    });
    release();
    await ticks();
    expect(gpu.dispose).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(geometry).toHaveBeenCalledOnce();
    expect(placeholder).toHaveBeenCalledOnce();
    await d.resources.dispose();
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
  it("coalesces bursts into one latest pending request and never presents stale asynchronous outputs", async () => {
    const d = fixture();
    let finish: ((value: ReturnType<typeof result>) => void) | undefined;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error);
    const base = createPage({ width: 300, height: 200 });
    d.resources.submit({ ...base, name: "A" }, {});
    d.resources.submit({ ...base, name: "B" }, {});
    await frame();
    expect(gpu.render).toHaveBeenCalledTimes(1);
    expect(gpu.render.mock.calls[0]![0].name).toBe("B");
    d.resources.submit({ ...base, name: "C" }, {});
    d.resources.submit({ ...base, name: "D", width: 500 }, {});
    finish?.(result(300, 200));
    await ticks();
    expect(d.invalidate).not.toHaveBeenCalled();
    await frame();
    d.resources.present();
    expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(gpu.render.mock.calls[1]![0].name).toBe("D");
    expect(d.resources.mesh.scale.x).toBe(500);
    expect(JSON.parse(d.renderer.domElement.dataset.gpuStats!)).toMatchObject({
      coalesced: 2,
      completed: 1,
      pending: 0,
    });
    release();
    await ticks();
  });
  it("survives StrictMode effect replay, waits for active work, then disposes exactly once", async () => {
    const d = fixture({ isWebGLBackend: true });
    const material = vi.spyOn(d.resources.material, "dispose");
    let finish: ((value: ReturnType<typeof result>) => void) | undefined;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = d.resources.activate(d.scene, d.camera, d.invalidate);
    d.resources.submit(createPage(), {});
    first();
    first();
    const release = d.resources.activate(d.scene, d.camera, d.invalidate);
    await frame();
    expect(gpu.dispose).not.toHaveBeenCalled();
    release();
    await ticks();
    expect(gpu.dispose).toHaveBeenCalledOnce();
    expect(material).not.toHaveBeenCalled();
    finish?.(result());
    await ticks();
    await ticks();
    expect(gpu.dispose).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(d.renderer.domElement.dataset.backend).toBe("webgl");
    expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
    expect(() => d.resources.activate(d.scene, d.camera, d.invalidate)).toThrow("déjà libéré");
    d.resources.submit(createPage(), {});
    expect(gpu.render).toHaveBeenCalledTimes(1);
  });
  it("reports active render and compile failures, permits retry, and ignores errors after unmount", async () => {
    const d = fixture();
    const release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error);
    gpu.render.mockRejectedValueOnce(new Error("device lost"));
    d.resources.submit(createPage(), {});
    await frame();
    expect(d.error).toHaveBeenCalledWith("device lost");
    vi.mocked(d.renderer.compileAsync).mockRejectedValueOnce("compile failure");
    d.resources.submit(createPage(), {});
    await frame();
    expect(d.error).toHaveBeenCalledWith("compile failure");
    d.resources.submit(createPage(), {});
    await frame();
    d.resources.present();
    expect(d.renderer.domElement.dataset.rendererReady).toBe("true");
    release();
    await ticks();
    const late = fixture();
    let fail: ((reason: unknown) => void) | undefined;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const stop = late.resources.activate(late.scene, late.camera, late.invalidate, late.error);
    late.resources.submit(createPage(), {});
    await frame();
    stop();
    await ticks();
    fail?.(new Error("late"));
    await ticks();
    expect(late.error).not.toHaveBeenCalled();
  });
  it("cancels a scheduled frame on final release without submitting GPU work", async () => {
    const d = fixture();
    const release = d.resources.activate(d.scene, d.camera, d.invalidate);
    d.resources.submit(createPage(), {});
    release();
    await ticks();
    await frame();
    expect(gpu.render).not.toHaveBeenCalled();
  });
  it("preserves Three's device-loss callback, stops pending work and never reports a lost frame as ready", async () => {
    const d = fixture(),
      nativeLoss = vi.fn();
    d.renderer.onDeviceLost = nativeLoss;
    const release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error),
      page = createPage({ width: 320, height: 200 });
    d.resources.submit(page, {});
    await frame();
    d.resources.present();
    const texture = d.resources.sample.value;
    let complete!: (value: ReturnType<typeof result>) => void;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    d.resources.submit({ ...page, background: "#ff0000" }, {});
    await frame();
    const info = {
        api: "WebGPU" as const,
        message: "Lost test device",
        reason: "unknown",
        originalEvent: null,
      },
      handler = d.renderer.onDeviceLost;
    handler(info);
    expect(nativeLoss).toHaveBeenCalledWith(info);
    expect(nativeLoss.mock.contexts[0]).toBe(d.renderer);
    expect(d.error).toHaveBeenCalledWith("WebGPU device lost: Lost test device");
    expect(d.renderer.domElement.dataset.deviceLost).toBe("true");
    expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
    d.resources.submit({ ...page, background: "#00ff00" }, {});
    complete(result());
    await ticks();
    d.resources.present();
    expect(d.resources.sample.value).toBe(texture);
    expect(d.resources.mesh.visible).toBe(true);
    expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
    await frame();
    expect(gpu.render).toHaveBeenCalledTimes(2);
    release();
    await d.resources.dispose();
    expect(d.renderer.onDeviceLost).toBe(nativeLoss);
    handler(info);
    expect(d.error).toHaveBeenCalledOnce();
  });
  it("cancels not-yet-started renders on device loss and preserves a later callback owner at disposal", async () => {
    const d = fixture(),
      release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error);
    d.resources.submit(createPage(), {});
    d.renderer.onDeviceLost({
      api: "WebGL",
      message: "Context lost",
      reason: null,
      originalEvent: null,
    });
    await frame();
    expect(gpu.render).not.toHaveBeenCalled();
    const replacement = vi.fn();
    d.renderer.onDeviceLost = replacement;
    release();
    await d.resources.dispose();
    expect(d.renderer.onDeviceLost).toBe(replacement);
  });
  it("does not notify an unmounted owner if a device loss arrives before deferred disposal", async () => {
    const d = fixture(),
      release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error),
      handler = d.renderer.onDeviceLost;
    release();
    handler({ api: "WebGPU", message: "Late loss", reason: null, originalEvent: null });
    expect(d.error).not.toHaveBeenCalled();
    await d.resources.dispose();
  });
  it("publishes actual Three uniform/program counters without reading GPU pixels", async () => {
    const d = fixture();
    Object.defineProperty(d.renderer, "info", {
      value: {
        memory: {
          uniformBuffers: 12,
          uniformBuffersSize: 4096,
          programs: 3,
          renderTargets: 8,
        },
      },
    });
    const release = d.resources.activate(d.scene, d.camera, d.invalidate);
    expect(JSON.parse(d.renderer.domElement.dataset.gpuStats!)).toMatchObject({
      uniformBuffers: 12,
      uniformBytes: 4096,
      nodePrograms: 3,
      rendererTargets: 8,
    });
    release();
    await d.resources.dispose();
  });
});
