import { isVideoAsset, isImageAsset, type Asset, type Composition, type Layer } from "@musart/core";
import { LinearFilter, NoColorSpace, Texture, type WebGPURenderer } from "three/webgpu";
import { assetIdentity } from "../cache/keys";
import { GpuResourceCache, type GpuResource } from "../cache/GpuResourceCache";
import { loadAsset } from "./sources";
import { MediaVideoSources } from "../sources/media/video-sources";
import type { RenderOptions } from "../compositing/types";
import { assertTextureSize } from "../cache/texture-limits";

class ImageResource implements GpuResource {
  readonly targets = 0;
  readonly bytes: number;
  constructor(
    readonly texture: Texture,
    width: number,
    height: number,
  ) {
    this.bytes = width * height * 4;
  }
  dispose(): void {
    this.texture.dispose();
  }
}
function configure(texture: Texture): Texture {
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
export class TextureSources {
  private imageUploads = 0;
  private videos: MediaVideoSources | null = null;
  get uploads(): number {
    return this.imageUploads + (this.videos?.uploads ?? 0);
  }
  private readonly prepared = new Map<string, Texture>();
  constructor(
    private readonly cache: GpuResourceCache,
    private readonly maxDimension: number,
    private readonly renderer?: WebGPURenderer,
  ) {}
  async prepare(
    page: Composition,
    assets: Record<string, Asset>,
    options: RenderOptions = {},
  ): Promise<void> {
    this.prepared.clear();
    const byParent = new Map<string | null, Layer[]>();
    for (const layer of page.layers) {
      const siblings = byParent.get(layer.parentId) ?? [];
      siblings.push(layer);
      byParent.set(layer.parentId, siblings);
    }
    const visible: Layer[] = [],
      futureVideos: Layer[] = [];
    const motion = page.motion?.mode === "motion";
    const parents = [{ id: null as string | null, transparent: false }];
    while (parents.length) {
      const parent = parents.pop()!;
      for (const layer of byParent.get(parent.id) ?? []) {
        if (!layer.visible) continue;
        const transparent = parent.transparent || layer.opacity === 0;
        if (layer.kind === "group" && (!transparent || motion))
          parents.push({ id: layer.id, transparent });
        if (transparent) {
          if (motion && layer.kind === "video") futureVideos.push(layer);
          continue;
        }
        visible.push(layer);
      }
    }
    // Prepare real posters/pipelines before an opacity-keyed first appearance, within the same
    // four-stream budget. Actual compositing still uses the authored/evaluated opacity unchanged.
    visible.push(
      ...futureVideos.slice(
        0,
        Math.max(0, 4 - visible.filter((layer) => layer.kind === "video").length),
      ),
    );
    const active = new Set(
      visible
        .flatMap((layer) => [layer.assetId, layer.mask?.enabled ? layer.mask.assetId : null])
        .filter((id): id is string => !!id),
    );
    for (const id of active) {
      const asset = assets[id];
      if (!asset) throw new Error(`Ressource introuvable : ${id}`);
      if (isVideoAsset(asset)) {
        if (visible.some((layer) => layer.mask?.enabled && layer.mask.assetId === id))
          throw Error("A timed video mask must reference a video layer, not an untimed asset.");
        continue;
      }
      if (!isImageAsset(asset)) throw Error("Audio originals cannot be visual texture sources.");
      const key = `asset:${assetIdentity(asset)}`;
      let entry = this.cache.get<ImageResource>(key);
      if (!entry) {
        const image = await loadAsset(asset);
        const width = image.naturalWidth || asset.width,
          height = image.naturalHeight || asset.height;
        assertTextureSize(width, height, this.maxDimension);
        entry = new ImageResource(configure(new Texture(image)), width, height);
        this.cache.set(key, entry);
        this.imageUploads++;
      }
      this.prepared.set(id, entry.texture);
    }
    if (visible.some((layer) => layer.kind === "video")) {
      if (!this.renderer) throw Error("Video textures require an initialized Three.js renderer.");
      this.videos ??= new MediaVideoSources(this.renderer, this.cache, this.maxDimension);
    }
    await this.videos?.prepare(page.id, visible, assets, options);
  }
  videoStamp(layerId: string): string | null {
    return this.videos?.stamp(layerId) ?? null;
  }
  videoStats() {
    return this.videos?.stats() ?? null;
  }
  async settle(): Promise<void> {
    await this.videos?.settle();
  }
  async dispose(): Promise<void> {
    this.prepared.clear();
    await this.videos?.dispose();
  }
  image(assetId: string | null, videoLayerId?: string): Texture {
    if (videoLayerId) {
      if (!this.videos) throw Error("Video GPU frame is unavailable.");
      return this.videos.image(videoLayerId);
    }
    const texture = assetId ? this.prepared.get(assetId) : undefined;
    if (!texture) throw new Error("Image GPU introuvable.");
    return texture;
  }
}
