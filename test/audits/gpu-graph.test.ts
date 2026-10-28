import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, type Asset } from "../../packages/core/src/index";
import { GpuCompositor } from "../../packages/render/src/compositing/GpuCompositor";
import { clearSourceCache } from "../../packages/render/src/surface/sources";
import { installCanvasMock } from "../../packages/render/test/canvas-fixture";
import { makeGpuRenderer } from "../../packages/render/test/gpu-fixture";

beforeEach(() => {
  installCanvasMock();
  clearSourceCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("independent retained GPU graph audit", () => {
  it("does not allocate original-image textures behind a hidden ancestor", async () => {
    const { renderer } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer, { maxBytes: 256 });
    const group = createLayer("group", { id: "hidden", visible: false, width: 2, height: 2 });
    const child = createLayer("image", {
      parentId: group.id,
      assetId: "large",
      width: 2,
      height: 2,
    });
    const asset: Asset = {
      id: "large",
      name: "Large hidden source",
      mime: "image/png",
      width: 100,
      height: 100,
      dataUrl: "data:image/png;base64,AAAA",
    };
    try {
      await expect(
        graph.render(createPage({ width: 2, height: 2, layers: [group, child] }), { large: asset }),
      ).resolves.toHaveProperty("texture");
      expect(graph.stats().uploads).toBe(0);
    } finally {
      await graph.dispose();
    }
  });
  it("includes shared effect scratch allocations in the advertised hard memory budget", async () => {
    const { renderer } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer, { maxBytes: 70 });
    const layer = createLayer("rectangle", {
      width: 2,
      height: 2,
      effects: [createEffect("dither"), createEffect("contrast")],
    });
    try {
      await expect(
        graph.render(createPage({ width: 2, height: 2, layers: [layer] }), {}),
      ).rejects.toThrow("Budget");
    } finally {
      await graph.dispose();
    }
  });
  it("retains the last presented output when an attempted larger frame exceeds its budget", async () => {
    const { renderer, fake } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer, { maxBytes: 300 });
    const page = createPage({
      width: 2,
      height: 2,
      layers: [createLayer("rectangle", { width: 2, height: 2 })],
    });
    try {
      const output = await graph.render(page, {});
      const target = fake.setRenderTarget.mock.calls
        .map(([target]) => target)
        .find((target) => target?.texture === output.texture)!;
      expect(target).toBeDefined();
      const disposed = vi.spyOn(target, "dispose");
      await expect(graph.render({ ...page, width: 20, height: 20 }, {})).rejects.toThrow("Budget");
      expect(disposed).not.toHaveBeenCalled();
    } finally {
      await graph.dispose();
    }
  });
  it("keeps every disposal caller pending until in-flight preparation has stopped", async () => {
    const previous = Object.getOwnPropertyDescriptor(document, "fonts");
    let finish!: () => void;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        load: vi.fn(),
        ready: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      },
    });
    const { renderer } = makeGpuRenderer();
    const graph = new GpuCompositor(renderer);
    const render = graph.render(createPage({ width: 2, height: 2 }), {});
    await Promise.resolve();
    const first = graph.dispose();
    const second = graph.dispose();
    let secondFinished = false;
    void second.then(() => {
      secondFinished = true;
    });
    try {
      await Promise.resolve();
      expect(secondFinished).toBe(false);
    } finally {
      finish();
      await Promise.all([first, second]);
      await expect(render).rejects.toThrow("fermé");
      if (previous) Object.defineProperty(document, "fonts", previous);
      else Reflect.deleteProperty(document, "fonts");
    }
  });
});
