import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayer, createPage, type Asset } from "@musart/core";
import { Texture } from "three/webgpu";
import { TextureSources } from "../../src/surface/TextureSources";
import { GpuResourceCache } from "../../src/cache/GpuResourceCache";
import { clearSourceCache } from "../../src/surface/sources";
import { installCanvasMock } from "../canvas-fixture";
const asset: Asset = {
  id: "image",
  name: "original",
  width: 1280,
  height: 960,
  mime: "image/png",
  dataUrl: "original:pixels",
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
describe("GPU texture preparation", () => {
  it("uploads decoded originals directly once and shares a texture across transformed layers", async () => {
    const cache = new GpuResourceCache();
    const sources = new TextureSources(cache);
    const layer = createLayer("image", { assetId: "image", width: 320, height: 220 });
    const page = createPage({ layers: [layer, { ...layer, id: "second", x: 200 }] });
    await sources.prepare(page, { image: asset });
    const texture = sources.image("image");
    await sources.prepare(page, { image: asset });
    expect(sources.image("image")).toBe(texture);
    expect(sources.uploads).toBe(1);
    expect(cache.stats().cacheBytes).toBe(1280 * 960 * 4);
    expect(texture.generateMipmaps).toBe(false);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.getImageData).not.toHaveBeenCalled();
    cache.clear();
  });
  it("leaves text to the analytical GPU source without creating raster textures", async () => {
    const sources = new TextureSources(new GpuResourceCache());
    await sources.prepare(createPage({ layers: [createLayer("text")] }), {});
    expect(sources.uploads).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.getImageData).not.toHaveBeenCalled();
  });
  it("prepares alpha masks and rejects missing assets rather than substituting empty pixels", async () => {
    const sources = new TextureSources(new GpuResourceCache());
    const layer = createLayer("rectangle", {
      mask: { assetId: "image", enabled: true, inverted: false },
    });
    await sources.prepare(createPage({ layers: [layer] }), { image: asset });
    expect(sources.image("image").isTexture).toBe(true);
    await expect(sources.prepare(createPage({ layers: [layer] }), {})).rejects.toThrow("Ressource");
    expect(() => sources.image("missing")).toThrow("introuvable");
    expect(() => sources.image(null)).toThrow("introuvable");
    await sources.prepare(createPage({ layers: [{ ...layer, visible: false }] }), {});
    await sources.prepare(
      createPage({ layers: [{ ...layer, mask: { ...layer.mask!, enabled: false } }] }),
      {},
    );
  });
});
it("uploads original image and mask dimensions even when their authored dimensions are smaller", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn());
  const decoded: { naturalWidth: number; naturalHeight: number }[] = [];
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      set src(value: string) {
        this.naturalWidth = value === "mask:pixels" ? 1600 : 2048;
        this.naturalHeight = value === "mask:pixels" ? 800 : 1536;
        decoded.push(this);
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  const cache = new GpuResourceCache(),
    sources = new TextureSources(cache),
    dispose = vi.spyOn(Texture.prototype, "dispose"),
    layer = createLayer("image", {
      width: 100,
      height: 75,
      assetId: "image",
      mask: { assetId: "mask", enabled: true, inverted: false },
    }),
    page = createPage({ layers: [layer] }),
    assets = { image: asset, mask: { ...asset, id: "mask", dataUrl: "mask:pixels" } };
  await sources.prepare(page, assets);
  expect(sources.image("image").image).toBe(decoded[0]);
  expect(sources.image("mask").image).toBe(decoded[1]);
  expect(cache.stats().cacheBytes).toBe((2048 * 1536 + 1600 * 800) * 4);
  await sources.prepare(page, assets);
  expect(sources.uploads).toBe(2);
  expect(decoded).toHaveLength(2);
  expect(createImageBitmap).not.toHaveBeenCalled();
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(context.getImageData).not.toHaveBeenCalled();
  cache.clear();
  expect(dispose).toHaveBeenCalledTimes(2);
});
it("rejects an original that exceeds the GPU budget and disposes its texture without shrinking it", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn());
  const cache = new GpuResourceCache(asset.width * asset.height * 4 - 1),
    sources = new TextureSources(cache),
    dispose = vi.spyOn(Texture.prototype, "dispose"),
    page = createPage({ layers: [createLayer("image", { assetId: "image" })] });
  await expect(sources.prepare(page, { image: asset })).rejects.toThrow("Budget mémoire GPU");
  expect(cache.stats()).toMatchObject({ cacheBytes: 0, entries: 0 });
  expect(sources.uploads).toBe(0);
  expect(() => sources.image("image")).toThrow("introuvable");
  expect(dispose).toHaveBeenCalledOnce();
  expect(createImageBitmap).not.toHaveBeenCalled();
  expect(context.getImageData).not.toHaveBeenCalled();
});
it("reports original decode failures and can prepare a corrected source without a CPU fallback", async () => {
  const cache = new GpuResourceCache(),
    sources = new TextureSources(cache),
    page = createPage({ layers: [createLayer("image", { assetId: "image" })] });
  await expect(sources.prepare(page, { image: { ...asset, dataUrl: "bad" } })).rejects.toThrow(
    "Image illisible",
  );
  expect(cache.stats().cacheBytes).toBe(0);
  await sources.prepare(page, { image: asset });
  expect(sources.uploads).toBe(1);
  expect(cache.stats().cacheBytes).toBe(asset.width * asset.height * 4);
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(context.getImageData).not.toHaveBeenCalled();
  cache.clear();
});
