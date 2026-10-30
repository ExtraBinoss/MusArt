import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPage, type Composition } from "@musart/core";
import type { MediaSourceResolver } from "@musart/render";
import { OrthographicCamera, Scene, Texture, type WebGPURenderer } from "three/webgpu";
import { PlaneResources } from "../../../src/canvas/render/plane-resources";

const gpu = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));
vi.mock("@musart/render", async (original) => ({
  ...(await original<typeof import("@musart/render")>()),
  gpuTextureLimit: () => 8192,
  GpuCompositor: class {
    render = gpu.render;
    dispose = gpu.dispose;
    stats = () => ({});
    retainedFrame = () => null;
    releasePresentation() {}
  },
}));
const result = () => ({ texture: new Texture(), width: 320, height: 200 });
const origin = { projectId: "project-a", revision: 4 };
const presentation = { origin, canonical: false };
function fixture(renderer?: WebGPURenderer, resolverFor?: (id: string) => MediaSourceResolver) {
  const target =
    renderer ??
    ({
      domElement: document.createElement("canvas"),
      backend: {},
      compileAsync: vi.fn().mockResolvedValue(undefined),
      getRenderTarget: () => null,
    } as unknown as WebGPURenderer);
  const resources = new PlaneResources(target, undefined, undefined, resolverFor);
  const release = resources.activate(new Scene(), new OrthographicCamera(), vi.fn());
  return { renderer: target, resources, release };
}
async function ticks() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
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
  gpu.render.mockReset().mockResolvedValue(result());
  gpu.dispose.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("slow playback finishes useful frames while bounding the queue to the latest time", async () => {
  const d = fixture(),
    base = createPage({ id: "page", width: 320, height: 200 }),
    assets = {};
  let complete!: (frame: ReturnType<typeof result>) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  d.resources.submit(base, assets, presentation, undefined, true);
  await frame();
  const options = gpu.render.mock.calls[0]![2] as { signal: AbortSignal; canRender: () => boolean };
  for (let index = 1; index <= 20; index++)
    d.resources.submit({ ...base, name: `Frame ${index}` }, assets, presentation, undefined, true);
  expect(options.signal.aborted).toBe(false);
  expect(options.canRender()).toBe(true);
  complete(result());
  await ticks();
  d.resources.present();
  expect(d.renderer.domElement.style.visibility).toBe("visible");
  expect(d.renderer.domElement.dataset.presentationReady).toBe("true");
  expect(d.renderer.domElement.dataset.rendererReady).toBe("false");
  expect(d.renderer.domElement.dataset.renderedRevision).toBe("1");
  await frame();
  d.resources.present();
  expect(gpu.render).toHaveBeenCalledTimes(2);
  expect((gpu.render.mock.calls[1]![0] as Composition).name).toBe("Frame 20");
  expect(d.renderer.domElement.dataset.rendererReady).toBe("true");
  expect(d.renderer.domElement.dataset.renderedRevision).toBe("21");
  expect(JSON.parse(d.renderer.domElement.dataset.gpuStats!)).toMatchObject({
    completed: 2,
    pending: 0,
  });
  d.release();
  await d.resources.dispose();
});

test.each(["paused seek", "document edit", "project switch", "asset replacement"])(
  "%s cancels older playback and prevents its late presentation",
  async (change) => {
    const d = fixture(),
      base = createPage({ id: "page" }),
      assets = {};
    let complete!: (frame: ReturnType<typeof result>) => void;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    d.resources.submit(base, assets, presentation, undefined, true);
    await frame();
    const options = gpu.render.mock.calls[0]![2] as {
      signal: AbortSignal;
      canRender: () => boolean;
    };
    const nextOrigin =
      change === "document edit"
        ? { ...origin, revision: 5 }
        : change === "project switch"
          ? { ...origin, projectId: "project-b" }
          : origin;
    d.resources.submit(
      base,
      change === "asset replacement" ? {} : assets,
      { origin: nextOrigin, canonical: false },
      undefined,
      change !== "paused seek",
    );
    expect(options.signal.aborted).toBe(true);
    expect(options.canRender()).toBe(false);
    complete(result());
    await ticks();
    d.resources.present();
    expect(d.renderer.domElement.dataset.presentationReady).not.toBe("true");
    await frame();
    d.resources.present();
    expect(d.renderer.domElement.dataset.rendererReady).toBe("true");
    d.release();
    await d.resources.dispose();
  },
);

test("the resolver is captured from the submitted project before React updates props", async () => {
  const a: MediaSourceResolver = { resolveOriginal: vi.fn() },
    b: MediaSourceResolver = { resolveOriginal: vi.fn() };
  const resolverFor = vi.fn((id: string) => (id === "project-a" ? a : b)),
    d = fixture(undefined, resolverFor);
  const base = createPage();
  d.resources.submit(base, {}, presentation);
  await frame();
  expect(gpu.render.mock.calls[0]![2].mediaResolver).toBe(a);
  d.resources.submit(
    base,
    {},
    { origin: { projectId: "project-b", revision: 0 }, canonical: true },
  );
  await frame();
  expect(gpu.render.mock.calls[1]![2].mediaResolver).toBe(b);
  expect(resolverFor.mock.calls).toEqual([["project-a"], ["project-b"]]);
  d.release();
  await d.resources.dispose();
});

test("an older resource's delayed disposal cannot hide the new canvas owner", async () => {
  const first = fixture();
  first.resources.submit(createPage(), {});
  await frame();
  first.resources.present();
  let finish!: () => void;
  gpu.dispose.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const closing = first.resources.dispose();
  const next = fixture(first.renderer);
  next.resources.submit(createPage(), {});
  await frame();
  next.resources.present();
  const stats = next.renderer.domElement.dataset.gpuStats;
  expect(next.renderer.domElement.style.visibility).toBe("visible");
  finish();
  await closing;
  expect(next.renderer.domElement.style.visibility).toBe("visible");
  expect(next.renderer.domElement.dataset.rendererReady).toBe("true");
  expect(next.renderer.domElement.dataset.gpuStats).toBe(stats);
  first.release();
  next.release();
  await next.resources.dispose();
});
