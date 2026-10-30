import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, type Composition } from "@musart/core";
import { OrthographicCamera, Scene, Texture, type WebGPURenderer } from "three/webgpu";
import { PlaneResources } from "../../../src/canvas/render/plane-resources";
import { CanonicalPresentation } from "../../../src/state/session/canonical-presentation";
const gpu = vi.hoisted(() => ({
  render: vi.fn(),
  dispose: vi.fn(),
  constructors: vi.fn(),
  stats: vi.fn(),
  retainedFrame: vi.fn(),
  releasePresentation: vi.fn(),
}));
vi.mock("@musart/render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@musart/render")>()),
  gpuTextureLimit: () => 8192,
  GpuCompositor: class {
    constructor(renderer: unknown) {
      gpu.constructors(renderer);
    }
    render = gpu.render;
    dispose = gpu.dispose;
    stats = gpu.stats;
    retainedFrame = gpu.retainedFrame;
    releasePresentation = gpu.releasePresentation;
  },
}));
const proxyActivity = expect.objectContaining({
  read: expect.any(Function),
  subscribe: expect.any(Function),
});
function result(width = 600, height = 500) {
  return { texture: new Texture(), width, height };
}
function fixture(backend = {}) {
  const renderer = {
    domElement: document.createElement("canvas"),
    backend,
    compileAsync: vi.fn().mockResolvedValue(undefined),
    getRenderTarget: vi.fn(() => null),
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
  gpu.retainedFrame.mockReset().mockReturnValue(null);
  gpu.releasePresentation.mockClear();
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
  it("installs a retained artboard immediately but acknowledges only its real draw, independent of an older pending job", async () => {
    const d = fixture(),
      port = new CanonicalPresentation(),
      publisher = port.acquire();
    const release = d.resources.activate(
      d.scene,
      d.camera,
      d.invalidate,
      d.error,
      undefined,
      publisher,
    );
    const a = createPage({ width: 320, height: 200 }),
      b = createPage({ width: 200, height: 320 });
    const origin = { projectId: "project", revision: 1 },
      first = result(320, 200);
    gpu.render.mockResolvedValueOnce(first);
    d.resources.submit(a, {}, { origin, canonical: true });
    await frame();
    d.resources.present();
    expect(d.renderer.domElement.dataset.displayInitialized).toBe("true");
    let finish!: (value: ReturnType<typeof result>) => void;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    d.resources.submit(b, {}, { origin, canonical: true });
    expect(d.renderer.domElement.style.visibility).toBe("hidden");
    expect(d.renderer.domElement.dataset.presentationReady).toBe("false");
    await frame();
    const canRender = gpu.render.mock.calls.at(-1)![2].canRender;
    expect(canRender()).toBe(true);
    gpu.retainedFrame.mockImplementation((page: Composition) => (page === a ? first : null));
    d.resources.submit(a, {}, { origin, canonical: true });
    expect(d.resources.sample.value).toBe(first.texture);
    expect(d.resources.mesh.visible).toBe(true);
    expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
    expect(port.ready(origin)).toBe(false);
    expect(canRender()).toBe(false);
    d.resources.present();
    expect(port.ready(origin)).toBe(true);
    expect(d.renderer.domElement.style.visibility).toBe("visible");
    expect(d.renderer.domElement.dataset.pageId).toBe(a.id);
    finish(result(200, 320));
    await ticks();
    expect(d.resources.sample.value).toBe(first.texture);
    expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(gpu.constructors).toHaveBeenCalledOnce();
    release();
    publisher.release();
    await d.resources.dispose();
  });
  it("keeps initial-loading history separate from a cold destination and cannot mark an old failed page ready", async () => {
    const d = fixture(),
      release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error);
    d.resources.submit(createPage(), {});
    await frame();
    d.resources.present();
    gpu.render.mockRejectedValueOnce(new Error("destination font failed"));
    const destination = createPage();
    d.resources.submit(destination, {});
    expect(d.renderer.domElement.dataset.displayInitialized).toBe("true");
    expect(d.renderer.domElement.style.visibility).toBe("hidden");
    await frame();
    d.resources.present();
    expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
    expect(d.renderer.domElement.dataset.presentationReady).toBe("false");
    expect(d.error).toHaveBeenCalledWith(
      "destination font failed",
      "Error: destination font failed",
    );
    d.resources.submit(destination, {});
    await frame();
    d.resources.present();
    expect(d.renderer.domElement.style.visibility).toBe("visible");
    expect(d.renderer.domElement.dataset.pageId).toBe(destination.id);
    release();
    await d.resources.dispose();
  });
  it("hides a same-ID page belonging to a replacement project until its own prepared frame is drawn", async () => {
    const d = fixture(),
      release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error);
    const page = createPage({ id: "shared-page" });
    d.resources.submit(page, {}, { origin: { projectId: "old", revision: 1 }, canonical: true });
    await frame();
    d.resources.present();
    d.resources.submit(
      { ...page, background: "#000000" },
      {},
      { origin: { projectId: "new", revision: 2 }, canonical: true },
    );
    expect(d.resources.mesh.visible).toBe(false);
    expect(d.renderer.domElement.style.visibility).toBe("hidden");
    expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
    await frame();
    d.resources.present();
    expect(d.renderer.domElement.dataset.rendererReady).toBe("true");
    release();
    await d.resources.dispose();
  });
  it("signals useful canonical presentation only after the display scene draw and restores owned callbacks", async () => {
    const d = fixture(),
      port = new CanonicalPresentation(),
      publisher = port.acquire(),
      origin = { projectId: "A", revision: 1 },
      previous = vi.fn();
    d.scene.onAfterRender = previous;
    const release = d.resources.activate(
        d.scene,
        d.camera,
        d.invalidate,
        d.error,
        undefined,
        publisher,
      ),
      after = d.scene.onAfterRender,
      page = createPage({ width: 320, height: 200 });
    d.resources.submit(page, {}, { origin, canonical: true });
    await frame();
    expect(port.ready(origin)).toBe(false);
    Reflect.apply(after, d.scene, [d.renderer, d.scene, d.camera, null]);
    expect(previous).toHaveBeenCalledOnce();
    expect(port.ready(origin)).toBe(true);
    expect(d.renderer.domElement.dataset.canonicalRevision).toBe("1");
    d.resources.submit(page, {}, { origin, canonical: false });
    await frame();
    Reflect.apply(after, d.scene, [d.renderer, d.scene, d.camera, null]);
    expect(port.ready(origin)).toBe(false);
    release();
    publisher.release();
    await d.resources.dispose();
    expect(d.scene.onAfterRender).toBe(previous);
  });
  it("does not acknowledge other renderer/target draws or replace a later scene callback owner", async () => {
    const d = fixture(),
      port = new CanonicalPresentation(),
      publisher = port.acquire(),
      origin = { projectId: "A", revision: 1 },
      release = d.resources.activate(
        d.scene,
        d.camera,
        d.invalidate,
        d.error,
        undefined,
        publisher,
      );
    d.resources.submit(createPage(), {}, { origin, canonical: true });
    await frame();
    Reflect.apply(d.scene.onAfterRender, d.scene, [{}, d.scene, d.camera, null]);
    expect(port.ready(origin)).toBe(false);
    vi.mocked(d.renderer.getRenderTarget).mockReturnValueOnce({} as never);
    Reflect.apply(d.scene.onAfterRender, d.scene, [d.renderer, d.scene, d.camera, null]);
    expect(port.ready(origin)).toBe(false);
    const replacement = vi.fn();
    d.scene.onAfterRender = replacement;
    release();
    publisher.release();
    await d.resources.dispose();
    expect(d.scene.onAfterRender).toBe(replacement);
  });
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
  it("tracks minification and quantized magnification while publishing the actual scale", async () => {
    const d = fixture(),
      density = vi.fn();
    const release = d.resources.activate(d.scene, d.camera, d.invalidate, d.error, density);
    const page = createPage({ width: 192, height: 140 });
    gpu.render
      .mockResolvedValueOnce(result(192, 140))
      .mockResolvedValueOnce(result(96, 70))
      .mockResolvedValueOnce(result(768, 560));
    d.resources.setDensity(NaN);
    d.resources.submit(page, {});
    await frame();
    expect(density).toHaveBeenLastCalledWith(1, 192, 140);
    d.resources.setDensity(0.5);
    await frame();
    expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(gpu.render).toHaveBeenLastCalledWith(
      page,
      {},
      {
        scale: 0.5,
        canRender: expect.any(Function),
        mediaResolver: undefined,
        motionFrame: undefined,
        mediaMode: "preview",
        signal: expect.any(AbortSignal),
        videoProxy: proxyActivity,
      },
    );
    expect(density).toHaveBeenLastCalledWith(0.5, 96, 70);
    d.resources.setDensity(0.50000000001);
    await frame();
    expect(gpu.render).toHaveBeenCalledTimes(2);
    d.resources.setDensity(4);
    await frame();
    expect(gpu.render).toHaveBeenLastCalledWith(
      page,
      {},
      {
        scale: 4,
        canRender: expect.any(Function),
        mediaResolver: undefined,
        motionFrame: undefined,
        mediaMode: "preview",
        signal: expect.any(AbortSignal),
        videoProxy: proxyActivity,
      },
    );
    expect(density).toHaveBeenLastCalledWith(4, 768, 560);
    d.resources.setDensity(4);
    d.resources.setDensity(-1);
    await frame();
    expect(gpu.render).toHaveBeenCalledTimes(3);
    release();
    await d.resources.dispose();
    d.resources.setDensity(2);
    expect(gpu.render).toHaveBeenCalledTimes(3);
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
    expect(gpu.render).toHaveBeenCalledWith(
      page,
      {},
      {
        scale: 1,
        canRender: expect.any(Function),
        mediaResolver: undefined,
        motionFrame: undefined,
        mediaMode: "preview",
        signal: expect.any(AbortSignal),
        videoProxy: proxyActivity,
      },
    );
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
    expect(d.error).toHaveBeenCalledWith("device lost", "Error: device lost");
    vi.mocked(d.renderer.compileAsync).mockRejectedValueOnce("compile failure");
    d.resources.submit(createPage(), {});
    await frame();
    expect(d.error).toHaveBeenCalledWith("compile failure", "compile failure");
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
    expect(d.error).toHaveBeenCalledWith(
      "WebGPU device lost: Lost test device",
      "Error: WebGPU device lost: Lost test device",
    );
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
