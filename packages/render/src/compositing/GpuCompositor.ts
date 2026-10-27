import type { Asset, Composition, Layer } from "@musart/core";
import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import { GpuResourceCache } from "../cache/GpuResourceCache";
import { sourceKey } from "../cache/keys";
import { EffectResources } from "./effect-resources";
import { TextureSources } from "../surface/TextureSources";
import { NormalBatch } from "./normal-batch";
import { GpuPasses } from "./passes";
import { LayerTargets } from "./targets";
import { assertRenderSize, type FrameTexture, type GpuStats, type RenderOptions } from "./types";

/** Retained GPU graph. Only font/image preparation awaits; all GPU submissions are synchronous. */
export class GpuCompositor {
  private readonly cache: GpuResourceCache;
  private readonly sources: TextureSources;
  private effects: EffectResources | null = null;
  private passes: GpuPasses | null = null;
  private normal: NormalBatch | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private disposal: Promise<void> | null = null;
  private frames = 0;
  private cacheHits = 0;
  private retainedRoot = "";

  constructor(
    private readonly renderer: WebGPURenderer,
    options: { maxBytes?: number } = {},
  ) {
    this.cache = new GpuResourceCache(options.maxBytes);
    this.sources = new TextureSources(this.cache);
  }

  render(
    page: Composition,
    assets: Record<string, Asset>,
    options: Pick<RenderOptions, "scale"> = {},
  ): Promise<FrameTexture> {
    if (this.disposed) return Promise.reject(new Error("Le compositeur GPU est fermé."));
    const job = this.queue.then(async () => {
      const scale = options.scale ?? 1;
      assertRenderSize(page, scale);
      this.cache.beginFrame(this.retainedRoot);
      this.cache.get("shared-effects");
      await this.sources.prepare(page, assets);
      if (this.disposed) throw new Error("Le compositeur GPU est fermé.");
      // No await below this point: R3F cannot observe intermediate targets or altered state.
      this.passes ??= new GpuPasses(this.renderer);
      this.normal ??= new NormalBatch(this.renderer);
      if (!this.effects) {
        this.effects = new EffectResources(this.renderer);
        this.cache.set("shared-effects", this.effects);
      }
      const rootKey = `page:${page.id}:${scale}`;
      const entry = this.entry(rootKey);
      const roots = page.layers.filter((layer) => layer.parentId === null);
      const signature = JSON.stringify([
        page.width,
        page.height,
        page.background,
        roots.map((layer) => [
          layer.id,
          layer.x,
          layer.y,
          layer.rotation,
          layer.opacity,
          layer.visible,
          layer.blendMode,
          sourceKey(layer, page, assets, scale),
        ]),
      ]);
      if (entry.signature === signature && entry.output) {
        this.cacheHits++;
        this.frames++;
        this.retainedRoot = rootKey;
        return entry.output;
      }
      entry.signature = "";
      const composed = this.children(
        null,
        page.width,
        page.height,
        page.background,
        entry,
        rootKey,
        page,
        assets,
        scale,
      );
      const target = this.target(entry, rootKey, "presentation", composed.width, composed.height);
      this.passes.copyTo(composed, target);
      entry.output = {
        texture: target.texture,
        width: target.width,
        height: target.height,
        premultiplied: true,
      };
      entry.signature = signature;
      this.retainedRoot = rootKey;
      this.frames++;
      this.normal.retain(new Set(page.layers.map((layer) => layer.id)));
      return entry.output;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  private entry(key: string): LayerTargets {
    let entry = this.cache.get<LayerTargets>(key);
    if (!entry) {
      entry = new LayerTargets();
      this.cache.set(key, entry);
    }
    return entry;
  }
  private target(
    entry: LayerTargets,
    key: string,
    role: string,
    width: number,
    height: number,
  ): RenderTarget {
    this.cache.ensureCapacity(key, entry.projectedBytes(role, width, height));
    const target = entry.target(role, width, height);
    this.cache.synchronize(key);
    return target;
  }
  private layer(
    layer: Layer,
    page: Composition,
    assets: Record<string, Asset>,
    scale: number,
  ): FrameTexture {
    const key = `layer:${page.id}:${layer.id}:${scale}`;
    const entry = this.entry(key);
    const signature = sourceKey(layer, page, assets, scale);
    if (entry.signature === signature && entry.output) {
      this.cacheHits++;
      return entry.output;
    }
    entry.signature = "";
    const width = Math.max(1, Math.ceil(layer.width * scale));
    const height = Math.max(1, Math.ceil(layer.height * scale));
    let source: FrameTexture;
    if (layer.kind === "group")
      source = this.children(
        layer.id,
        layer.width,
        layer.height,
        "transparent",
        entry,
        key,
        page,
        assets,
        scale,
      );
    else if (layer.kind === "image")
      source = { texture: this.sources.image(layer.assetId), width, height, premultiplied: false };
    else if (layer.kind === "text") {
      source = {
        texture: this.sources.text(layer, scale, entry),
        width,
        height,
        premultiplied: false,
      };
      this.cache.synchronize(key);
    } else {
      const target = this.target(entry, key, "shape", width, height);
      const paint = JSON.stringify([
        layer.kind,
        layer.width,
        layer.height,
        layer.fill,
        layer.stroke,
        layer.strokeWidth,
        layer.radius,
        scale,
      ]);
      if (entry.sourceSignature !== paint) {
        this.passes!.shapeTo(layer, scale, target);
        entry.sourceSignature = paint;
      }
      source = { texture: target.texture, width, height, premultiplied: false };
    }
    if (layer.effects.some((effect) => effect.enabled)) {
      if (source.premultiplied) {
        const straight = this.target(entry, key, "straight", width, height);
        this.passes!.copyTo(source, straight, true);
        source = { texture: straight.texture, width, height, premultiplied: false };
      }
      const output = this.target(entry, key, "effects", width, height);
      const effects = layer.effects.map((effect) => ({ ...effect, scale: effect.scale * scale }));
      this.cache.ensureCapacity(
        "shared-effects",
        this.effects!.projectedBytes(width, height, effects),
      );
      let texture;
      try {
        texture = this.effects!.apply(source.texture, width, height, effects, output);
      } finally {
        this.cache.synchronize("shared-effects");
      }

      source = { texture, width, height, premultiplied: false };
    }
    if (layer.mask?.enabled) {
      const target = this.target(entry, key, "mask", width, height);
      this.passes!.maskTo(
        source,
        this.sources.image(layer.mask.assetId),
        layer.mask.inverted,
        target,
      );
      source = { ...source, texture: target.texture };
    }
    entry.output = source;
    entry.signature = signature;
    return source;
  }

  private children(
    parentId: string | null,
    width: number,
    height: number,
    background: string,
    entry: LayerTargets,
    key: string,
    page: Composition,
    assets: Record<string, Asset>,
    scale: number,
  ): FrameTexture {
    const pixelWidth = Math.max(1, Math.ceil(width * scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    let target = this.target(entry, key, "children-a", pixelWidth, pixelHeight);
    this.passes!.clear(target, background);
    const items = page.layers
      .filter((layer) => layer.parentId === parentId && layer.visible && layer.opacity > 0)
      .map((layer) => ({ layer, source: this.layer(layer, page, assets, scale) }));
    let batch: typeof items = [];
    const flush = () => {
      this.normal!.draw(batch, width, height, target);
      batch = [];
    };
    for (const item of items) {
      if (item.layer.blendMode === "normal") {
        batch.push(item);
        continue;
      }
      flush();
      const next = this.target(
        entry,
        key,
        target === entry.target("children-a", pixelWidth, pixelHeight)
          ? "children-b"
          : "children-a",
        pixelWidth,
        pixelHeight,
      );
      this.passes!.blendTo(target.texture, item.source, item.layer, width, height, next);
      target = next;
    }
    flush();
    return { texture: target.texture, width: pixelWidth, height: pixelHeight, premultiplied: true };
  }
  stats(): GpuStats {
    const cache = this.cache.stats();
    const effects = this.effects?.stats();
    return {
      passes: (this.passes?.passes ?? 0) + (this.normal?.passes ?? 0) + (effects?.passes ?? 0),
      readbacks: 0,
      uploads: this.sources.uploads,
      targets: cache.targets,
      cacheBytes: cache.cacheBytes,
      frames: this.frames,
      cacheHits: this.cacheHits,
      maxBytes: cache.maxBytes,
    };
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.queue.then(() => {
      this.cache.clear();
      this.passes?.dispose();
      this.normal?.dispose();
      this.effects = null;
      this.passes = null;
      this.normal = null;
    });
    return this.disposal;
  }
}
