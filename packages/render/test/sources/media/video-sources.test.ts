import { beforeEach, expect, it, vi } from "vitest";
import { createLayer, type VideoAsset } from "@musart/core";
import { GpuResourceCache } from "../../../src/cache/GpuResourceCache";
import { MediaVideoSources } from "../../../src/sources/media/video-sources";
import { makeGpuRenderer } from "../../gpu-fixture";
import type { VideoFrameLease } from "../../../src/sources/video/model";
const fake = vi.hoisted(() => ({
  reads: vi.fn(),
  metadata: vi.fn(),
  dispose: vi.fn(),
  rasterize: vi.fn(async (lease: VideoFrameLease) => {
    lease.release();
  }),
  clear: vi.fn(),
  factory: vi.fn(),
}));
vi.mock("../../../src/sources/video/source", () => ({
  createVideoFrameSource: (...args: unknown[]) => {
    fake.factory(...args);
    return {
      metadata: fake.metadata,
      requestFrame: fake.reads,
      dispose: fake.dispose,
      stats: () => ({}),
    };
  },
}));
vi.mock("../../../src/sources/video/rasterizer", () => ({
  VideoRasterizer: class {
    passes = 0;
    render = fake.rasterize;
    clear = fake.clear;
    dispose = async () => {};
    retainStreams = async () => {};
    settle = async () => {};
    stats = () => ({});
  },
}));
const asset: VideoAsset = {
  id: "video",
  kind: "video",
  originalId: "original",
  contentRevision: "revision",
  name: "Video",
  mime: "video/mp4",
  width: 2,
  height: 2,
  byteLength: 1,
  duration: { value: 2, rate: 1 },
  firstTimestamp: { value: 0, rate: 1 },
  timeResolution: 1000,
  orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
};
const layer = createLayer("video", { id: "layer", assetId: asset.id });
const lease = () =>
  ({
    timestamp: { value: 0, rate: 1 },
    duration: { value: 1, rate: 1 },
    rotation: 0,
    flip: false,
    pixelAspectRatio: { numerator: 1, denominator: 1 },
    release: vi.fn(),
  }) as unknown as VideoFrameLease;
beforeEach(() => {
  vi.clearAllMocks();
  fake.metadata.mockResolvedValue({ width: 2, height: 2 });
  fake.dispose.mockResolvedValue(undefined);
  fake.reads.mockImplementation(async () => lease());
});
it("lazily resolves one original, shares its decoder and reuses GPU copies for identical PTS coverage", async () => {
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new MediaVideoSources(renderer, cache, 64);
  const resolver = { resolveOriginal: vi.fn(async () => new Blob(["v"])) },
    assets = { video: asset },
    layers = [layer, { ...layer, id: "copy" }];
  await sources.prepare("page", layers, assets, { mediaResolver: resolver });
  expect(resolver.resolveOriginal).toHaveBeenCalledTimes(1);
  expect(fake.factory).toHaveBeenCalledTimes(1);
  expect(fake.reads).toHaveBeenCalledTimes(2);
  expect(fake.rasterize).toHaveBeenCalledTimes(2);
  const original = sources.image(layer.id),
    stamp = sources.stamp(layer.id);
  await sources.prepare("page", layers, assets, { mediaResolver: resolver });
  expect(sources.image(layer.id)).toBe(original);
  expect(sources.stamp(layer.id)).toBe(stamp);
  expect(fake.reads).toHaveBeenCalledTimes(2);
  expect(cache.stats().cacheBytes).toBe(32);
  await sources.prepare("page", [], assets, { mediaResolver: resolver });
  expect(fake.dispose).toHaveBeenCalledTimes(1);
  await sources.dispose();
  cache.clear();
});
it("rejects absent resolvers/stale native frames and represents real source gaps transparently", async () => {
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new MediaVideoSources(renderer, cache, 64),
    assets = { video: asset };
  await expect(sources.prepare("page", [layer], assets, {})).rejects.toThrow("resolver");
  const resolver = { resolveOriginal: vi.fn(async () => new Blob(["v"])) };
  let current = true;
  const stale = lease();
  fake.reads.mockImplementationOnce(async () => {
    current = false;
    return stale;
  });
  await expect(
    sources.prepare("page", [layer], assets, { mediaResolver: resolver, canRender: () => current }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(stale.release).toHaveBeenCalledTimes(1);
  expect(fake.rasterize).not.toHaveBeenCalled();
  current = true;
  fake.reads.mockResolvedValueOnce(null);
  await sources.prepare("page", [layer], assets, { mediaResolver: resolver });
  expect(fake.clear).toHaveBeenCalledTimes(1);
  expect(sources.image(layer.id).isTexture).toBe(true);
  await sources.dispose();
  cache.clear();
});
it("enforces active-original budgets before any media read and restores leases on GPU-budget failure", async () => {
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(15),
    sources = new MediaVideoSources(renderer, cache, 64);
  const resolver = { resolveOriginal: vi.fn(async () => new Blob(["v"])) },
    assets = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [
        `video${i}`,
        { ...asset, id: `video${i}`, originalId: `original${i}` },
      ]),
    );
  await expect(
    sources.prepare(
      "page",
      Object.keys(assets).map((id) => ({ ...layer, id, assetId: id })),
      assets,
      { mediaResolver: resolver },
    ),
  ).rejects.toThrow("budget");
  expect(resolver.resolveOriginal).not.toHaveBeenCalled();
  const borrowed = lease();
  fake.reads.mockResolvedValueOnce(borrowed);
  await expect(
    sources.prepare("page", [layer], { video: asset }, { mediaResolver: resolver }),
  ).rejects.toThrow("Budget");
  expect(borrowed.release).toHaveBeenCalledTimes(1);
  await sources.dispose();
  cache.clear();
});
it("never releases a native frame whose already-submitted GPU copy becomes stale", async () => {
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new MediaVideoSources(renderer, cache, 64);
  const resolver = { resolveOriginal: async () => new Blob(["v"]) },
    borrowed = lease();
  let current = true;
  fake.reads.mockResolvedValueOnce(borrowed);
  fake.rasterize.mockImplementationOnce(async () => {
    current = false;
  }); // GPU owner retains until its acknowledgement.
  await expect(
    sources.prepare(
      "page",
      [layer],
      { video: asset },
      { mediaResolver: resolver, canRender: () => current },
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(borrowed.release).not.toHaveBeenCalled();
  borrowed.release();
  await sources.dispose();
  cache.clear();
});
