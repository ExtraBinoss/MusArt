import {
  createLayerGeometryIndex,
  isPublishedComposition,
  isPublishedAssets,
  type Asset,
  type Composition,
  type Layer,
} from "@musart/core";
import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import { ColorPipeline } from "../color/ColorPipeline";
import { GpuResourceCache } from "../cache/GpuResourceCache";
import { createSourceKeys } from "../cache/keys";
import { maskLayerMapping } from "./mask-binding";
import { EffectResources } from "./effect-resources";
import { VectorSources } from "../surface/vector/source";
import { TextureSources } from "../surface/TextureSources";
import { TextSources } from "../surface/text/source";
import type { FontResolver } from "../surface/text/fonts";
import { PrimitiveBatch } from "./primitives/batch";
import { isInstancedPrimitive, primitivePaintKey } from "./primitives/eligibility";
import { NormalBatch } from "./normal-batch";
import { GpuPasses } from "./passes";
import { LayerTargets } from "./targets";
import {
  assertRenderSize,
  rasterExtent,
  type FrameTexture,
  type GpuStats,
  type RenderOptions,
} from "./types";

interface RenderFrame {
  readonly page: Composition;
  readonly scale: number;
  readonly keyFor: (layer: Layer) => string;
  readonly referenceKeyFor: (layer: Layer) => string;
  readonly geometry: ReturnType<typeof createLayerGeometryIndex>;
}

/** Retained GPU graph. Only font/image preparation awaits; all GPU submissions are synchronous. */
export class GpuCompositor {
  private readonly cache: GpuResourceCache;
  private readonly sources: TextureSources;
  private readonly texts: TextSources;
  private effects: EffectResources | null = null;
  private passes: GpuPasses | null = null;
  private normal: NormalBatch | null = null;
  private primitives: PrimitiveBatch | null = null;
  private readonly normalIds = new Set<string>();
  private vectors: VectorSources | null = null;
  private color: ColorPipeline | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private disposal: Promise<void> | null = null;
  private frames = 0;
  private cacheHits = 0;
  private retainedRoot = "";
  private readonly retainedInputs = new WeakMap<
    LayerTargets,
    {
      page: WeakRef<Composition>;
      assets: WeakRef<Record<string, Asset>>;
    }
  >();

  constructor(
    private readonly renderer: WebGPURenderer,
    options: { maxBytes?: number; fontResolver?: FontResolver } = {},
  ) {
    this.cache = new GpuResourceCache(options.maxBytes);
    this.sources = new TextureSources(this.cache);
    this.texts = new TextSources(renderer, this.cache, { fontResolver: options.fontResolver });
  }

  /** Exact immutable-input hit inside the existing GPU LRU; no allocation, upload or readback. */
  retainedFrame(
    page: Composition,
    assets: Record<string, Asset>,
    scale: number,
  ): FrameTexture | null {
    if (this.disposed || !isPublishedComposition(page) || !isPublishedAssets(assets)) return null;
    const key = `page:${page.id}:${scale}`,
      entry = this.cache.get<LayerTargets>(key);
    const input = entry && this.retainedInputs.get(entry);
    if (
      !entry?.signature ||
      !entry.output ||
      !input ||
      input.page.deref() !== page ||
      input.assets.deref() !== assets
    )
      return null;
    this.retainedRoot = key;
    this.cacheHits++;
    return entry.output;
  }

  /** A hidden display no longer pins its previous artboard against the bounded LRU. */
  releasePresentation(): void {
    this.retainedRoot = "";
  }

