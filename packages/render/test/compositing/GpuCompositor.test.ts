import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, type Asset } from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { clearSourceCache } from "../../src/surface/sources";
import { installCanvasMock } from "../canvas-fixture";
import { makeGpuRenderer } from "../gpu-fixture";
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
