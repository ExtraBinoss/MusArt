import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayer, createPage, type Asset } from "@musart/core";
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
it("prepares bounded native image bitmaps once for preview contexts and closes them with GPU cache eviction", async () => {
  const cache = new GpuResourceCache(),
    close = vi.fn(),
    bitmap = { width: 640, height: 480, close };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const sources = new TextureSources(cache, { maxEdge: 640 }),
    layer = createLayer("image", { assetId: "image" }),
    page = createPage({ layers: [layer] });
  await sources.prepare(page, { image: asset });
  expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), {
    resizeWidth: 640,
    resizeHeight: 480,
    resizeQuality: "high",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
    imageOrientation: "none",
  });
  expect(cache.stats().cacheBytes).toBe(640 * 480 * 4);
  await sources.prepare(page, { image: asset });
  expect(createImageBitmap).toHaveBeenCalledOnce();
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(context.getImageData).not.toHaveBeenCalled();
  cache.clear();
  expect(close).toHaveBeenCalledOnce();
  expect(() => new TextureSources(cache, { maxEdge: 0 })).toThrow("texture limit");
});
it("uses unflipped resized bitmaps for WebGPU and rejects failed native preparation without CPU fallbacks", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi
      .fn()
      .mockRejectedValueOnce(new Error("decode"))
      .mockResolvedValue({ width: 640, height: 480, close: vi.fn() }),
  );
  const cache = new GpuResourceCache(),
    sources = new TextureSources(cache, { maxEdge: 640 }),
    page = createPage({ layers: [createLayer("image", { assetId: "image" })] });
  await expect(sources.prepare(page, { image: asset })).rejects.toThrow("decode");
  await sources.prepare(page, { image: asset });
  expect(createImageBitmap).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ imageOrientation: "none" }),
  );
  cache.clear();
});
