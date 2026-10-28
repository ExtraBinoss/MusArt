import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type Asset,
} from "@musart/core";
import { InstancedMesh, Mesh, RenderTarget, type Scene } from "three/webgpu";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { clearSourceCache } from "../../src/surface/sources";
import { installCanvasMock } from "../canvas-fixture";
import { makeGpuRenderer } from "../gpu-fixture";
import { outlineFont } from "../text-fixture";
const asset: Asset = {
  id: "image",
  name: "photo",
  mime: "image/png",
  width: 320,
  height: 220,
  dataUrl: "image:original",
};
let context: ReturnType<typeof installCanvasMock>;
beforeEach(() => {
  context = installCanvasMock();
  clearSourceCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("retained GPU document graph", () => {
  it("reuses exact certified frames across artboards without draws and rejects mutable, foreign or overwritten inputs", async () => {
    const { renderer } = makeGpuRenderer(),
      graph = new GpuCompositor(renderer);
    const engine = new EditorEngine(
      createProject({
        pages: [createPage({ width: 64, height: 64 }), createPage({ width: 80, height: 60 })],
      }),
    );
    const project = engine.getSnapshot().project,
      a = project.pages[0]!,
      b = project.pages[1]!;
    expect(graph.retainedFrame(a, project.assets, 1)).toBeNull();
    const first = await graph.render(a, project.assets);
    graph.releasePresentation();
    await graph.render(b, project.assets);
    const passes = graph.stats().passes;
    expect(graph.retainedFrame(a, project.assets, 1)).toBe(first);
    expect(graph.stats().passes).toBe(passes);
    expect(graph.retainedFrame(a, project.assets, 2)).toBeNull();
    expect(graph.retainedFrame(a, Object.freeze({}), 1)).toBeNull();
    expect(graph.retainedFrame(Object.freeze(structuredClone(a)), project.assets, 1)).toBeNull();
    engine.execute({ type: "updatePage", patch: { background: "#ff0000" } });
    const changed = engine.getSnapshot().project;
    await graph.render(changed.pages[0]!, changed.assets);
    expect(graph.retainedFrame(a, project.assets, 1)).toBeNull();
    expect(graph.retainedFrame(changed.pages[0]!, changed.assets, 1)).not.toBeNull();
    await graph.dispose();
    expect(graph.retainedFrame(changed.pages[0]!, changed.assets, 1)).toBeNull();
  });
  it("evicts inactive cached frames within the same GPU budget instead of retaining an extra texture pool", async () => {
    const { renderer } = makeGpuRenderer(),
      graph = new GpuCompositor(renderer, { maxBytes: 150000 });
    const project = new EditorEngine(
      createProject({
        pages: [createPage({ width: 100, height: 100 }), createPage({ width: 100, height: 100 })],
      }),
    ).getSnapshot().project;
    await graph.render(project.pages[0]!, project.assets);
    graph.releasePresentation();
    await graph.render(project.pages[1]!, project.assets);
    expect(graph.stats().cacheBytes).toBeLessThanOrEqual(150000);
    expect(graph.retainedFrame(project.pages[0]!, project.assets, 1)).toBeNull();
    expect(graph.retainedFrame(project.pages[1]!, project.assets, 1)).not.toBeNull();
    await graph.dispose();
    expect(graph.stats().targets).toBe(0);
  });
  it("keeps fifty images with ordered effects on GPU and performs no CPU pixel transfer", async () => {
    const { renderer, fake } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer);
    const layers = Array.from({ length: 50 }, (_, index) =>
      createLayer("image", {
        assetId: "image",
        width: 32,
        height: 22,
        x: index * 2,
        effects: [createEffect(index % 2 ? "dither" : "ascii")],
      }),
    );
    const page = createPage({ width: 300, height: 200, layers });
    const output = await graph.render(page, { image: asset });
    const cold = graph.stats();
    expect(output.texture.isTexture).toBe(true);
    expect(output.premultiplied).toBe(true);
    expect(cold.readbacks).toBe(0);
    expect(cold.uploads).toBe(1);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.getImageData).not.toHaveBeenCalled();
    expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
    expect(await graph.render(page, { image: asset })).toBe(output);
    expect(graph.stats().passes).toBe(cold.passes);
    const moved = {
      ...page,
      layers: layers.map((layer, index) => (index === 0 ? { ...layer, x: 10 } : layer)),
    };
    await graph.render(moved, { image: asset });
    expect(graph.stats().uploads).toBe(1);
    expect(graph.stats().passes - cold.passes).toBe(3);
    expect(graph.stats().cacheBytes).toBeLessThan(graph.stats().maxBytes);
    await graph.dispose();
    expect(graph.stats().targets).toBe(0);
  });
  it("isolates nested groups, masks, blend modes, effects and HQ scale", async () => {
    const { renderer, fake } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer);
    const group = createLayer("group", {
      width: 100,
      height: 80,
      effects: [createEffect("dither"), createEffect("contrast")],
      mask: { assetId: "image", enabled: true, inverted: true },
    });
    const shape = createLayer("ellipse", { parentId: group.id, width: 50, height: 40 });
    const multiply = createLayer("rectangle", {
      width: 40,
      height: 30,
      blendMode: "multiply",
      opacity: 0.5,
    });
    const screen = createLayer("rectangle", {
      width: 30,
      height: 30,
      blendMode: "screen",
      mask: { assetId: "image", enabled: true, inverted: false },
    });
    const overlay = createLayer("rectangle", { width: 20, height: 20, blendMode: "overlay" });
    const text = createLayer("text", { width: 30, height: 20, text: "A" });
    const hidden = createLayer("image", { assetId: "missing", visible: false });
    const page = createPage({
      width: 200,
      height: 160,
      layers: [group, shape, multiply, screen, overlay, text, hidden],
    });
    const output = await graph.render(page, { image: asset }, { scale: 2 });
    expect([output.width, output.height]).toEqual([400, 320]);
    expect(graph.stats().passes).toBeGreaterThan(10);
    expect(fake.getRenderTarget()).toBeNull();
    expect(fake.autoClear).toBe(true);
    const stats = graph.stats();
    await graph.render(
      {
        ...page,
        layers: page.layers.map((layer) =>
          layer.id === shape.id ? { ...layer, fill: "#ee0000" } : layer,
        ),
      },
      { image: asset },
      { scale: 2 },
    );
    expect(graph.stats().uploads).toBe(stats.uploads);
    expect(graph.stats().passes).toBeGreaterThan(stats.passes);
    await graph.dispose();
  });
  it("reuses shape paint when only an effect uniform changes", async () => {
    const { renderer } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer);
    const effect = createEffect("dither");
    const layer = createLayer("rectangle", { effects: [effect] });
    const page = createPage({ layers: [layer] });
    await graph.render(page, {});
    const before = graph.stats();
    await graph.render(
      { ...page, layers: [{ ...layer, effects: [{ ...effect, amount: 0.3 }] }] },
      {},
    );
    expect(graph.stats().passes - before.passes).toBe(4);
    expect(graph.stats().uploads).toBe(0);
    await graph.dispose();
  });
  it("serializes jobs, survives rejected preparation and cancels late work before GPU submission", async () => {
    const { renderer, fake } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer);
    const page = createPage({ layers: [createLayer("image", { assetId: "image" })] });
    const failed = graph.render(page, {});
    const next = graph.render(page, { image: asset });
    await expect(failed).rejects.toThrow("Ressource");
    await expect(next).resolves.toHaveProperty("texture");
    await graph.dispose();
    await graph.dispose();
    await expect(graph.render(page, {})).rejects.toThrow("fermé");
    const canceled = new GpuCompositor(renderer);
    const previous = Object.getOwnPropertyDescriptor(document, "fonts");
    let finish: (() => void) | undefined;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        load: vi.fn(),
        ready: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      },
    });
    try {
      const job = canceled.render(createPage(), {});
      await Promise.resolve();
      const dispose = canceled.dispose();
      const count = fake.render.mock.calls.length;
      finish?.();
      await expect(job).rejects.toThrow("fermé");
      await dispose;
      expect(fake.render.mock.calls.length).toBe(count);
    } finally {
      if (previous) Object.defineProperty(document, "fonts", previous);
      else Reflect.deleteProperty(document, "fonts");
    }
  });
  it("rejects oversized allocations before drawing and never disposes the caller renderer", async () => {
    const { renderer, fake } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer, { maxBytes: 200 });
    await expect(graph.render(createPage(), {}, { scale: 0 })).rejects.toThrow("Échelle");
    await expect(graph.render(createPage({ width: 20, height: 20 }), {})).rejects.toThrow("Budget");
    await graph.dispose();
    expect(fake.dispose).not.toHaveBeenCalled();
  });
});
it("renders retained vector geometry, transformed referenced masks and truthful document color spaces", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer);
  const vector = createLayer("vector", {
      id: "vector",
      width: 12,
      height: 12,
      vector: { viewBox: "0 0 12 12", path: "M0 0h12v12H0z" },
    }),
    mask = createLayer("group", {
      id: "mask",
      x: 3,
      y: 1,
      width: 8,
      height: 8,
      maskSource: true,
      opacity: 0.5,
    }),
    child = createLayer("rectangle", {
      id: "mask-child",
      parentId: mask.id,
      width: 8,
      height: 8,
      x: 0,
      y: 0,
    });
  const target = {
    ...vector,
    mask: { layerId: "mask", mode: "luminance" as const, enabled: true, inverted: false },
  };
  const page = createPage({ width: 20, height: 20, layers: [target, mask, child] });
  await graph.render(page, {});
  expect(graph.stats().vectorParses).toBe(1);
  await graph.render({ ...page, layers: [{ ...target, fill: "#ff0000" }, mask, child] }, {});
  expect(graph.stats().vectorParses).toBe(1);
  await graph.render({ ...page, layers: [target, { ...mask, visible: false }, child] }, {});
  await graph.render(
    { ...page, colorSpace: "display-p3", layers: [createLayer("image", { assetId: asset.id })] },
    { image: asset },
  );
  await graph.render({ ...page, colorSpace: "cmyk-proof" }, {});
  expect(graph.stats().readbacks).toBe(0);
  expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
  await expect(
    graph.render(
      {
        ...page,
        layers: [{ ...target, mask: { layerId: "absent", enabled: true, inverted: false } }],
      },
      {},
    ),
  ).rejects.toThrow("introuvable");
  await expect(
    graph.render(
      { ...page, layers: [{ ...target, mask: { enabled: true, inverted: false } }] },
      {},
    ),
  ).rejects.toThrow("absente");
  await graph.dispose();
});
it("defers background GPU submission when user input becomes active during async source preparation", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer);
  await expect(graph.render(createPage(), {}, { canRender: () => false })).rejects.toMatchObject({
    name: "AbortError",
  });
  let checks = 0;
  await expect(
    graph.render(createPage(), {}, { canRender: () => ++checks < 2 }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fake.render).not.toHaveBeenCalled();
  await graph.dispose();
});
it("prepares custom font bytes through the injected resolver and retains their GPU outlines", async () => {
  const bytes = outlineFont().toArrayBuffer(),
    fontResolver = vi.fn(async () => bytes.slice(0));
  const { renderer, fake } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer, { fontResolver });
  const layer = createLayer("text", {
      text: "A",
      fontFamily: "custom:face-sha",
      width: 100,
      height: 100,
    }),
    page = createPage({ width: 100, height: 100, layers: [layer] });
  await graph.render(page, {});
  await graph.render({ ...page, layers: [{ ...layer, fill: "#ff0000" }] }, {});
  expect(fontResolver).toHaveBeenCalledOnce();
  expect(fontResolver).toHaveBeenCalledWith(
    layer.fontFamily,
    layer.fontWeight,
    expect.any(AbortSignal),
  );
  expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
  expect(context.getImageData).not.toHaveBeenCalled();
  await graph.dispose();
});

