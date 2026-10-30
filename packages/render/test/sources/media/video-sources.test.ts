import { beforeEach, expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  compileMotion,
  evaluateMotion,
  type VideoAsset,
} from "@musart/core";
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
  cursorFactory: vi.fn(),
  proxyRead: vi.fn(),
  retire: vi.fn(async () => {}),
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
    retireStream = fake.retire;
    settle = async () => {};
    stats = () => ({});
  },
}));
vi.mock("../../../src/sources/video/proxy/cache", () => ({
  VideoProxyCache: class {
    configure() {}
    retain() {}
    read = fake.proxyRead;
    stats = () => ({});
    dispose() {}
  },
}));
vi.mock("../../../src/sources/video/playback", () => ({
  VideoPlaybackCursor: class {
    constructor(options: unknown) {
      fake.cursorFactory(options);
    }
    metadata = fake.metadata;
    requestFrame = fake.reads;
    dispose = fake.dispose;
    readTime = () => null;
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
  fake.proxyRead.mockReset();
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
      Array.from({ length: 9 }, (_, i) => [
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

it("plays five originals with one shared decoded budget and no duplicate poster decoders", async () => {
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new MediaVideoSources(renderer, cache, 64);
  const resolver = { resolveOriginal: vi.fn(async () => new Blob(["v"])) };
  const assets = Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => [`v${i}`, { ...asset, id: `v${i}`, originalId: `o${i}` }]),
  );
  await sources.prepare(
    "page",
    Object.keys(assets).map((id) => ({ ...layer, id, assetId: id })),
    assets,
    { mediaResolver: resolver, mediaMode: "playback" },
  );
  expect(fake.factory).not.toHaveBeenCalled();
  expect(fake.cursorFactory).toHaveBeenCalledTimes(5);
  expect(
    new Set(fake.cursorFactory.mock.calls.map(([options]) => options.decodedBudget)).size,
  ).toBe(1);
  expect(resolver.resolveOriginal).toHaveBeenCalledTimes(5);
  await sources.dispose();
  expect(fake.dispose).toHaveBeenCalledTimes(5);
  cache.clear();
});
it("uses session proxies only for explicit interactive previews and returns to originals for exact rendering", async () => {
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new MediaVideoSources(renderer, cache, 64);
  const original = new Blob(["v"]),
    proxyBlob = new Blob(["p"]);
  const resolver = { resolveOriginal: async () => original },
    videoProxy = { read: () => false, subscribe: () => () => {} };
  const proxyAsset = {
    ...asset,
    originalId: "private-proxy",
    contentRevision: "proxy-profile",
    width: 1,
    height: 1,
  };
  fake.proxyRead.mockReturnValue({ asset: proxyAsset, original: proxyBlob });
  fake.metadata.mockResolvedValueOnce({ width: 1, height: 1 });
  await sources.prepare(
    "page",
    [layer],
    { video: asset },
    { mediaResolver: resolver, videoProxy, mediaMode: "preview" },
  );
  expect(fake.factory.mock.calls[0]![0].original).toBe(proxyBlob);
  await sources.prepare(
    "page",
    [layer],
    { video: asset },
    { mediaResolver: resolver, videoProxy, mediaMode: "exact" },
  );
  expect(fake.proxyRead).toHaveBeenCalledOnce();
  expect(fake.factory.mock.calls[1]![0].original).toBe(original);
  expect(fake.retire).toHaveBeenCalledWith("page:layer");
  expect((sources.image(layer.id).image as { width: number }).width).toBe(2);
  await sources.dispose();
  cache.clear();
});

it("pins the initial playback variant across late proxy completion or cache eviction until preview", async () => {
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new MediaVideoSources(renderer, cache, 64);
  const resolver = { resolveOriginal: async () => new Blob(["v"]) },
    videoProxy = { read: () => false, subscribe: () => () => {} };
  const page = createPage({
    id: "page",
    layers: [layer],
    motion: {
      version: 1,
      initialized: true,
      mode: "motion",
      duration: { value: 2, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "track",
          layerId: layer.id,
          start: { value: 0, rate: 1 },
          end: { value: 2, rate: 1 },
          properties: [],
          media: { sourceIn: { value: 0, rate: 1 }, mute: true, volume: 1 },
        },
      ],
    },
  });
  const program = compileMotion(createProject({ pages: [page], assets: { video: asset } }), {
    compositionId: "page",
  });
  const proxy = {
    asset: { ...asset, originalId: "proxy", width: 1, height: 1 },
    original: new Blob(["p"]),
  };
  const prepare = (time: number, mode: "preview" | "playback") =>
    sources.prepare(
      "page",
      [layer],
      { video: asset },
      {
        mediaResolver: resolver,
        videoProxy,
        mediaMode: mode,
        motionFrame: evaluateMotion(program, { value: time, rate: 1 }),
      },
    );
  fake.proxyRead.mockReturnValue(undefined);
  await prepare(0, "playback");
  fake.proxyRead.mockReturnValue(proxy);
  await prepare(1, "playback");
  expect(fake.cursorFactory).toHaveBeenCalledOnce(); // A late proxy cannot replace the original mid-Play.
  fake.metadata.mockResolvedValue({ width: 1, height: 1 });
  await prepare(0, "preview");
  await prepare(0, "playback");
  fake.proxyRead.mockReturnValue(undefined); // Ready-cache eviction cannot replace an active proxy either.
  await prepare(1, "playback");
  expect(fake.cursorFactory).toHaveBeenCalledTimes(2);
  expect(fake.cursorFactory.mock.calls[1]![0].original).toBe(proxy.original);
  await sources.dispose();
  cache.clear();
});