  render(
    page: Composition,
    assets: Record<string, Asset>,
    options: Pick<RenderOptions, "scale" | "canRender"> = {},
  ): Promise<FrameTexture> {
    if (this.disposed) return Promise.reject(new Error("Le compositeur GPU est fermé."));
    const job = this.queue.then(async () => {
      const scale = options.scale ?? 1;
      assertRenderSize(page, scale);
      this.cache.beginFrame(this.retainedRoot);
      this.cache.get("shared-effects");
      this.cache.get("shared-primitives");
      if (options.canRender && !options.canRender())
        throw new DOMException("Rendering deferred.", "AbortError");
      await this.sources.prepare(page, assets);
      await this.texts.prepare(page);
      if (options.canRender && !options.canRender())
        throw new DOMException("Rendering deferred.", "AbortError");
      if (this.disposed) throw new Error("Le compositeur GPU est fermé.");
      // No await below this point: R3F cannot observe intermediate targets or altered state.
      this.passes ??= new GpuPasses(this.renderer);
      this.normal ??= new NormalBatch(this.renderer);
      this.vectors ??= new VectorSources(this.renderer, this.cache);
      this.color ??= new ColorPipeline(this.renderer);
      if (!this.effects) {
        this.effects = new EffectResources(this.renderer);
        this.cache.set("shared-effects", this.effects);
      }
      if (!this.primitives) {
        this.primitives = new PrimitiveBatch(this.renderer);
        this.cache.set("shared-primitives", this.primitives);
      }
      const geometry = createLayerGeometryIndex(page);
      const frame: RenderFrame = {
        page,
        scale,
        keyFor: createSourceKeys(page, assets, scale, { geometry }),
        referenceKeyFor: createSourceKeys(page, assets, 1, { geometry }),
        geometry,
      };
      const { keyFor } = frame;
      const rootKey = `page:${page.id}:${scale}`;
      const entry = this.entry(rootKey);
      const roots = geometry.children(null);
      const signature = JSON.stringify([
        page.width,
        page.height,
        page.background,
        page.colorSpace ?? "srgb",
        roots.map((layer) => [
          layer.id,
          layer.x,
          layer.y,
          layer.rotation,
          layer.opacity,
          layer.visible,
          layer.blendMode,
          isInstancedPrimitive(layer) ? primitivePaintKey(layer) : keyFor(layer),
        ]),
      ]);
      if (entry.signature === signature && entry.output) {
        this.cacheHits++;
        this.frames++;
        this.retainedRoot = rootKey;
        this.rememberInput(entry, page, assets);
        return entry.output;
      }
      entry.signature = "";
      this.normalIds.clear();
      const composed = this.children(
        null,
        page.width,
        page.height,
        page.background,
        entry,
        rootKey,
        frame,
      );
      const target = this.target(entry, rootKey, "presentation", composed.width, composed.height);
      if (page.colorSpace === "display-p3") this.color.render(composed, target, "to-srgb");
      else if (page.colorSpace === "cmyk-proof") this.color.render(composed, target, "cmyk-proof");
      else this.passes.copyTo(composed, target);
      entry.output = {
        texture: target.texture,
        width: target.width,
        height: target.height,
        premultiplied: true,
      };
      entry.signature = signature;
      this.retainedRoot = rootKey;
      this.rememberInput(entry, page, assets);
      this.frames++;
      this.normal.retain(this.normalIds);
      return entry.output;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  private rememberInput(
    entry: LayerTargets,
    page: Composition,
    assets: Record<string, Asset>,
  ): void {
    if (isPublishedComposition(page) && isPublishedAssets(assets))
      this.retainedInputs.set(entry, { page: new WeakRef(page), assets: new WeakRef(assets) });
    else this.retainedInputs.delete(entry);
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
    mipmapped = false,
  ): RenderTarget {
    this.cache.ensureCapacity(key, entry.projectedBytes(role, width, height, mipmapped));
    const target = entry.target(role, width, height, mipmapped);
    this.cache.synchronize(key);
    return target;
  }
  private layer(layer: Layer, frame: RenderFrame): FrameTexture {
    const reference = layer.effects.some((effect) => effect.enabled) || !!layer.mask?.enabled;
    // Effects and masks consume the same authored reference pixels in every
    // caller. Output density changes sampling of this plane, never its content.
    if (reference && frame.scale !== 1)
      frame = { ...frame, scale: 1, keyFor: frame.referenceKeyFor };
    const { page, scale, keyFor, geometry } = frame;
    const key = `layer:${page.id}:${layer.id}:${scale}`;
    const entry = this.entry(key);
    const signature = keyFor(layer);
    if (entry.signature === signature && entry.output) {
      this.cacheHits++;
      return entry.output;
    }
    entry.signature = "";
    const width = rasterExtent(layer.width, scale);
    const height = rasterExtent(layer.height, scale);
    let source: FrameTexture;
    if (layer.kind === "group")
      source = this.children(layer.id, layer.width, layer.height, "transparent", entry, key, frame);
    else if (layer.kind === "image")
      source = { texture: this.sources.image(layer.assetId), width, height, premultiplied: false };
    else if (layer.kind === "text") {
      const target = this.target(entry, key, "text", width, height);
      this.passes!.clear(target);
      this.texts.render(layer, target);
      source = {
        texture: target.texture,
        width,
        height,
        premultiplied: true,
      };
    } else if (layer.kind === "vector") {
      const target = this.target(entry, key, "vector", width, height);
      this.passes!.clear(target);
      this.vectors!.render(layer, target, page.colorSpace === "display-p3");
      source = { texture: target.texture, width, height, premultiplied: true };
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
    if (page.colorSpace === "display-p3" && layer.kind === "image") {
      const converted = this.target(entry, key, "working-color", width, height);
      this.color!.render(source, converted, "to-p3");
      source = { ...source, texture: converted.texture };
    }
    if (layer.effects.some((effect) => effect.enabled)) {
      if (source.premultiplied) {
        const straight = this.target(entry, key, "straight", width, height);
        this.passes!.copyTo(source, straight, true);
        source = { texture: straight.texture, width, height, premultiplied: false };
      }
      const output = this.target(entry, key, "effects", width, height);
      const effects = layer.effects;
      this.cache.ensureCapacity(
        "shared-effects",
        this.effects!.projectedBytes(width, height, effects),
      );
      let texture;
      try {
        texture = this.effects!.apply(source.texture, width, height, effects, output, {
          width: layer.width,
          height: layer.height,
        });
      } finally {
        this.cache.synchronize("shared-effects");
      }

      source = { texture, width, height, premultiplied: false };
    }
    if (layer.mask?.enabled) {
      const target = this.target(entry, key, "mask", width, height);
      const mask = layer.mask;
      if (mask.assetId)
        this.passes!.maskTo(source, this.sources.image(mask.assetId), mask.inverted, target, {
          luminance: mask.mode === "luminance",
        });
      else if (mask.layerId) {
        const maskLayer = geometry.byId.get(mask.layerId);
        if (!maskLayer) throw new Error(`Calque masque introuvable : ${mask.layerId}`);
        const mapping = maskLayerMapping(page, layer, maskLayer, false);
        const content = mapping.opacity > 0 ? this.layer(maskLayer, frame) : source;
        this.passes!.maskTo(source, content.texture, mask.inverted, target, {
          ...mapping,
          premultiplied: content.premultiplied,
        });
      } else throw new Error("Source de masque absente.");
      source = { ...source, texture: target.texture };
    }
    if (reference) {
      const filtered = this.target(entry, key, "reference", width, height, true);
      this.passes!.copyTo(source, filtered, false, !source.premultiplied);
      source = { texture: filtered.texture, width, height, premultiplied: true };
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
    frame: RenderFrame,
  ): FrameTexture {
    const { scale, geometry } = frame;
    const pixelWidth = rasterExtent(width, scale);
    const pixelHeight = rasterExtent(height, scale);
    let target = this.target(entry, key, "children-a", pixelWidth, pixelHeight);
    this.passes!.clear(target, background);
    const layers = geometry.children(parentId);
    let batch: { layer: Layer; source: FrameTexture }[] = [],
      primitiveRun: Layer[] = [];
    const flush = () => {
      this.normal!.draw(batch, width, height, target);
      for (const { layer } of batch) this.normalIds.add(layer.id);
      batch = [];
    };
    const flushPrimitives = () => {
      if (!primitiveRun.length) return;
      this.cache.ensureCapacity(
        "shared-primitives",
        this.primitives!.projectedBytes(primitiveRun.length),
      );
      try {
        this.primitives!.draw(primitiveRun, width, height, scale, target);
      } finally {
        this.cache.synchronize("shared-primitives");
      }
      primitiveRun = [];
    };
    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0 || layer.maskSource) continue;
      if (isInstancedPrimitive(layer)) {
        flush();
        primitiveRun.push(layer);
        continue;
      }
      flushPrimitives();
      const source = this.layer(layer, frame);
      if (layer.blendMode === "normal") {
        batch.push({ layer, source });
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
      this.passes!.blendTo(target.texture, source, layer, width, height, next);
      target = next;
    }
    flushPrimitives();
    flush();
    return { texture: target.texture, width: pixelWidth, height: pixelHeight, premultiplied: true };
  }
  stats(): GpuStats {
    const cache = this.cache.stats();
    const effects = this.effects?.stats();
    return {
      passes:
        (this.passes?.passes ?? 0) +
        (this.normal?.passes ?? 0) +
        (this.primitives?.passes ?? 0) +
        (this.vectors?.passes ?? 0) +
        this.texts.passes +
        (this.color?.passes ?? 0) +
        (effects?.passes ?? 0),
      readbacks: 0,
      uploads: this.sources.uploads + this.texts.parses,
      targets: cache.targets,
      cacheBytes: cache.cacheBytes,
      frames: this.frames,
      cacheHits: this.cacheHits,
      vectorParses: this.vectors?.parses ?? 0,
      maxBytes: cache.maxBytes,
      primitiveDraws: this.primitives?.passes ?? 0,
      primitiveInstances: this.primitives?.instances ?? 0,
      primitiveBytes: this.primitives?.bytes ?? 0,
    };
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.queue.then(() => {
      this.cache.clear();
      this.passes?.dispose();
      this.normal?.dispose();
      this.color?.dispose();
      this.texts.dispose();
      this.effects = null;
      this.passes = null;
      this.normal = null;
      this.primitives = null;
      this.normalIds.clear();
      this.vectors = null;
      this.color = null;
    });
    return this.disposal;
  }
}