it("composes ten thousand plain primitives with two document targets and one bounded instanced draw", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer);
  const layers = Array.from({ length: 10_000 }, (_, index) =>
    createLayer(index % 2 ? "ellipse" : "rectangle", {
      id: `primitive-${index}`,
      x: index % 100,
      y: Math.floor(index / 100),
      width: 4,
      height: 4,
    }),
  );
  const page = createPage({ width: 128, height: 128, layers });
  const output = await graph.render(page, {}),
    cold = graph.stats();
  expect(cold).toMatchObject({
    passes: 3,
    targets: 2,
    uploads: 0,
    primitiveDraws: 1,
    primitiveInstances: 10_000,
  });
  expect(cold.cacheBytes).toBeLessThan(3_000_000);
  expect(cold.primitiveBytes).toBeGreaterThan(1_000_000);
  expect(await graph.render(page, {})).toBe(output);
  expect(graph.stats().passes).toBe(cold.passes);
  await graph.render(
    {
      ...page,
      layers: layers.map((layer, index) => (index === 0 ? { ...layer, fill: "#ff0000" } : layer)),
    },
    {},
  );
  expect(graph.stats().passes - cold.passes).toBe(3);
  expect(graph.stats().targets).toBe(2);
  expect(graph.stats().primitiveBytes).toBe(cold.primitiveBytes);
  expect(fake.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
  await graph.dispose();
  expect(graph.stats()).toMatchObject({ targets: 0, primitiveBytes: 0, cacheBytes: 0 });
});
it("preserves contiguous source-over order around exact effect surfaces and reuses the same instanced mesh", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer),
    submissions: string[] = [],
    meshes = new Set<InstancedMesh>();
  fake.render.mockImplementation((scene: Scene) => {
    const mesh = scene.children[0];
    if (mesh instanceof InstancedMesh) {
      submissions.push(`primitive:${mesh.count}`);
      meshes.add(mesh);
    } else if (mesh instanceof Mesh && mesh.material.transparent)
      submissions.push(`texture:${scene.children.length}`);
  });
  const layers = [
    createLayer("rectangle"),
    createLayer("ellipse"),
    createLayer("rectangle", { effects: [createEffect("brightness", { amount: 0.5 })] }),
    createLayer("ellipse"),
  ];
  await graph.render(createPage({ width: 32, height: 32, layers }), {});
  expect(submissions).toEqual(["primitive:2", "texture:1", "primitive:1"]);
  expect(meshes.size).toBe(1);
  expect(graph.stats()).toMatchObject({ primitiveDraws: 2, primitiveInstances: 3 });
  await graph.dispose();
});
it("checks shared instance allocations against the hard GPU budget before replacing the last presentation", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer, { maxBytes: 2048 });
  const layer = createLayer("rectangle", { width: 4, height: 4 }),
    page = createPage({ width: 8, height: 8, layers: [layer] });
  const frame = await graph.render(page, {}),
    ownedTarget = fake.setRenderTarget.mock.calls
      .map(([target]) => target)
      .find((target): target is RenderTarget => target?.texture === frame.texture)!,
    dispose = vi.spyOn(ownedTarget, "dispose"),
    bytes = graph.stats().primitiveBytes;
  await expect(
    graph.render(
      {
        ...page,
        layers: Array.from({ length: 1000 }, (_, index) => ({ ...layer, id: `growth-${index}` })),
      },
      {},
    ),
  ).rejects.toThrow("Budget");
  expect(graph.stats().primitiveBytes).toBe(bytes);
  expect(dispose).not.toHaveBeenCalled();
  await graph.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
