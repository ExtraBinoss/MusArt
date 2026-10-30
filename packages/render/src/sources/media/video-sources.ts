import { VideoSourceError } from "../video/errors";
import { VideoDecodedBudget, VIDEO_MAX_STREAMS } from "../video/budgets";
import type { VideoProxy } from "../video/proxy/model";
import { VideoProxyCache } from "../video/proxy/cache";
import {
  addMotionTime,
  assetOriginalIdentity,
  compareMotionTime,
  isVideoAsset,
  subtractMotionTime,
  type Asset,
  type Layer,
  type MotionTime,
  type VideoAsset,
} from "@musart/core";
import type { Texture, WebGPURenderer } from "three/webgpu";
import { GpuResourceCache } from "../../cache/GpuResourceCache";
import { LayerTargets } from "../../compositing/targets";
import type { RenderOptions } from "../../compositing/types";
import { createVideoFrameSource, type VideoFrameSource } from "../video/source";
import { VideoPlaybackCursor } from "../video/playback";
import { VideoRasterizer } from "../video/rasterizer";
import type { VideoFrameLease } from "../video/model";
import type { MediaSourceResolver } from "./model";
interface RasterFrame {
  readonly identity: string;
  readonly start: MotionTime;
  readonly end: MotionTime;
  readonly stamp: string;
}
interface SourceEntry {
  source: VideoFrameSource | null;
  sourceIdentity: string;
  playbackProxy?: VideoProxy | null;
  readonly original: Blob;
}
const MAX_ACTIVE_ORIGINALS = VIDEO_MAX_STREAMS;
function traceSpan(name: string, start: number): void {
  if (typeof performance.measure !== "function") return;
  performance.measure(name, { start, end: performance.now() });
  performance.clearMeasures(name); // The tracing event survives; runtime entry buffers stay bounded.
}

/** Bounded original/proxy source ownership, with native frames copied once into retained GPU targets. */
export class MediaVideoSources {
  uploads = 0;
  private readonly timings = {
    resolveMs: 0,
    metadataMs: 0,
    decodeMs: 0,
    prepareSubmissionMs: 0,
    requests: 0,
    gpuReuses: 0,
  };
  private readonly profileSamples: Partial<
    Record<"resolve" | "metadata" | "decode" | "prepareSubmission", number[]>
  > = {};
  private record(
    phase: keyof typeof this.profileSamples,
    start: number,
    id: string,
    enabled: boolean | undefined,
  ): void {
    if (!enabled) return;
    const samples = (this.profileSamples[phase] ??= []);
    samples.push(performance.now() - start);
    if (samples.length > 256) samples.shift();
    traceSpan(`musart.video.${phase}:${id}`, start);
  }
  private readonly sources = new Map<string, SourceEntry>();
  private readonly decodedBudget = new VideoDecodedBudget();
  private readonly proxies = new VideoProxyCache();
  private readonly playback = new Map<string, { identity: string; cursor: VideoPlaybackCursor }>();
  private readonly frames = new WeakMap<LayerTargets, RasterFrame>();
  private readonly prepared = new Map<string, { texture: Texture; stamp: string }>();
  private resolver: MediaSourceResolver | undefined;
  private rasterizer: VideoRasterizer | null = null;
  private closed = false;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
    private readonly maxDimension: number,
  ) {}

  private current(options: RenderOptions): void {
    if (this.closed) throw Error("Video texture sources are closed.");
    options.signal?.throwIfAborted();
    if (options.canRender && !options.canRender())
      throw new DOMException("Stale video rendering was rejected.", "AbortError");
  }
  private async original(asset: VideoAsset, options: RenderOptions): Promise<SourceEntry> {
    const identity = assetOriginalIdentity(asset),
      existing = this.sources.get(identity);
    if (existing) return existing;
    if (!options.mediaResolver)
      throw new VideoSourceError(
        "VIDEO_ORIGINAL_MISSING",
        "Video rendering requires an original media resolver.",
      );
    if (this.sources.size >= MAX_ACTIVE_ORIGINALS)
      throw Error("The active composition exceeds its eight-original decoder budget.");
    const started = performance.now();
    const original = await options.mediaResolver.resolveOriginal(asset, { signal: options.signal });
    this.timings.resolveMs += performance.now() - started;
    this.record("resolve", started, asset.id, options.profileVideo);
    this.current(options);
    if (!(original instanceof Blob) || original.size !== asset.byteLength)
      throw new VideoSourceError(
        "VIDEO_ORIGINAL_MISSING",
        "Video original size does not match its immutable description.",
      );
    const entry: SourceEntry = { source: null, sourceIdentity: "", original };
    this.sources.set(identity, entry);
    return entry;
  }
  private async source(
    asset: VideoAsset,
    original: Blob,
    entry: SourceEntry,
    options: RenderOptions,
  ): Promise<VideoFrameSource> {
    const identity = assetOriginalIdentity(asset);
    if (entry.source && entry.sourceIdentity === identity) return entry.source;
    await entry.source?.dispose();
    entry.source = null;
    const source = createVideoFrameSource({
      assetId: asset.id,
      contentRevision: asset.contentRevision,
      original,
      decodedBudget: this.decodedBudget,
      budgets: {
        maxCachedFrames: 2,
        maxDecodedBytes: 96 * 1024 * 1024,
        maxFrameBytes: 32 * 1024 * 1024,
        maxOpenBackends: 1,
      },
    });
    try {
      const started = performance.now(),
        metadata = await source.metadata();
      this.timings.metadataMs += performance.now() - started;
      this.record("metadata", started, asset.id, options.profileVideo);
      this.current(options);
      if (metadata.width !== asset.width || metadata.height !== asset.height)
        throw Error("Video display dimensions differ from their stored description.");
      entry.source = source;
      entry.sourceIdentity = identity;
      return source;
    } catch (error) {
      await source.dispose();
      throw error;
    }
  }

  async prepare(
    pageId: string,
    layers: readonly Layer[],
    assets: Record<string, Asset>,
    options: RenderOptions,
  ): Promise<void> {
    this.current(options);
    this.prepared.clear();
    this.proxies.configure(
      !!options.videoProxy && options.mediaMode !== "exact",
      options.videoProxy,
    );
    if (options.motionFrame && options.motionFrame.compositionId !== pageId)
      throw Error("Video frame plan belongs to another composition.");
    const required = new Set(
      layers
        .filter((layer) => layer.kind === "video")
        .map((layer) => {
          const asset = layer.assetId ? assets[layer.assetId] : undefined;
          if (!asset || !isVideoAsset(asset)) throw Error("Video layer has no video original.");
          return assetOriginalIdentity(asset);
        }),
    );
    this.proxies.retain(required);
    await this.rasterizer?.retainStreams(
      new Set(
        layers.filter((layer) => layer.kind === "video").map((layer) => `${pageId}:${layer.id}`),
      ),
    );
    const playing = new Set(
      options.mediaMode === "playback"
        ? layers.filter((layer) => layer.kind === "video").map((layer) => `${pageId}:${layer.id}`)
        : [],
    );
    if (playing.size > MAX_ACTIVE_ORIGINALS)
      throw Error("The active composition exceeds its eight-stream playback decoder budget.");
    for (const [key, entry] of this.playback) {
      if (this.resolver === options.mediaResolver && playing.has(key)) continue;
      this.playback.delete(key);
      await entry.cursor.dispose();
    }
    for (const [identity, entry] of this.sources) {
      if (this.resolver === options.mediaResolver && required.has(identity)) continue;
      this.sources.delete(identity);
      await entry.source?.dispose();
    }
    if (options.mediaMode === "playback")
      for (const entry of this.sources.values()) {
        await entry.source?.dispose();
        entry.source = null;
      }
    this.resolver = options.mediaResolver;
    if (required.size > MAX_ACTIVE_ORIGINALS)
      throw Error("The active composition exceeds its eight-original decoder budget.");
    const requests = new Map(
      options.motionFrame?.mediaRequests.map((request) => [request.layerId, request]),
    );
    for (const layer of layers) {
      if (layer.kind !== "video") continue;
      this.current(options);
      const asset = assets[layer.assetId!]!;
      if (!isVideoAsset(asset)) throw Error("Video layer original kind mismatch.");
      const request = requests.get(layer.id);
      if (options.motionFrame && (!request || request.assetId !== asset.id))
        throw Error("Video frame plan is missing or stale for this layer.");
      // Static or ordinary still exports have an explicit deterministic first-frame poster.
      let time = request?.sourceTime ?? asset.firstTimestamp;
      if (options.motionFrame?.terminalPreview && options.motionFrame.mode === "motion")
        time = subtractMotionTime(time, { value: 1, rate: 1_000_000 });
      const entry =
        this.sources.get(assetOriginalIdentity(asset)) ?? (await this.original(asset, options));
      let proxy =
        options.videoProxy && options.mediaMode !== "exact"
          ? this.proxies.read(asset, entry.original)
          : undefined;
      if (options.mediaMode === "playback") {
        if (entry.playbackProxy === undefined) entry.playbackProxy = proxy ?? null;
        proxy = entry.playbackProxy ?? undefined;
      } else entry.playbackProxy = undefined;
      const selected = proxy?.asset ?? asset,
        original = proxy?.original ?? entry.original;
      const identity = assetOriginalIdentity(selected),
        key = `video:${pageId}:${layer.id}`;
      const shift = proxy
        ? subtractMotionTime(asset.firstTimestamp, selected.firstTimestamp)
        : { value: 0, rate: 1 };
      const sampleTime = subtractMotionTime(time, shift);
      let target = this.cache.get<LayerTargets>(key);
      const cached = target && this.frames.get(target);
      if (cached && cached.identity !== identity)
        await this.rasterizer?.retireStream(`${pageId}:${layer.id}`);
      if (
        cached &&
        cached.identity === identity &&
        compareMotionTime(time, cached.start) >= 0 &&
        compareMotionTime(time, cached.end) < 0
      ) {
        this.timings.gpuReuses++;
        this.prepared.set(layer.id, {
          texture: target!.target("source", selected.width, selected.height).texture,
          stamp: cached.stamp,
        });
        continue;
      }
      const decodeStarted = performance.now();
      this.timings.requests++;
      let lease: VideoFrameLease | null;
      if (options.mediaMode === "playback") {
        const cursorKey = `${pageId}:${layer.id}`;
        let entry = this.playback.get(cursorKey);
        if (
          entry &&
          (entry.identity !== identity ||
            (entry.cursor.readTime() &&
              compareMotionTime(sampleTime, entry.cursor.readTime()!) < 0))
        ) {
          this.playback.delete(cursorKey);
          await entry.cursor.dispose();
          entry = undefined;
        }
        if (!entry) {
          entry = {
            identity,
            cursor: new VideoPlaybackCursor({
              assetId: asset.id,
              contentRevision: selected.contentRevision,
              original,
              decodedBudget: this.decodedBudget,
            }),
          };
          this.playback.set(cursorKey, entry);
        }
        try {
          const metadata = await entry.cursor.metadata();
          if (metadata.width !== selected.width || metadata.height !== selected.height)
            throw Error("Video playback dimensions differ from their immutable description.");
          lease = await entry.cursor.requestFrame(sampleTime, { signal: options.signal });
        } catch (error) {
          this.playback.delete(cursorKey);
          await entry.cursor.dispose();
          throw error;
        }
      } else {
        const source = await this.source(selected, original, entry, options);
        lease = await source.requestFrame(sampleTime, {
          mode: options.mediaMode ?? "preview",
          signal: options.signal,
        });
      }
      if (lease && proxy) lease = { ...lease, timestamp: addMotionTime(lease.timestamp, shift) };
      this.timings.decodeMs += performance.now() - decodeStarted;
      this.record("decode", decodeStarted, layer.id, options.profileVideo);
      try {
        this.current(options);
      } catch (error) {
        lease?.release();
        throw error;
      }
      if (!target) {
        target = new LayerTargets(this.maxDimension);
        this.cache.set(key, target);
      }
      let transferred = false;
      try {
        this.cache.ensureCapacity(
          key,
          target.projectedBytes("source", selected.width, selected.height),
        );
        const output = target.target("source", selected.width, selected.height);
        this.cache.synchronize(key);
        this.rasterizer ??= new VideoRasterizer(this.renderer, {
          reserveBytes: (bytes) => this.cache.reserveExternal("video-upload-textures", bytes),
        });
        if (lease) {
          const uploadStarted = performance.now();
          transferred = true;
          await this.rasterizer.render(
            lease,
            output,
            `${pageId}:${layer.id}`,
            options.profileVideo,
          );
          this.timings.prepareSubmissionMs += performance.now() - uploadStarted;
          this.record("prepareSubmission", uploadStarted, layer.id, options.profileVideo);
          this.uploads++;
        } else this.rasterizer.clear(output); // A genuine source gap has transparent coverage.
        this.current(options);
        const stamp = lease
          ? JSON.stringify([
              identity,
              lease.timestamp,
              lease.duration,
              lease.rotation,
              lease.flip,
              lease.pixelAspectRatio,
            ])
          : JSON.stringify([identity, "gap", time]);
        if (lease)
          this.frames.set(target, {
            identity,
            start: lease.timestamp,
            end: addMotionTime(lease.timestamp, lease.duration),
            stamp,
          });
        else this.frames.delete(target);
        this.prepared.set(layer.id, { texture: output.texture, stamp });
      } catch (error) {
        if (!transferred) lease?.release();
        this.frames.delete(target);
        throw error;
      }
    }
  }
  image(layerId: string): Texture {
    const entry = this.prepared.get(layerId);
    if (!entry) throw Error("Video GPU frame is unavailable.");
    return entry.texture;
  }
  stamp(layerId: string): string | null {
    return this.prepared.get(layerId)?.stamp ?? null;
  }
  stats() {
    return {
      originals: this.sources.size,
      sources: [...this.sources.values()].map((entry) => entry.source?.stats() ?? null),
      decoded: this.decodedBudget.stats(),
      proxies: this.proxies.stats(),
      playback: [...this.playback].map(([layer, entry]) => ({ layer, ...entry.cursor.stats() })),
      passes: this.rasterizer?.passes ?? 0,
      timings: { ...this.timings },
      uploads: this.rasterizer?.stats() ?? null,
      profile: Object.keys(this.profileSamples).length
        ? Object.fromEntries(
            Object.entries(this.profileSamples).map(([phase, samples]) => [phase, [...samples!]]),
          )
        : null,
    };
  }
  async settle(): Promise<void> {
    await this.rasterizer?.settle();
  }
  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.proxies.dispose();
    this.prepared.clear();
    const playback = [...this.playback.values()];
    this.playback.clear();
    const sources = [...this.sources.values()];
    this.sources.clear();
    const results = await Promise.allSettled([
      this.rasterizer?.dispose(),
      ...playback.map((entry) => entry.cursor.dispose()),
      ...sources.map((entry) => entry.source?.dispose()),
    ]);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Video source cleanup failed.",
      );
  }
}
